"""
Gyana AI — FastAPI Backend v2
"""

import os, tempfile
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional
from groq import Groq

from app.services.rag_service import (
    stream_agentic, ask_agentic,
    stream_general, ask_general,
    clear_history, get_history,
    ingest_document, query_documents, delete_documents,
)

groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))

app = FastAPI(title="Gyana AI", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class AskRequest(BaseModel):
    question: str
    user_id:  str = "default"
    context:  Optional[str] = None

class ClearRequest(BaseModel):
    user_id: str = "default"

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"status": "Gyana AI running", "version": "2.0.0"}

@app.get("/health")
async def health():
    return {"status": "ok"}

# ── Main agentic stream ───────────────────────────────────────────────────────
@app.post("/ask/stream")
async def ask_stream(req: AskRequest):
    context_docs = ""
    try:
        context_docs = await query_documents(req.question, req.user_id)
    except: pass

    async def generate():
        async for chunk in stream_agentic(req.question, req.user_id, context_docs):
            yield chunk

    return StreamingResponse(generate(), media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no","Access-Control-Allow-Origin":"*"})

# ── General AI stream (no docs) ───────────────────────────────────────────────
@app.post("/ask-general/stream")
async def ask_general_stream(req: AskRequest):
    async def generate():
        async for chunk in stream_agentic(req.question, req.user_id):
            yield chunk
    return StreamingResponse(generate(), media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no","Access-Control-Allow-Origin":"*"})

# ── Non-streaming ─────────────────────────────────────────────────────────────
@app.post("/ask")
async def ask(req: AskRequest):
    context_docs = ""
    try: context_docs = await query_documents(req.question, req.user_id)
    except: pass
    return await ask_agentic(req.question, req.user_id, context_docs)

@app.post("/ask-general")
async def ask_general_ep(req: AskRequest):
    return await ask_agentic(req.question, req.user_id)

# ── Document upload ───────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_document(file: UploadFile = File(...), request: Request = None):
    user_id  = request.headers.get("x-user-id","default") if request else "default"
    contents = await file.read()
    try:
        result = await ingest_document(contents, file.filename, user_id)
        return {"message":"Document indexed","filename":file.filename,
                "chunks_created":result.get("chunks",0),"detected_language":result.get("language","en")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Delete documents ──────────────────────────────────────────────────────────
@app.delete("/documents")
async def delete_docs(request: Request):
    user_id = request.headers.get("x-user-id","default")
    try: await delete_documents(user_id)
    except: pass
    return {"message":"Documents cleared"}

# ── Clear memory ──────────────────────────────────────────────────────────────
@app.post("/clear-memory")
async def clear_mem(req: ClearRequest):
    clear_history(req.user_id)
    return {"message":"Memory cleared"}

# ── Transcribe audio ──────────────────────────────────────────────────────────
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), request: Request = None):
    contents = await file.read()
    ext      = os.path.splitext(file.filename or "")[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(contents); tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as af:
            t = groq_client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=(file.filename or f"audio{ext}", af),
                response_format="text",
            )
        text = t if isinstance(t, str) else t.text
        return {"text": text, "transcription": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try: os.unlink(tmp_path)
        except: pass

# ── Speech query (mic button) ─────────────────────────────────────────────────
@app.post("/speech-query")
async def speech_query(file: UploadFile = File(...), request: Request = None):
    user_id  = request.headers.get("x-user-id","default") if request else "default"
    contents = await file.read()
    ext      = os.path.splitext(file.filename or "")[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(contents); tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as af:
            t = groq_client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=(file.filename or f"audio{ext}", af),
                response_format="text",
            )
        question = t if isinstance(t, str) else t.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try: os.unlink(tmp_path)
        except: pass

    result = await ask_agentic(question, user_id)
    return {"transcribed_question": question, "answer": result["answer"], "sources": result.get("sources",[])}