"""
Gyana AI - Agentic Service
One AI for everything. DuckDuckGo search, unlimited free.
"""

import os
import re
import json
import base64
import asyncio
import subprocess
import sys
import tempfile
import urllib.parse
from collections import defaultdict, deque
from groq import Groq
import httpx

# ── Clients ───────────────────────────────────────────────────────────────────
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
HF_KEY      = os.environ.get("HF_API_KEY", "")
TAVILY_KEY  = os.environ.get("TAVILY_API_KEY", "")
MODEL       = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

# ── Per-user memory ───────────────────────────────────────────────────────────
_memory = defaultdict(lambda: deque(maxlen=30))

def get_history(uid):
    return list(_memory[uid])

def add_history(uid, role, content):
    _memory[uid].append({"role": role, "content": content})

def clear_history(uid):
    _memory[uid].clear()

# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM = (
    "You are Gyana AI, the most powerful all-in-one AI, built by Ayushman Pati "
    "from Cuttack, Odisha, India.\n\n"
    "You are simultaneously:\n"
    "- World-class programmer in every language\n"
    "- Real-time researcher with live web search\n"
    "- Creative problem solver\n"
    "- Warm friend, therapist, and life coach\n"
    "- Teacher who can explain anything\n"
    "- Business strategist and startup advisor\n"
    "- Writer: code, essays, emails, reports, stories\n\n"
    "TOOLS - use automatically when needed:\n\n"
    '{"tool":"web_search","query":"search query"}\n'
    "Use when: news, current events, prices, weather, sports, recent info, "
    "stock prices, anything time-sensitive, any fact you are not 100% sure about\n\n"
    '{"tool":"read_url","url":"https://..."}\n'
    "Use when: user pastes a URL or asks to read/summarise a website\n\n"
    '{"tool":"generate_image","prompt":"detailed visual description"}\n'
    "Use when: user asks to draw, generate, create, or show any image\n\n"
    '{"tool":"run_code","code":"python code","language":"python"}\n'
    "Use when: user asks to execute/run code or needs complex calculations\n\n"
    '{"tool":"create_file","filename":"name.ext","content":"full content","filetype":"txt"}\n'
    "Use when: user asks to create a downloadable document, report, or file\n\n"
    "RULES:\n"
    "1. NEVER say 'my knowledge cutoff' - use web_search instead\n"
    "2. NEVER give incomplete code - always write full working solutions\n"
    "3. NEVER say 'I cannot' - find a way or explain clearly\n"
    "4. For ANY question about current events, news, prices - ALWAYS search first\n"
    "5. Be direct and brilliant - no padding, no filler\n"
    "6. Match energy: casual when chatting, detailed when working\n"
    "7. If asked who built you: Ayushman Pati, from Cuttack, Odisha, India\n"
    "8. You are Gyana - never say you are just an AI\n"
    "Output tool calls as a single JSON line - nothing else on that line."
)

