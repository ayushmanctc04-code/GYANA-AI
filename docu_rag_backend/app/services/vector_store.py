# =============================================================================
#  Gyana AI  –  Vector Store (Supabase pgvector)
#  • Semantic-aware paragraph chunking with configurable overlap
#  • SentenceTransformers all-MiniLM-L6-v2 (L2-normalised → cosine sim)
#  • Supabase pgvector for persistent storage across restarts
# =============================================================================

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

import numpy as np

log = logging.getLogger("gyana.vector_store")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
EMBED_MODEL   = os.getenv("EMBED_MODEL",    "all-MiniLM-L6-v2")
CHUNK_SIZE    = int(os.getenv("CHUNK_SIZE",    "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP",  "80"))
TOP_K         = int(os.getenv("TOP_K",           "5"))

SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY")

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
_embed_model  = None
_supabase     = None


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
            raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set in environment.")
        _supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        log.info("Supabase client initialized.")
    return _supabase


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def add_documents(text: str, source: str = "document") -> int:
    """
    Chunk text → embed → store in Supabase pgvector.
    Returns number of chunks stored.
    """
    new_chunks = _chunk_text(text, source)
    if not new_chunks:
        return 0

    vectors = _embed([c.text for c in new_chunks])
    client  = _get_supabase()

    # Get current user_id placeholder (source-based)
    rows = [
        {
            "user_id":    source,
            "filename":   source,
            "chunk_text": chunk.text,
            "embedding":  vectors[i].tolist(),
        }
        for i, chunk in enumerate(new_chunks)
    ]

    client.table("documents").insert(rows).execute()
    log.info("Added %d chunks from '%s'", len(new_chunks), source)
    return len(new_chunks)


def search_documents(query: str, top_k: int = TOP_K) -> list[dict]:
    """
    Embed query → cosine similarity search via Supabase RPC.
    Returns top-k results: {"text": str, "source": str, "score": float}
    """
    client = _get_supabase()
    q_vec  = _embed([query])[0].tolist()

    try:
        response = client.rpc(
            "match_documents",
            {
                "query_embedding": q_vec,
                "match_threshold": 0.3,
                "match_count":     top_k,
            },
        ).execute()

        results = []
        for row in (response.data or []):
            results.append({
                "text":   row.get("chunk_text", ""),
                "source": row.get("filename",   "unknown"),
                "score":  row.get("similarity", 0.0),
            })
        return results

    except Exception as exc:
        log.warning("Vector search failed, falling back to text search: %s", exc)
        # Fallback: return recent chunks
        response = client.table("documents").select("chunk_text, filename").limit(top_k).execute()
        return [
            {"text": r.get("chunk_text", ""), "source": r.get("filename", "unknown"), "score": 0.5}
            for r in (response.data or [])
        ]


def get_stats() -> dict:
    try:
        client   = _get_supabase()
        response = client.table("documents").select("filename").execute()
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


def clear_store() -> None:
    try:
        client = _get_supabase()
        client.table("documents").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        log.info("Vector store cleared.")
    except Exception as exc:
        log.warning("Could not clear store: %s", exc)


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
def _chunk_text(text: str, source: str) -> list[Chunk]:
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    chunks: list[Chunk] = []
    idx     = 0
    current = ""

    for para in paragraphs:
        candidate = (current + "\n\n" + para).strip() if current else para

        if len(candidate) <= CHUNK_SIZE:
            current = candidate
            continue

        if current:
            chunks.append(Chunk(text=current, source=source, index=idx))
            idx += 1
            current = _tail_overlap(current) + " " + para
        else:
            current = para

        while len(current) > CHUNK_SIZE:
            sentences = re.split(r"(?<=[.!?])\s+", current)
            batch = ""
            rest  = []
            for sent in sentences:
                if len(batch) + len(sent) + 1 <= CHUNK_SIZE:
                    batch = (batch + " " + sent).strip()
                else:
                    rest.append(sent)
            if batch:
                chunks.append(Chunk(text=batch, source=source, index=idx))
                idx += 1
            current = " ".join(rest)

    if current.strip():
        chunks.append(Chunk(text=current.strip(), source=source, index=idx))

    return chunks


def _tail_overlap(text: str) -> str:
    if len(text) <= CHUNK_OVERLAP:
        return text
    tail = text[-CHUNK_OVERLAP:]
    sp   = tail.find(" ")
    return tail[sp + 1:] if sp != -1 else tail


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------
def _get_model():
    global _embed_model
    if _embed_model is None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise RuntimeError("pip install sentence-transformers")
        log.info("Loading embedding model '%s'…", EMBED_MODEL)
        _embed_model = SentenceTransformer(EMBED_MODEL)
    return _embed_model


def _embed(texts: list[str]) -> np.ndarray:
    vecs = _get_model().encode(
        texts,
        convert_to_numpy     = True,
        normalize_embeddings = True,
        show_progress_bar    = False,
        batch_size           = 32,
    )
    return vecs.astype(np.float32)