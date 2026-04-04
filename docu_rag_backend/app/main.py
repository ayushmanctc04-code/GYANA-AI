"""
Vedrix backend application.
"""

from __future__ import annotations

import os
import tempfile
from typing import Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.rag_service import (
    ask_agentic,
    ask_general,
    clear_history,
    detect_language_code,
    delete_documents,
    ingest_document,
    query_documents,
    stream_agentic,
    stream_general,
)
from app.services.speech_service import speech_provider_status, transcribe_audio_detailed
from app.services.vector_store import get_stats

app = FastAPI(
    title="Vedrix Workspace API",
    version="3.0.0",
    description="All-in-one chat, voice, document intelligence, and agentic tooling backend.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    user_id: str = "default"
    context: Optional[str] = None
    mode: Literal["auto", "general", "docs"] = "auto"
    language: str = "auto"
    focus: str = "adaptive"
    response_style: str = "balanced"


class ClearRequest(BaseModel):
    user_id: str = "default"


def _user_id_from_request(request: Optional[Request]) -> str:
    return request.headers.get("x-user-id", "default") if request else "default"


async def _resolve_document_context(question: str, user_id: str, mode: str) -> str:
    if mode == "general":
        return ""
    try:
        return await query_documents(question, user_id)
    except Exception:
        return ""


def _stream_response(generator):
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.get("/")
async def root():
    return {
        "status": "Vedrix running",
        "version": "3.0.0",
        "product": "all-in-one-ai-workspace",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/capabilities")
async def capabilities():
    return {
        "product_name": "Vedrix Workspace",
        "version": "3.0.0",
        "chat_modes": ["auto", "general", "docs"],
        "features": [
            "streaming_chat",
            "document_rag",
            "voice_transcription",
            "web_search_tools",
            "image_generation",
            "code_execution",
            "memory",
        ],
        "providers": {
            "llm": os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
            "llm_backup": os.environ.get("HF_CHAT_MODEL", "meta-llama/Llama-3.1-8B-Instruct"),
            "voice": speech_provider_status(),
            "vector_store": "Supabase pgvector",
        },
    }


@app.get("/documents/stats")
async def document_stats(request: Request):
    user_id = _user_id_from_request(request)
    try:
        return get_stats(user_id=user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/ask/stream")
async def ask_stream(req: AskRequest):
    context_docs = await _resolve_document_context(req.question, req.user_id, req.mode)

    async def generate():
        if req.mode == "general":
            async for chunk in stream_general(
                req.question,
                req.user_id,
                req.language,
                req.focus,
                req.response_style,
            ):
                yield chunk
            return

        async for chunk in stream_agentic(
            req.question,
            req.user_id,
            context_docs,
            req.language,
            req.focus,
            req.response_style,
        ):
            yield chunk

    return _stream_response(generate())


@app.post("/ask-general/stream")
async def ask_general_stream(req: AskRequest):
    async def generate():
        async for chunk in stream_general(
            req.question,
            req.user_id,
            req.language,
            req.focus,
            req.response_style,
        ):
            yield chunk

    return _stream_response(generate())


@app.post("/ask")
async def ask(req: AskRequest):
    context_docs = await _resolve_document_context(req.question, req.user_id, req.mode)
    if req.mode == "general":
        return await ask_general(
            req.question,
            req.user_id,
            req.language,
            req.focus,
            req.response_style,
        )
    return await ask_agentic(
        req.question,
        req.user_id,
        context_docs,
        req.language,
        req.focus,
        req.response_style,
    )


@app.post("/ask-general")
async def ask_general_ep(req: AskRequest):
    return await ask_general(
        req.question,
        req.user_id,
        req.language,
        req.focus,
        req.response_style,
    )


@app.post("/upload")
async def upload_document(file: UploadFile = File(...), request: Request = None):
    user_id = _user_id_from_request(request)
    contents = await file.read()
    try:
        result = await ingest_document(contents, file.filename, user_id)
        stats = get_stats(user_id=user_id)
        return {
            "message": "Document indexed",
            "filename": file.filename,
            "chunks_created": result.get("chunks", 0),
            "detected_language": result.get("language", "en"),
            "stats": stats,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.delete("/documents")
async def delete_docs(request: Request):
    user_id = _user_id_from_request(request)
    try:
        await delete_documents(user_id)
    except Exception:
        pass
    return {"message": "Documents cleared", "stats": {"total_chunks": 0, "total_documents": 0, "documents": []}}


@app.post("/clear-memory")
async def clear_mem(req: ClearRequest):
    clear_history(req.user_id)
    return {"message": "Memory cleared"}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language_hint: str = Form("auto"),
    prompt_hint: str = Form(""),
):
    contents = await file.read()
    ext = os.path.splitext(file.filename or "")[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = transcribe_audio_detailed(
            tmp_path,
            language_hint=language_hint,
            prompt_hint=prompt_hint,
        )
        text = result["text"]
        return {
            "text": text,
            "transcription": text,
            "language": detect_language_code(text, fallback="en"),
            "provider": result["provider"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@app.post("/speech-query")
async def speech_query(
    file: UploadFile = File(...),
    request: Request = None,
    language_hint: str = Form("auto"),
    prompt_hint: str = Form(""),
):
    user_id = _user_id_from_request(request)
    contents = await file.read()
    ext = os.path.splitext(file.filename or "")[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = transcribe_audio_detailed(
            tmp_path,
            language_hint=language_hint,
            prompt_hint=prompt_hint,
        )
        question = result["text"]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    context_docs = await _resolve_document_context(question, user_id, "auto")
    detected_language = detect_language_code(question, fallback="en")
    result = await ask_agentic(question, user_id, context_docs, detected_language)
    return {
        "transcribed_question": question,
        "detected_language": detected_language,
        "transcription_provider": result["provider"],
        "answer": result["answer"],
        "sources": result.get("sources", []),
        "answer_language": result.get("language", detected_language),
    }
