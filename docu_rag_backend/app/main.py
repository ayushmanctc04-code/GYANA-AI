# =============================================================================
#  Gyana AI  –  FastAPI Backend
#  Production-ready: typed responses, proper error handling, SSE streaming,
#  request validation, lifespan management, structured logging
# =============================================================================

from __future__ import annotations

import logging
import os
import shutil
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
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

# Max upload size: 50 MB
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# ---------------------------------------------------------------------------
# Lifespan – startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    UPLOAD_DIR.mkdir(exist_ok=True)
    log.info("Gyana AI backend started ✓")
    yield
    # Clean up leftover temp files on shutdown
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
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Add your production domain here, e.g. "https://gyana.ai"
    ],
    allow_credentials=True,
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


class AskResponse(BaseModel):
    answer: str
    sources: list[str] = []
    chunks_used: int = 0
    detected_language: Optional[str] = None


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
    """Stream-save upload to a unique temp path; enforce size limit."""
    suffix = Path(file.filename or "upload").suffix.lower()
    dest   = UPLOAD_DIR / f"{uuid.uuid4().hex}{suffix}"
    size   = 0
    with dest.open("wb") as out:
        while chunk := await file.read(1024 * 256):   # 256 KB chunks
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    413,
                    detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_BYTES // 1024 // 1024} MB.",
                )
            out.write(chunk)
    return dest


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/", tags=["Health"])
def health():
    return {"status": "ok", "service": "Gyana AI", "version": "2.0.0"}


@app.get("/stats", response_model=StatsResponse, tags=["Info"])
def stats():
    """Return current vector store statistics."""
    s = get_stats()
    return StatsResponse(**s)


# ── Upload ────────────────────────────────────────────────────────────────────
@app.post("/upload", response_model=UploadResponse, tags=["Documents"])
async def upload_file(file: UploadFile = File(...)):
    """
    Accept PDF / DOCX / PPTX / TXT / PNG / JPG / MP3 / WAV / M4A.
    Extracts text → detects language → chunks → embeds → stores in FAISS.
    """
    if not file.filename:
        raise HTTPException(400, detail="No filename provided.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALL_SUPPORTED:
        raise HTTPException(
            415,
            detail=(
                f"Unsupported file type '{suffix}'. "
                f"Supported: {', '.join(sorted(ALL_SUPPORTED))}"
            ),
        )

    file_path = await _save_upload(file)
    log.info("Saved upload: %s  (%s)", file.filename, suffix)

    try:
        # 1. Extract text
        if suffix in SUPPORTED_DOCS:
            text = extract_text(file_path)
        elif suffix in SUPPORTED_IMAGES:
            text = extract_text_from_image(file_path)
        else:
            text = transcribe_audio(file_path)

        if not text or not text.strip():
            raise HTTPException(422, detail="No text could be extracted from this file.")

        # 2. Detect language
        language = detect_language(text)
        log.info("Detected language: %s  for %s", language, file.filename)

        # 3. Chunk + embed + store  (chunking now lives in vector_store)
        n_chunks = add_documents(text, source=file.filename)
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
    """RAG query – retrieve relevant chunks, answer via Groq LLM."""
    if get_stats()["total_chunks"] == 0:
        raise HTTPException(
            400, detail="No documents indexed yet. Please upload a document first."
        )

    try:
        result = await ask_question(body.question)
        return AskResponse(**result)
    except Exception as exc:
        log.exception("Ask failed: %s", exc)
        raise HTTPException(500, detail=f"Query error: {exc}") from exc


# ── Ask (streaming SSE) ───────────────────────────────────────────────────────
@app.post("/ask/stream", tags=["Query"])
async def ask_stream(body: AskRequest):
    """
    SSE streaming version of /ask.
    Frontend reads tokens via fetch + ReadableStream.
    Each event: `data: <token>\n\n`
    Terminal event: `data: [DONE]\n\n`
    """
    if get_stats()["total_chunks"] == 0:
        raise HTTPException(400, detail="No documents indexed yet.")

    async def event_generator():
        try:
            async for token in stream_answer(body.question):
                # Escape newlines so SSE framing stays intact
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
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":      "keep-alive",
        },
    )


# ── Speech query ──────────────────────────────────────────────────────────────
@app.post("/speech-query", response_model=SpeechQueryResponse, tags=["Query"])
async def speech_query(file: UploadFile = File(...)):
    """Accept audio → transcribe → RAG query → return answer."""
    if not file.filename:
        raise HTTPException(400, detail="No filename provided.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_AUDIO:
        raise HTTPException(
            415,
            detail=f"Unsupported audio format '{suffix}'. Supported: {', '.join(sorted(SUPPORTED_AUDIO))}",
        )

    file_path = await _save_upload(file)

    try:
        question = transcribe_audio(file_path)
        if not question or not question.strip():
            raise HTTPException(422, detail="Could not transcribe audio.")

        log.info("Transcribed: %s", question[:80])

        if get_stats()["total_chunks"] == 0:
            return SpeechQueryResponse(
                transcribed_question=question,
                answer="No documents indexed yet.",
                sources=[],
            )

        result = await ask_question(question)
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
def delete_documents():
    """Wipe the entire FAISS vector store."""
    clear_store()
    log.info("Vector store cleared.")
    return {"message": "All documents have been removed from the knowledge base."}