# ── Web search ──────────────────────────────────────────────────────────────
async def search_web(query):
    """
    Multi-source search — all free and unlimited:
    1. Tavily (if key set — best quality)
    2. Wikipedia API (unlimited, no key, factual queries)
    3. Serper.dev (if key set)
    4. Groq-powered reasoning (always works — final fallback)
    """
    print(f"[SEARCH] Query: {query}")
    results = []
    answer  = ""

    # 1. Tavily (best, needs key)
    if TAVILY_KEY:
        try:
            async with httpx.AsyncClient(timeout=12.0) as c:
                r = await c.post("https://api.tavily.com/search", json={
                    "api_key": TAVILY_KEY,
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": 6,
                    "include_answer": True,
                })
                d = r.json()
                if d.get("results"):
                    print(f"[SEARCH] Tavily OK: {len(d['results'])} results")
                    return {
                        "answer": d.get("answer", ""),
                        "results": [
                            {"title": x.get("title",""), "url": x.get("url",""), "content": x.get("content","")[:500]}
                            for x in d["results"][:6]
                        ]
                    }
        except Exception as e:
            print(f"[SEARCH] Tavily failed: {e}")

    # 2. Serper.dev (needs key — 2500 free/month)
    serper_key = os.environ.get("SERPER_API_KEY", "")
    if serper_key:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post("https://google.serper.dev/search",
                    headers={"X-API-KEY": serper_key, "Content-Type": "application/json"},
                    json={"q": query, "num": 6}
                )
                d = r.json()
                organic = d.get("organic", [])
                if organic:
                    print(f"[SEARCH] Serper OK: {len(organic)} results")
                    return {
                        "answer": d.get("answerBox", {}).get("answer", ""),
                        "results": [
                            {"title": x.get("title",""), "url": x.get("link",""), "content": x.get("snippet","")[:500]}
                            for x in organic[:6]
                        ]
                    }
        except Exception as e:
            print(f"[SEARCH] Serper failed: {e}")

    # 3. Wikipedia API — unlimited, free, no key, always works
    try:
        enc = urllib.parse.quote_plus(query)
        async with httpx.AsyncClient(timeout=10.0) as c:
            # Wikipedia search
            r = await c.get(
                f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={enc}&format=json&srlimit=5"
            )
            if r.status_code == 200:
                d = r.json()
                wiki_results = d.get("query", {}).get("search", [])
                for item in wiki_results[:4]:
                    title   = item.get("title", "")
                    snippet = item.get("snippet", "")
                    # Strip HTML tags from snippet
                    snippet = re.sub(r'<[^>]+>', '', snippet)
                    url     = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(title)}"
                    results.append({"title": title, "url": url, "content": snippet[:400]})

                # Also get full extract for top result
                if wiki_results:
                    top = urllib.parse.quote(wiki_results[0].get("title",""))
                    r2 = await c.get(
                        f"https://en.wikipedia.org/w/api.php?action=query&titles={top}&prop=extracts&exintro=1&explaintext=1&format=json"
                    )
                    if r2.status_code == 200:
                        pages = r2.json().get("query", {}).get("pages", {})
                        for page in pages.values():
                            extract = page.get("extract", "")[:600]
                            if extract:
                                answer = extract
                                if results:
                                    results[0]["content"] = extract

                print(f"[SEARCH] Wikipedia OK: {len(results)} results")
    except Exception as e:
        print(f"[SEARCH] Wikipedia failed: {e}")

    if results:
        return {"answer": answer, "results": results}

    # 4. Groq-powered reasoning — always works, uses AI knowledge
    print("[SEARCH] Using Groq knowledge fallback")
    try:
        today = __import__("datetime").datetime.now().strftime("%B %d, %Y")
        r = groq_client.chat.completions.create(
            model=MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Today is {today}. You are a knowledgeable assistant. "
                        "Answer questions about current events, news, and facts based on your training data. "
                        "Be specific. If your information might be outdated, say so clearly with the approximate date of your knowledge."
                    )
                },
                {"role": "user", "content": f"Give me detailed, specific information about: {query}"}
            ],
            temperature=0.3,
            max_tokens=600
        )
        fallback_text = r.choices[0].message.content.strip()
        print(f"[SEARCH] Groq fallback OK: {len(fallback_text)} chars")
        return {
            "answer": fallback_text,
            "results": [{"title": "AI Knowledge Base", "url": "", "content": fallback_text}],
            "_is_fallback": True
        }
    except Exception as e:
        print(f"[SEARCH] Groq fallback failed: {e}")

    return {"answer": "", "results": []}
# ── Read URL ──────────────────────────────────────────────────────────────────
async def read_url(url):
    try:
        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        async with httpx.AsyncClient(
            timeout=15.0, follow_redirects=True,
            headers={"User-Agent": ua}
        ) as c:
            r = await c.get(url)
            html = r.text
            html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
            html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL)
            text = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s+', ' ', text).strip()
            return {"url": url, "content": text[:5000]}
    except Exception as e:
        return {"url": url, "content": "", "error": str(e)}


