# =============================================================================
#  Gyana AI  –  Vector Store (Supabase pgvector + HuggingFace API embeddings)
#  • Per-user document isolation
#  • HuggingFace Inference API for embeddings
#  • Supabase pgvector for persistent storage
# =============================================================================

from __future__ import annotations

import logging
import os
import re
import time
import requests
from dataclasses import dataclass

import numpy as np

log = logging.getLogger("gyana.vector_store")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CHUNK_SIZE    = int(os.getenv("CHUNK_SIZE",    "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP",  "80"))
TOP_K         = int(os.getenv("TOP_K",           "5"))

SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY")
HF_API_KEY    = os.getenv("HF_API_KEY")

HF_MODEL_URL  = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class Chunk:
    text:   str
    source: str
    index:  int


SECTION_MARKER_RE = re.compile(r"^\[(Page\s+\d+|Slide\s+\d+|Notes)\]\s*$", re.IGNORECASE)
HEADING_RE = re.compile(r"^(#{1,6}\s+.+|[A-Z][A-Z0-9\s:&/\-]{5,})$")


# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------
_supabase = None


# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------
def _get_supabase():
    global _supabase
    if _supabase is None:
        try:
            from supabase import create_client
        except ImportError:
            raise RuntimeError("pip install supabase")
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set.")
        log.info("Connecting to Supabase...")
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        log.info("Supabase client initialized ✓")
    return _supabase


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def add_documents(text: str, source: str = "document", user_id: str = "default") -> int:
    log.info("Starting add_documents for '%s' user='%s'", source, user_id)

    log.info("Chunking text...")
    new_chunks = _chunk_text(text, source)
    log.info("Created %d chunks", len(new_chunks))
    if not new_chunks:
        return 0

    log.info("Embedding %d chunks via HuggingFace API...", len(new_chunks))
    vectors = _embed([c.text for c in new_chunks])
    log.info("Embedding done ✓ shape=%s", vectors.shape)

    client = _get_supabase()

    rows = [
        {
            "user_id":    user_id,
            "filename":   source,
            "chunk_text": chunk.text,
            "embedding":  vectors[i].tolist(),
        }
        for i, chunk in enumerate(new_chunks)
    ]

    log.info("Inserting %d rows into Supabase...", len(rows))
    batch_size = 10
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        try:
            client.table("documents").insert(batch).execute()
            log.info("Inserted batch %d/%d ✓", i // batch_size + 1, (len(rows) + batch_size - 1) // batch_size)
        except Exception as exc:
            log.error("Failed to insert batch: %s", exc)
            raise

    log.info("Added %d chunks from '%s' ✓", len(new_chunks), source)
    return len(new_chunks)


def search_documents(query: str, top_k: int = TOP_K, user_id: str = "default") -> list[dict]:
    client = _get_supabase()
    q_vec  = _embed([query])[0].tolist()

    try:
        response = client.rpc(
            "match_documents_user",
            {
                "query_embedding": q_vec,
                "match_threshold": 0.0,
                "match_count":     top_k,
                "p_user_id":       user_id,
            },
        ).execute()

        results = []
        for row in (response.data or []):
            results.append({
                "text":   row.get("chunk_text", ""),
                "source": row.get("filename",   "unknown"),
                "score":  row.get("similarity", 0.0),
            })

        log.info("Search returned %d results for user '%s'", len(results), user_id)
        return results

    except Exception as exc:
        log.warning("Vector search failed, falling back: %s", exc)
        response = client.table("documents").select("chunk_text, filename").eq("user_id", user_id).limit(top_k).execute()
        return [
            {"text": r.get("chunk_text", ""), "source": r.get("filename", "unknown"), "score": 0.5}
            for r in (response.data or [])
        ]


def get_stats(user_id: str = "default") -> dict:
    try:
        client   = _get_supabase()
        response = client.table("documents").select("filename").eq("user_id", user_id).execute()
        docs     = list({r["filename"] for r in (response.data or [])})
        total    = len(response.data or [])
        return {
            "total_chunks":    total,
            "total_documents": len(docs),
            "documents":       docs,
        }
    except Exception as exc:
        log.warning("Could not get stats: %s", exc)
        return {"total_chunks": 0, "total_documents": 0, "documents": []}


def clear_store(user_id: str = "default") -> None:
    try:
        client = _get_supabase()
        client.table("documents").delete().eq("user_id", user_id).execute()
        log.info("Vector store cleared for user '%s'.", user_id)
    except Exception as exc:
        log.warning("Could not clear store: %s", exc)


# ---------------------------------------------------------------------------
# Chunking — simple word-based, no infinite loops
# ---------------------------------------------------------------------------
def _chunk_text(text: str, source: str) -> list[Chunk]:
    chunks: list[Chunk] = []
    idx = 0

    words_per_chunk = max(50, CHUNK_SIZE // 5)
    overlap_words   = max(10, CHUNK_OVERLAP // 5)

    sections: list[tuple[str, list[str]]] = []
    current_label = ""
    current_paragraphs: list[str] = []
    paragraph_buffer: list[str] = []

    def flush_paragraph():
        nonlocal paragraph_buffer, current_paragraphs
        if paragraph_buffer:
            paragraph = " ".join(paragraph_buffer).strip()
            if paragraph:
                current_paragraphs.append(paragraph)
            paragraph_buffer = []

    def flush_section():
        nonlocal current_paragraphs
        flush_paragraph()
        if current_paragraphs:
            sections.append((current_label, current_paragraphs))
            current_paragraphs = []

    for raw_line in text.splitlines():
        line = raw_line.strip()
        marker = SECTION_MARKER_RE.match(line)
        if marker:
            flush_section()
            current_label = marker.group(1)
            continue
        if not line:
            flush_paragraph()
            continue
        if HEADING_RE.match(line):
            flush_paragraph()
            current_paragraphs.append(line)
            continue
        paragraph_buffer.append(line)

    flush_section()

    if not sections:
        sections = [("", [text])]

    for label, paragraphs in sections:
        chunk_parts: list[str] = []
        chunk_word_count = 0

        for paragraph in paragraphs:
            para_words = paragraph.split()
            para_word_count = len(para_words)
            if chunk_parts and chunk_word_count + para_word_count > words_per_chunk:
                chunk_text = "\n\n".join(chunk_parts).strip()
                if chunk_text:
                    if label:
                        chunk_text = f"[{label}]\n{chunk_text}"
                    chunks.append(Chunk(text=chunk_text, source=source, index=idx))
                    idx += 1

                overlap_text = ""
                if overlap_words > 0 and chunk_parts:
                    overlap_candidates = " ".join(chunk_parts).split()
                    overlap_slice = overlap_candidates[-overlap_words:]
                    overlap_text = " ".join(overlap_slice).strip()

                chunk_parts = [overlap_text] if overlap_text else []
                chunk_word_count = len(overlap_text.split()) if overlap_text else 0

            chunk_parts.append(paragraph)
            chunk_word_count += para_word_count

        if chunk_parts:
            chunk_text = "\n\n".join([part for part in chunk_parts if part.strip()]).strip()
            if chunk_text:
                if label:
                    chunk_text = f"[{label}]\n{chunk_text}"
                chunks.append(Chunk(text=chunk_text, source=source, index=idx))
                idx += 1

    log.info("Chunked into %d chunks", len(chunks))
    return chunks


# ---------------------------------------------------------------------------
# Embedding via HuggingFace Inference API
# ---------------------------------------------------------------------------
def _embed(texts: list[str]) -> np.ndarray:
    if not HF_API_KEY:
        raise RuntimeError("HF_API_KEY environment variable not set.")

    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    all_vectors = []

    batch_size = 8
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        log.info("Embedding batch %d/%d...", i // batch_size + 1, (len(texts) + batch_size - 1) // batch_size)

        for attempt in range(3):
            try:
                response = requests.post(
                    HF_MODEL_URL,
                    headers=headers,
                    json={"inputs": batch, "options": {"wait_for_model": True}},
                    timeout=60,
                )

                if response.status_code == 503:
                    log.info("HF model loading, waiting 20s...")
                    time.sleep(20)
                    continue

                response.raise_for_status()
                batch_vecs = np.array(response.json(), dtype=np.float32)

                if batch_vecs.ndim == 3:
                    batch_vecs = batch_vecs.mean(axis=1)

                norms = np.linalg.norm(batch_vecs, axis=1, keepdims=True)
                norms = np.where(norms == 0, 1, norms)
                batch_vecs = batch_vecs / norms

                all_vectors.append(batch_vecs)
                break

            except Exception as exc:
                log.warning("HF API attempt %d failed: %s", attempt + 1, exc)
                if attempt == 2:
                    raise RuntimeError(f"HuggingFace API failed after 3 attempts: {exc}")
                time.sleep(5)

    return np.vstack(all_vectors)
