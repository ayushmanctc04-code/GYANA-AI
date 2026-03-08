# =============================================================================
#  Gyana AI  –  Vector Store
#  • Semantic-aware paragraph chunking with configurable overlap
#  • SentenceTransformers all-MiniLM-L6-v2  (L2-normalised → cosine sim)
#  • FAISS IndexFlatIP  (exact inner-product search)
#  • Per-chunk source tracking for citations
#  • Disk persistence across restarts
# =============================================================================

from __future__ import annotations

import logging
import os
import pickle
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

log = logging.getLogger("gyana.vector_store")

# ---------------------------------------------------------------------------
# Configuration  (override via environment variables)
# ---------------------------------------------------------------------------
EMBED_MODEL   = os.getenv("EMBED_MODEL",   "all-MiniLM-L6-v2")
CHUNK_SIZE    = int(os.getenv("CHUNK_SIZE",    "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP",  "80"))
TOP_K         = int(os.getenv("TOP_K",           "5"))

STORE_DIR   = Path(os.getenv("STORE_DIR", "vector_store"))
INDEX_FILE  = STORE_DIR / "faiss.index"
CHUNKS_FILE = STORE_DIR / "chunks.pkl"

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class Chunk:
    text:   str
    source: str          # original filename
    index:  int          # position within that document


# ---------------------------------------------------------------------------
# In-memory state  (loaded from disk on first use)
# ---------------------------------------------------------------------------
_index         = None    # faiss.IndexFlatIP
_chunks: list[Chunk] = []
_embed_model   = None    # SentenceTransformer
_state_loaded  = False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def add_documents(text: str, source: str = "document") -> int:
    """
    Chunk text → embed → add to FAISS index.
    Returns number of chunks stored.
    """
    _ensure_loaded()

    new_chunks = _chunk_text(text, source)
    if not new_chunks:
        return 0

    vectors = _embed([c.text for c in new_chunks])
    _add_vectors(vectors)
    _chunks.extend(new_chunks)
    _persist()

    log.info("Added %d chunks from '%s' (total: %d)", len(new_chunks), source, len(_chunks))
    return len(new_chunks)


def search_documents(query: str, top_k: int = TOP_K) -> list[dict]:
    """
    Embed query → cosine-similarity search → return top-k results.
    Each result: {"text": str, "source": str, "score": float}
    """
    _ensure_loaded()

    if _index is None or len(_chunks) == 0:
        return []

    q_vec = _embed([query])
    k     = min(top_k, len(_chunks))

    distances, indices = _index.search(q_vec, k)

    results = []
    for score, idx in zip(distances[0], indices[0]):
        if 0 <= idx < len(_chunks):
            c = _chunks[idx]
            results.append({"text": c.text, "source": c.source, "score": float(score)})

    return results


def get_stats() -> dict:
    _ensure_loaded()
    sources = list({
    c.source if hasattr(c, "source") else c
    for c in _chunks
    })
    return {
        "total_chunks":    len(_chunks),
        "total_documents": len(sources),
        "documents":       sources,
    }


def clear_store() -> None:
    global _index, _chunks
    _ensure_loaded()
    _index  = None
    _chunks = []
    INDEX_FILE.unlink(missing_ok=True)
    CHUNKS_FILE.unlink(missing_ok=True)
    log.info("Vector store cleared.")


# ---------------------------------------------------------------------------
# Chunking  –  semantic paragraph-aware with overlap
# ---------------------------------------------------------------------------
def _chunk_text(text: str, source: str) -> list[Chunk]:
    """
    Strategy:
    1. Split on paragraph boundaries (double newline).
    2. Accumulate paragraphs until CHUNK_SIZE is reached → flush.
    3. If a single paragraph > CHUNK_SIZE → split on sentence boundaries.
    4. Carry last CHUNK_OVERLAP chars into the next chunk for context.
    """
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    chunks: list[Chunk] = []
    idx = 0
    current = ""

    for para in paragraphs:
        candidate = (current + "\n\n" + para).strip() if current else para

        if len(candidate) <= CHUNK_SIZE:
            current = candidate
            continue

        # Flush current buffer
        if current:
            chunks.append(Chunk(text=current, source=source, index=idx))
            idx += 1
            current = _tail_overlap(current) + " " + para
        else:
            current = para

        # If the paragraph itself is still too long, split by sentences
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
    """Return the last CHUNK_OVERLAP characters, starting at a word boundary."""
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
    """Returns float32 L2-normalised embeddings of shape (N, dim)."""
    vecs = _get_model().encode(
        texts,
        convert_to_numpy      = True,
        normalize_embeddings  = True,   # cosine sim = inner product on normed vecs
        show_progress_bar     = False,
        batch_size            = 32,
    )
    return vecs.astype(np.float32)


# ---------------------------------------------------------------------------
# FAISS index management
# ---------------------------------------------------------------------------
def _add_vectors(vectors: np.ndarray) -> None:
    global _index
    try:
        import faiss
    except ImportError:
        raise RuntimeError("pip install faiss-cpu")

    if _index is None:
        dim    = vectors.shape[1]
        _index = faiss.IndexFlatIP(dim)   # IndexFlatIP + L2-normed = cosine sim

    _index.add(vectors)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def _persist() -> None:
    try:
        import faiss
        STORE_DIR.mkdir(exist_ok=True)
        faiss.write_index(_index, str(INDEX_FILE))
        with CHUNKS_FILE.open("wb") as f:
            pickle.dump(_chunks, f)
    except Exception as exc:
        log.warning("Persistence write failed: %s", exc)


def _ensure_loaded() -> None:
    global _index, _chunks, _state_loaded
    if _state_loaded:
        return
    _state_loaded = True
    try:
        import faiss
        if INDEX_FILE.exists() and CHUNKS_FILE.exists():
            _index = faiss.read_index(str(INDEX_FILE))
            with CHUNKS_FILE.open("rb") as f:
                _chunks = pickle.load(f)
            log.info("Restored %d chunks from disk.", len(_chunks))
    except Exception as exc:
        log.warning("Could not restore vector store from disk: %s", exc)
        _index  = None
        _chunks = []