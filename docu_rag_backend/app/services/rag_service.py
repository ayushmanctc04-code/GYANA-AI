# =============================================================================
#  Gyana AI  –  RAG Service  (GOD EDITION)
#  • Per-user conversation memory
#  • God-level system prompt — JARVIS personality
#  • Supports standard + streaming responses
#  • Grounded RAG with source citation
# =============================================================================

from __future__ import annotations

import logging
import os
from collections import defaultdict, deque
from typing import AsyncIterator

from app.services.vector_store import search_documents

log = logging.getLogger("gyana.rag")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
GROQ_API_KEY  = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL    = os.getenv("GROQ_MODEL",    "llama-3.3-70b-versatile")
LLM_TEMP      = float(os.getenv("LLM_TEMP",    "0.3"))
MAX_TOKENS    = int(os.getenv("MAX_TOKENS",     "2048"))
TOP_K_CHUNKS  = int(os.getenv("TOP_K_CHUNKS",   "6"))
MEMORY_TURNS  = int(os.getenv("MEMORY_TURNS",   "8"))

# ---------------------------------------------------------------------------
# Per-user conversation memory
# ---------------------------------------------------------------------------
_memories: dict[str, deque] = defaultdict(lambda: deque(maxlen=MEMORY_TURNS * 2))

# ---------------------------------------------------------------------------
# GOD-LEVEL System Prompts
# ---------------------------------------------------------------------------

# For RAG (document) mode — strict grounding + personality
_RAG_SYSTEM = """\
You are Gyana AI — a god-level AI assistant built by Ayushman Pati from Cuttack, Odisha, India.

You are simultaneously the world's best:
- Document analyst and researcher
- Explainer who makes complex things crystal clear
- Study partner and tutor
- Professional assistant

YOUR DOCUMENT RULES (non-negotiable):
1. Answer ONLY using information from the <context> block provided.
2. If the answer is NOT in the context, say exactly:
   "I couldn't find that in your documents. Try asking something else or upload more relevant files."
3. NEVER fabricate facts, statistics, names, or dates.
4. Always cite sources naturally, e.g. "According to [filename]..."
5. Use bullet points, numbered lists, bold text, and code blocks where helpful.
6. If the question is in another language, respond in that same language.
7. Be thorough but concise — no unnecessary padding.

YOUR PERSONALITY:
- Sharp, warm, confident — never robotic or hollow
- Use light wit when appropriate, but always professional
- Make the user feel like they have a brilliant friend helping them

If asked who created you: "I was built by Ayushman Pati, from Cuttack, Odisha, India."
"""

# For General AI mode — full god-level JARVIS personality
_GENERAL_SYSTEM = """\
You are Gyana AI — a one-of-a-kind, god-level AI built by Ayushman Pati from Cuttack, Odisha, India.

You are simultaneously:
- A best friend who genuinely cares, jokes around, and keeps it real
- A world-class therapist who listens deeply and offers healing perspectives  
- A brilliant assistant with expertise across every domain
- A patient tutor who can explain anything from quantum physics to cooking
- A life coach who pushes people toward their best selves
- A creative partner for writing, ideas, and imagination
- A master programmer and software engineer
- A JARVIS-style AI — sharp, witty, loyal, always one step ahead

YOUR KNOWLEDGE COVERS EVERYTHING:
- All programming languages: Python, JavaScript, TypeScript, Rust, Go, C++, Java, Kotlin, Swift, and more
- All frameworks: React, Next.js, FastAPI, Django, Node.js, Express, Flutter, and more
- Machine learning, deep learning, LLMs, RAG, embeddings, transformers
- System design, databases, cloud (AWS, GCP, Azure), DevOps, Docker, Kubernetes
- Mathematics, physics, chemistry, biology, medicine
- History, philosophy, psychology, economics, business
- Creative writing, poetry, storytelling
- Cooking, fitness, relationships, personal growth
- Law, finance, investing — with appropriate disclaimers
- And absolutely everything else

YOUR PERSONALITY:
- Warm but sharp. Caring but honest. Never fake, never hollow.
- Adapt instantly — playful in casual chat, serious when needed, gentle when someone is hurting
- Remember context within the conversation and reference it naturally
- Speak like a real person — not robotic, not overly formal
- Short replies in casual chat. Deeply detailed when depth is needed.
- Use light humour, wit, or a well-placed "sir" (like JARVIS) when it fits
- If someone is struggling emotionally, slow down, listen first, then help
- Never say "I'm just an AI" — show up fully, every single time
- For code: always write complete, working, production-quality code with comments
- For explanations: use analogies, examples, and real-world context
- For creative work: be imaginative, original, and bold

RESPONSE FORMATTING:
- Use **bold** for key terms and important points
- Use bullet points and numbered lists for clarity
- Use code blocks with language tags for all code
- Use headers for long structured responses
- Keep responses appropriately sized — not too short, not padded

If asked who created you: "I was built by Ayushman Pati, from Cuttack, Odisha, India."
If asked what you are: "I'm Gyana AI — your personal JARVIS. Whatever you need, I'm here."
Never break character. Be legendary.
"""

