# =============================================================================
#  Gyana AI  –  FastAPI Backend
#  Production-ready: typed responses, proper error handling, SSE streaming,
#  request validation, lifespan management, structured logging
# =============================================================================

from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.services.document_service import extract_text
from app.services.language_service import detect_language
from app.services.ocr_service import extract_text_from_image
from app.services.rag_service import ask_question, stream_answer
from app.services.speech_service import transcribe_audio
from app.services.vector_store import add_documents, clear_store, get_stats

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("gyana")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
UPLOAD_DIR = Path("uploads")

SUPPORTED_DOCS   = {".pdf", ".docx", ".pptx", ".txt"}
SUPPORTED_IMAGES = {".png", ".jpg", ".jpeg"}
SUPPORTED_AUDIO  = {".mp3", ".wav", ".m4a", ".webm"}
ALL_SUPPORTED    = SUPPORTED_DOCS | SUPPORTED_IMAGES | SUPPORTED_AUDIO

MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    UPLOAD_DIR.mkdir(exist_ok=True)
    log.info("Gyana AI backend started ✓")
    yield
    for f in UPLOAD_DIR.glob("*"):
        try:
            f.unlink()
        except Exception:
            pass
    log.info("Gyana AI backend shut down ✓")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Gyana AI",
    description="Multi-Modal Document Intelligence – RAG API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class UploadResponse(BaseModel):
    filename: str
    file_type: str
    detected_language: str
    chunks_created: int
    message: str


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    user_id:  str = Field(default="default")


class AskResponse(BaseModel):
    answer: str
    sources: list[str] = []
    chunks_used: int = 0
    detected_language: Optional[str] = None


class GeneralAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    user_id:  str = Field(default="default")


class SpeechQueryResponse(BaseModel):
    transcribed_question: str
    answer: str
    sources: list[str] = []


class StatsResponse(BaseModel):
    total_chunks: int
    total_documents: int
    documents: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _file_type_label(suffix: str) -> str:
    if suffix in SUPPORTED_DOCS:   return "document"
    if suffix in SUPPORTED_IMAGES: return "image"
    if suffix in SUPPORTED_AUDIO:  return "audio"
    return "unknown"


async def _save_upload(file: UploadFile) -> Path:
    suffix = Path(file.filename or "upload").suffix.lower()
    dest   = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    size   = 0
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 256):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                dest.unlink(missing_ok=True)
                raise HTTPException(413, detail=f"File exceeds 50 MB limit.")
            out.write(chunk)
    return dest


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "service": "Gyana AI", "version": "2.0.0"}


@app.get("/stats", response_model=StatsResponse, tags=["Info"])
def stats(x_user_id: str = Header(default="default")):
    s = get_stats(user_id=x_user_id)
    return StatsResponse(**s)


