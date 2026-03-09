# =============================================================================
#  Gyana AI  –  RAG Service
#  • Retrieves top-K chunks from Supabase per user
#  • Builds grounded prompt with source labels
#  • Calls Groq LLM (llama3-70b-8192)
#  • Supports standard + async streaming responses
#  • Rolling conversation memory (last N turns)
# =============================================================================

from __future__ import annotations

import logging
import os
from collections import deque
from typing import AsyncIterator

from app.services.vector_store import search_documents

log = logging.getLogger("gyana.rag")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL    = os.getenv("GROQ_MODEL",    "llama-3.3-70b-versatile")
LLM_TEMP      = float(os.getenv("LLM_TEMP",    "0.1"))
MAX_TOKENS    = int(os.getenv("MAX_TOKENS",     "1024"))
TOP_K_CHUNKS  = int(os.getenv("TOP_K_CHUNKS",   "5"))
MEMORY_TURNS  = int(os.getenv("MEMORY_TURNS",   "6"))

# ---------------------------------------------------------------------------
# Conversation memory (per-process, shared)
# ---------------------------------------------------------------------------
_memory: deque = deque(maxlen=MEMORY_TURNS * 2)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
_SYSTEM = """\
You are Gyana AI, a precise document intelligence assistant.

STRICT RULES — never violate these:
1. Answer ONLY using the information in the <context> block provided below.
2. If the answer is not in the context, respond with exactly:
   "I could not find an answer to that in the uploaded documents."
3. Never fabricate facts, statistics, names, or dates.
4. Always cite the source document in your answer, e.g. "According to report.pdf, …"
5. Use bullet points or numbered lists for multi-part answers.
6. If the question is in a language other than English, respond in that same language.
7. Keep answers concise and directly relevant to the question.\
"""

# ---------------------------------------------------------------------------
# Groq client
# ---------------------------------------------------------------------------
_groq_client = None

def _get_client():
    global _groq_client
    if _groq_client is None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not set. Add it to your .env file: GROQ_API_KEY=your_key_here")
        try:
            from groq import Groq
        except ImportError:
            raise RuntimeError("pip install groq")
        _groq_client = Groq(api_key=GROQ_API_KEY)
    return _groq_client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _build_context(results: list[dict]) -> tuple[str, list[str]]:
    parts   = []
    sources = []
    seen    = set()
    for r in results:
        src = r["source"]
        parts.append(f'<source name="{src}">\n{r["text"]}\n</source>')
        if src not in seen:
            sources.append(src)
            seen.add(src)
    return "\n\n".join(parts), sources


def _build_messages(context: str, question: str) -> list[dict]:
    user_content = (
        f"<context>\n{context}\n</context>\n\n"
        f"<question>{question}</question>"
    )
    msgs = [{"role": "system", "content": _SYSTEM}]
    msgs.extend(list(_memory))
    msgs.append({"role": "user", "content": user_content})
    return msgs


def _update_memory(question: str, answer: str) -> None:
    _memory.append({"role": "user",      "content": question})
    _memory.append({"role": "assistant", "content": answer})


# ---------------------------------------------------------------------------
# Standard answer
# ---------------------------------------------------------------------------
async def ask_question(question: str, user_id: str = "default") -> dict:
    results = search_documents(question, top_k=TOP_K_CHUNKS, user_id=user_id)

    if not results:
        return {
            "answer":      "I could not find an answer to that in the uploaded documents.",
            "sources":     [],
            "chunks_used": 0,
        }

    context, sources = _build_context(results)
    messages         = _build_messages(context, question)

    client   = _get_client()
    response = client.chat.completions.create(
        model       = GROQ_MODEL,
        messages    = messages,
        temperature = LLM_TEMP,
        max_tokens  = MAX_TOKENS,
    )

    answer = response.choices[0].message.content.strip()
    _update_memory(question, answer)

    log.info("Answered '%s…' using %d chunks from: %s", question[:60], len(results), sources)

    return {
        "answer":      answer,
        "sources":     sources,
        "chunks_used": len(results),
    }


# ---------------------------------------------------------------------------
# Streaming answer
# ---------------------------------------------------------------------------
async def stream_answer(question: str, user_id: str = "default") -> AsyncIterator[str]:
    results = search_documents(question, top_k=TOP_K_CHUNKS, user_id=user_id)

    if not results:
        yield "I could not find an answer to that in the uploaded documents."
        return

    context, sources = _build_context(results)
    messages         = _build_messages(context, question)

    client = _get_client()
    stream = client.chat.completions.create(
        model       = GROQ_MODEL,
        messages    = messages,
        temperature = LLM_TEMP,
        max_tokens  = MAX_TOKENS,
        stream      = True,
    )

    full_answer = ""
    for chunk in stream:
        token = chunk.choices[0].delta.content or ""
        if token:
            full_answer += token
            yield token

    _update_memory(question, full_answer)
    log.info("Streamed answer for '%s…' (%d chunks)", question[:60], len(results))


# ---------------------------------------------------------------------------
# Memory management
# ---------------------------------------------------------------------------
def clear_memory() -> None:
    _memory.clear()


def get_memory() -> list[dict]:
    return list(_memory)