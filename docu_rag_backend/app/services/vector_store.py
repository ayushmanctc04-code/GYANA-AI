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
    words = text.split()
    chunks: list[Chunk] = []
    idx = 0

    words_per_chunk = max(50, CHUNK_SIZE // 5)
    overlap_words   = max(10, CHUNK_OVERLAP // 5)

    i = 0
    while i < len(words):
        chunk_words = words[i:i + words_per_chunk]
        chunk_text  = " ".join(chunk_words).strip()
        if chunk_text:
            chunks.append(Chunk(text=chunk_text, source=source, index=idx))
            idx += 1
        i += max(1, words_per_chunk - overlap_words)

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