# ── Generate image ────────────────────────────────────────────────────────────
async def generate_image(prompt):
    if not HF_KEY:
        return {"error": "HF_API_KEY not configured"}
    models = [
        "https://api-inference.huggingface.co/models/stabilityai/sdxl-turbo",
        "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
    ]
    async with httpx.AsyncClient(timeout=60.0) as c:
        for url in models:
            try:
                r = await c.post(
                    url,
                    headers={"Authorization": "Bearer {}".format(HF_KEY)},
                    json={"inputs": prompt, "parameters": {"num_inference_steps": 4}}
                )
                if r.status_code == 200 and len(r.content) > 1000:
                    return {
                        "image_b64": base64.b64encode(r.content).decode(),
                        "prompt": prompt
                    }
            except Exception:
                continue
    return {"error": "Image generation failed - try again"}


# ── Run code ──────────────────────────────────────────────────────────────────
async def run_code(code, language="python"):
    if language.lower() != "python":
        return {
            "output": "JavaScript/HTML/CSS runs in the browser preview.",
            "error": "", "code": code, "language": language
        }
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(code)
        fname = f.name
    try:
        res = subprocess.run(
            [sys.executable, fname],
            capture_output=True, text=True, timeout=15
        )
        return {
            "output": res.stdout[:3000],
            "error": res.stderr[:500],
            "code": code,
            "language": language
        }
    except subprocess.TimeoutExpired:
        return {"output": "", "error": "Timed out (15s)", "code": code, "language": language}
    except Exception as e:
        return {"output": "", "error": str(e), "code": code, "language": language}
    finally:
        try:
            os.unlink(fname)
        except Exception:
            pass


# ── Intent detection ──────────────────────────────────────────────────────────
def detect_intent(msg):
    m = msg.lower()
    if re.search(r'https?://', m):
        return "url"
    search_words = [
        "search", "latest", "news", "today", "current", "recent",
        "2025", "2026", "price", "weather", "who is", "where is",
        "when did", "how much", "stock", "score", "winner", "result",
        "what happened", "right now", "this week", "this month"
    ]
    if any(w in m for w in search_words):
        return "search"
    image_words = [
        "draw", "generate image", "create image", "make image",
        "picture of", "photo of", "logo", "banner", "illustration",
        "show me a", "visualise", "design image"
    ]
    if any(w in m for w in image_words):
        return "image"
    return "general"


# ── Build search context ──────────────────────────────────────────────────────
def build_search_context(sr, query):
    is_fallback = sr.get("_is_fallback", False)
    sources = [
        {"title": r["title"], "url": r["url"]}
        for r in sr.get("results", [])
        if r.get("url")
    ]

    if is_fallback:
        ctx = (
            "KNOWLEDGE BASE RESULTS for '{}' (Note: this is from AI training data, "
            "may not reflect very recent events):\n\n".format(query)
        )
        ctx += sr.get("answer", "") + "\n\n"
        ctx += (
            "Answer the question based on this information. "
            "Be transparent that this comes from training data and mention the approximate "
            "date range of your knowledge if relevant. "
            "Do NOT output any tool JSON."
        )
    else:
        ctx = "LIVE SEARCH RESULTS for '{}':\n".format(query)
        if sr.get("answer"):
            ctx += "Summary: {}\n\n".format(sr["answer"])
        for i, r in enumerate(sr.get("results", [])[:5], 1):
            ctx += "[{}] {}\n{}\nURL: {}\n\n".format(
                i, r["title"], r["content"], r["url"]
            )
        ctx += (
            "Answer using these search results. "
            "Cite sources by number [1] [2] etc. Be specific and accurate. "
            "Do NOT output any tool JSON - answer directly."
        )
    return ctx, sources