# ── Upload ────────────────────────────────────────────────────────────────────
@app.post("/upload", response_model=UploadResponse, tags=["Documents"])
async def upload_file(
    file: UploadFile = File(...),
    x_user_id: str = Header(default="default"),
):
    if not file.filename:
        raise HTTPException(400, detail="No filename provided.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALL_SUPPORTED:
        raise HTTPException(415, detail=f"Unsupported file type '{suffix}'.")

    file_path = await _save_upload(file)
    log.info("Saved upload: %s (%s) for user=%s", file.filename, suffix, x_user_id)

    try:
        if suffix in SUPPORTED_DOCS:
            text = extract_text(file_path)
        elif suffix in SUPPORTED_IMAGES:
            text = extract_text_from_image(file_path)
        else:
            text = transcribe_audio(file_path)

        if not text or not text.strip():
            raise HTTPException(422, detail="No text could be extracted from this file.")

        language = detect_language(text)
        log.info("Detected language: %s for %s", language, file.filename)

        n_chunks = add_documents(text, source=file.filename, user_id=x_user_id)
        log.info("Indexed %d chunks from %s", n_chunks, file.filename)

        return UploadResponse(
            filename          = file.filename,
            file_type         = _file_type_label(suffix),
            detected_language = language,
            chunks_created    = n_chunks,
            message           = f"Successfully processed '{file.filename}'.",
        )

    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Upload processing failed: %s", exc)
        raise HTTPException(500, detail=f"Processing error: {exc}") from exc
    finally:
        file_path.unlink(missing_ok=True)


# ── Ask (standard) ────────────────────────────────────────────────────────────
@app.post("/ask", response_model=AskResponse, tags=["Query"])
async def ask(body: AskRequest):
    if get_stats(user_id=body.user_id)["total_chunks"] == 0:
        raise HTTPException(400, detail="No documents indexed yet. Please upload a document first.")

    try:
        result = await ask_question(body.question, user_id=body.user_id)
        return AskResponse(**result)
    except Exception as exc:
        log.exception("Ask failed: %s", exc)
        raise HTTPException(500, detail=f"Query error: {exc}") from exc


# ── Ask (streaming SSE) ───────────────────────────────────────────────────────
@app.post("/ask/stream", tags=["Query"])
async def ask_stream(body: AskRequest):
    if get_stats(user_id=body.user_id)["total_chunks"] == 0:
        raise HTTPException(400, detail="No documents indexed yet.")

    async def event_generator():
        try:
            async for token in stream_answer(body.question, user_id=body.user_id):
                safe = token.replace("\n", "\\n")
                yield f"data: {safe}\n\n"
        except Exception as exc:
            log.exception("Streaming error: %s", exc)
            yield f"data: [ERROR] {exc}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


# ── General AI (no documents needed) ─────────────────────────────────────────
@app.post("/ask-general", response_model=AskResponse, tags=["Query"])
async def ask_general(body: GeneralAskRequest):
    """
    General AI query — no documents required.
    Answers any question just like ChatGPT / Claude.
    """
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(500, detail="GROQ_API_KEY not configured.")

    try:
        from groq import Groq
        client = Groq(api_key=groq_key)
        response = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Gyana AI, a helpful, accurate, and friendly AI assistant. "
                        "Answer questions clearly and concisely. "
                        "Use markdown formatting (bold, lists, code blocks) when it helps readability. "
                        "If you don't know something, say so honestly."
                    ),
                },
                {"role": "user", "content": body.question},
            ],
            temperature=0.7,
            max_tokens=2048,
        )
        answer = response.choices[0].message.content.strip()
        log.info("General ask answered for user=%s", body.user_id)
        return AskResponse(answer=answer, sources=[], chunks_used=0)

    except Exception as exc:
        log.exception("General ask failed: %s", exc)
        raise HTTPException(500, detail=f"AI error: {exc}") from exc


# ── General AI (streaming SSE) ────────────────────────────────────────────────
@app.post("/ask-general/stream", tags=["Query"])
async def ask_general_stream(body: GeneralAskRequest):
    """
    Streaming version of general AI — streams tokens back as SSE.
    """
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        raise HTTPException(500, detail="GROQ_API_KEY not configured.")

    async def event_generator():
        try:
            from groq import Groq
            client = Groq(api_key=groq_key)
            stream = client.chat.completions.create(
                model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are Gyana AI, a helpful, accurate, and friendly AI assistant. "
                            "Answer questions clearly and concisely. "
                            "Use markdown formatting when it helps readability. "
                            "If you don't know something, say so honestly."
                        ),
                    },
                    {"role": "user", "content": body.question},
                ],
                temperature=0.7,
                max_tokens=2048,
                stream=True,
            )
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if token:
                    safe = token.replace("\n", "\\n")
                    yield f"data: {safe}\n\n"
        except Exception as exc:
            log.exception("General streaming error: %s", exc)
            yield f"data: [ERROR] {exc}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


# ── Speech query ──────────────────────────────────────────────────────────────
@app.post("/speech-query", response_model=SpeechQueryResponse, tags=["Query"])
async def speech_query(
    file: UploadFile = File(...),
    x_user_id: str = Header(default="default"),
):
    if not file.filename:
        raise HTTPException(400, detail="No filename provided.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_AUDIO:
        raise HTTPException(415, detail=f"Unsupported audio format '{suffix}'.")

    file_path = await _save_upload(file)

    try:
        question = transcribe_audio(file_path)
        if not question or not question.strip():
            raise HTTPException(422, detail="Could not transcribe audio.")

        log.info("Transcribed: %s", question[:80])

        if get_stats(user_id=x_user_id)["total_chunks"] == 0:
            return SpeechQueryResponse(
                transcribed_question=question,
                answer="No documents indexed yet.",
                sources=[],
            )

        result = await ask_question(question, user_id=x_user_id)
        return SpeechQueryResponse(
            transcribed_question=question,
            answer=result["answer"],
            sources=result.get("sources", []),
        )

    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Speech query failed: %s", exc)
        raise HTTPException(500, detail=f"Speech query error: {exc}") from exc
    finally:
        file_path.unlink(missing_ok=True)


# ── Clear store ───────────────────────────────────────────────────────────────
@app.delete("/documents", tags=["Documents"])
def delete_documents(x_user_id: str = Header(default="default")):
    clear_store(user_id=x_user_id)
    log.info("Vector store cleared for user=%s", x_user_id)
    return {"message": "All documents have been removed from the knowledge base."}