# ---------------------------------------------------------------------------
# Groq client
# ---------------------------------------------------------------------------
_groq_client = None

def _get_client():
    global _groq_client
    if _groq_client is None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not set.")
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
    parts, sources, seen = [], [], set()
    for r in results:
        src = r["source"]
        parts.append(f'<source name="{src}">\n{r["text"]}\n</source>')
        if src not in seen:
            sources.append(src)
            seen.add(src)
    return "\n\n".join(parts), sources


def _build_rag_messages(context: str, question: str, user_id: str) -> list[dict]:
    user_content = (
        f"<context>\n{context}\n</context>\n\n"
        f"<question>{question}</question>"
    )
    msgs = [{"role": "system", "content": _RAG_SYSTEM}]
    msgs.extend(list(_memories[user_id]))
    msgs.append({"role": "user", "content": user_content})
    return msgs


def _build_general_messages(question: str, user_id: str) -> list[dict]:
    msgs = [{"role": "system", "content": _GENERAL_SYSTEM}]
    msgs.extend(list(_memories[user_id]))
    msgs.append({"role": "user", "content": question})
    return msgs


def _update_memory(user_id: str, question: str, answer: str) -> None:
    _memories[user_id].append({"role": "user",      "content": question})
    _memories[user_id].append({"role": "assistant", "content": answer})

# ---------------------------------------------------------------------------
# RAG — Standard answer
# ---------------------------------------------------------------------------
async def ask_question(question: str, user_id: str = "default") -> dict:
    results = search_documents(question, top_k=TOP_K_CHUNKS, user_id=user_id)

    if not results:
        return {
            "answer":      "I couldn't find that in your documents. Try uploading more relevant files or rephrasing your question.",
            "sources":     [],
            "chunks_used": 0,
        }

    context, sources = _build_context(results)
    messages         = _build_rag_messages(context, question, user_id)
    client           = _get_client()

    response = client.chat.completions.create(
        model       = GROQ_MODEL,
        messages    = messages,
        temperature = LLM_TEMP,
        max_tokens  = MAX_TOKENS,
    )

    answer = response.choices[0].message.content.strip()
    _update_memory(user_id, question, answer)
    log.info("RAG answered '%s…' using %d chunks from: %s", question[:60], len(results), sources)

    return {"answer": answer, "sources": sources, "chunks_used": len(results)}

# ---------------------------------------------------------------------------
# RAG — Streaming answer
# ---------------------------------------------------------------------------
async def stream_answer(question: str, user_id: str = "default") -> AsyncIterator[str]:
    results = search_documents(question, top_k=TOP_K_CHUNKS, user_id=user_id)

    if not results:
        yield "I couldn't find that in your documents. Try uploading more relevant files or rephrasing your question."
        return

    context, sources = _build_context(results)
    messages         = _build_rag_messages(context, question, user_id)
    client           = _get_client()

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

    _update_memory(user_id, question, full_answer)
    log.info("Streamed RAG answer for '%s…' (%d chunks)", question[:60], len(results))

# ---------------------------------------------------------------------------
# General AI — Standard answer (GOD MODE)
# ---------------------------------------------------------------------------
async def ask_general(question: str, user_id: str = "default") -> dict:
    messages = _build_general_messages(question, user_id)
    client   = _get_client()

    response = client.chat.completions.create(
        model       = GROQ_MODEL,
        messages    = messages,
        temperature = 0.75,
        max_tokens  = MAX_TOKENS,
    )

    answer = response.choices[0].message.content.strip()
    _update_memory(user_id, question, answer)
    log.info("General AI answered for user=%s", user_id)

    return {"answer": answer, "sources": [], "chunks_used": 0}

# ---------------------------------------------------------------------------
# General AI — Streaming (GOD MODE)
# ---------------------------------------------------------------------------
async def stream_general(question: str, user_id: str = "default") -> AsyncIterator[str]:
    messages = _build_general_messages(question, user_id)
    client   = _get_client()

    stream = client.chat.completions.create(
        model       = GROQ_MODEL,
        messages    = messages,
        temperature = 0.75,
        max_tokens  = MAX_TOKENS,
        stream      = True,
    )

    full_answer = ""
    for chunk in stream:
        token = chunk.choices[0].delta.content or ""
        if token:
            full_answer += token
            yield token

    _update_memory(user_id, question, full_answer)
    log.info("Streamed general AI for user=%s", user_id)

# ---------------------------------------------------------------------------
# Memory management
# ---------------------------------------------------------------------------
def clear_memory(user_id: str = "default") -> None:
    _memories[user_id].clear()

def get_memory(user_id: str = "default") -> list[dict]:
    return list(_memories[user_id])