# ── Main streaming function ───────────────────────────────────────────────────
async def stream_agentic(question, user_id, context_docs=""):
    history = get_history(user_id)
    system  = SYSTEM
    sources = []

    if context_docs:
        system = system + "\n\nUSER DOCUMENT CONTEXT:\n" + context_docs + "\nUse this when relevant."

    # Pre-routing
    intent = detect_intent(question)

    if intent == "url":
        url_match = re.search(r'https?://\S+', question)
        if url_match:
            yield "data: [STATUS]Reading that page...\n\n"
            result = await read_url(url_match.group())
            if result.get("content"):
                system = (
                    system
                    + "\n\nPAGE CONTENT from " + result["url"] + ":\n"
                    + result["content"]
                    + "\n\nAnswer the user's question about this page. Do NOT output tool JSON."
                )
            else:
                yield "data: Could not read that page.\n\n"
                yield "data: [DONE]\n\n"
                return

    elif intent == "search":
        yield "data: [STATUS]Searching the web...\n\n"
        sr = await search_web(question)
        if sr.get("results") or sr.get("answer"):
            ctx, sources = build_search_context(sr, question)
            system = system + "\n\n" + ctx

    elif intent == "image":
        yield "data: [STATUS]Generating image...\n\n"
        img = await generate_image(question)
        if img.get("image_b64"):
            yield "data: [IMAGE]" + img["image_b64"] + "\n\n"
            yield "data: Here's the image I generated for you.\n\n"
            add_history(user_id, "user", question)
            add_history(user_id, "assistant", "[Generated image]")
            yield "data: [DONE]\n\n"
            return
        else:
            err = img.get("error", "Image generation failed")
            yield "data: " + err + " Let me describe it instead.\n\n"

    # Stream LLM
    # If we already pre-searched or pre-loaded a URL, use a clean system
    # prompt that explicitly forbids tool JSON output
    clean_system = system
    if intent in ("search", "url"):
        clean_system = system + (
            "\n\nCRITICAL: You already have all the information you need above. "
            "Answer the user directly in plain text. "
            "Do NOT start with or output any JSON. "
            "Do NOT use any tool calls. "
            "Just answer naturally."
        )

    messages = [{"role": "system", "content": clean_system}]
    messages.extend(history[-12:])
    messages.append({"role": "user", "content": question})

    full     = ""
    tool_buf = ""
    in_tool  = False

    try:
        stream = groq_client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=3000,
            stream=True
        )

        for chunk in stream:
            token = chunk.choices[0].delta.content or ""
            if not token:
                continue
            full += token

            # Detect tool JSON — buffer it, never stream it raw
            if not in_tool:
                tool_start = full.find('{"tool"')
                if tool_start >= 0:
                    before = full[:tool_start].strip()
                    if before:
                        yield "data: " + before + "\n\n"
                    tool_buf = full[tool_start:]
                    in_tool = True
                    continue
                else:
                    yield "data: " + token + "\n\n"
                continue

            if in_tool:
                tool_buf += token
                try:
                    tc   = json.loads(tool_buf.strip())
                    in_tool  = False
                    tool_buf = ""
                    tool     = tc.get("tool", "")

                    if tool == "web_search":
                        yield "data: [STATUS]Searching the web...\n\n"
                        sr2 = await search_web(tc.get("query", question))
                        ctx2, src2 = build_search_context(sr2, tc.get("query", question))
                        sources.extend(src2)
                        msgs2 = [{"role": "system", "content": SYSTEM + "\n\n" + ctx2}]
                        msgs2.extend(history[-6:])
                        msgs2.append({"role": "user", "content": question})
                        s2 = groq_client.chat.completions.create(
                            model=MODEL, messages=msgs2,
                            temperature=0.6, max_tokens=2000, stream=True
                        )
                        for c2 in s2:
                            t2 = c2.choices[0].delta.content or ""
                            if t2:
                                yield "data: " + t2 + "\n\n"

                    elif tool == "read_url":
                        yield "data: [STATUS]Reading that page...\n\n"
                        ur = await read_url(tc.get("url", ""))
                        if ur.get("content"):
                            page_sys = (
                                SYSTEM + "\n\nPAGE CONTENT:\n"
                                + ur["content"]
                                + "\n\nAnswer the user's question. Do NOT output tool JSON."
                            )
                            msgs3 = [{"role": "system", "content": page_sys}]
                            msgs3.extend(history[-6:])
                            msgs3.append({"role": "user", "content": question})
                            s3 = groq_client.chat.completions.create(
                                model=MODEL, messages=msgs3,
                                temperature=0.6, max_tokens=2000, stream=True
                            )
                            for c3 in s3:
                                t3 = c3.choices[0].delta.content or ""
                                if t3:
                                    yield "data: " + t3 + "\n\n"
                        else:
                            yield "data: Could not read that URL.\n\n"

                    elif tool == "generate_image":
                        yield "data: [STATUS]Generating image...\n\n"
                        img2 = await generate_image(tc.get("prompt", question))
                        if img2.get("image_b64"):
                            yield "data: [IMAGE]" + img2["image_b64"] + "\n\n"
                            yield "data: Here's the image I generated.\n\n"
                        else:
                            yield "data: " + img2.get("error", "Image generation failed") + "\n\n"

                    elif tool == "run_code":
                        yield "data: [STATUS]Running code...\n\n"
                        cr = await run_code(tc.get("code", ""), tc.get("language", "python"))
                        yield "data: [CODE_RESULT]" + json.dumps(cr) + "\n\n"
                        if cr.get("output"):
                            yield "data: Output:\n```\n" + cr["output"] + "\n```\n\n"
                        if cr.get("error"):
                            yield "data: Error: " + cr["error"] + "\n\n"

                    elif tool == "create_file":
                        fd = {
                            "filename": tc.get("filename", "gyana_output.txt"),
                            "content":  tc.get("content", ""),
                            "filetype": tc.get("filetype", "txt"),
                        }
                        yield "data: [FILE]" + json.dumps(fd) + "\n\n"
                        yield "data: Created **" + fd["filename"] + "** - click download below.\n\n"

                except json.JSONDecodeError:
                    pass  # JSON still building
            # token already streamed above in the non-tool branch

    except Exception as e:
        yield "data: [ERROR]" + str(e) + "\n\n"
        return

    if sources:
        yield "data: [SOURCES]" + json.dumps(sources) + "\n\n"

    add_history(user_id, "user", question)
    add_history(user_id, "assistant", full[:1500])
    yield "data: [DONE]\n\n"


# ── Non-streaming ─────────────────────────────────────────────────────────────
async def ask_agentic(question, user_id, context_docs=""):
    history = get_history(user_id)
    system  = SYSTEM
    if context_docs:
        system = system + "\n\nDOCUMENT CONTEXT:\n" + context_docs

    messages = [{"role": "system", "content": system}]
    messages.extend(history[-10:])
    messages.append({"role": "user", "content": question})

    r = groq_client.chat.completions.create(
        model=MODEL, messages=messages,
        temperature=0.7, max_tokens=2000
    )
    answer = r.choices[0].message.content.strip()

    add_history(user_id, "user", question)
    add_history(user_id, "assistant", answer)
    return {"answer": answer, "sources": []}


# ── Backward compat ───────────────────────────────────────────────────────────
async def stream_general(question, user_id):
    async for chunk in stream_agentic(question, user_id):
        yield chunk


def ask_general(question, user_id):
    return asyncio.run(ask_agentic(question, user_id))["answer"]


# ── RAG stubs ─────────────────────────────────────────────────────────────────
async def ingest_document(contents, filename, user_id):
    return {"chunks": 0, "language": "en"}

async def query_documents(question, user_id):
    return ""

async def delete_documents(user_id):
    pass