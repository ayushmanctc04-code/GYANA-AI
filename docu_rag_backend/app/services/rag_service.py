"""
Gyana AI — Agentic Service
One AI for everything. Works like Claude.
DuckDuckGo web search — unlimited, free, no API key needed.
"""

import os, re, json, base64, asyncio, subprocess, sys, tempfile, urllib.parse
from collections import defaultdict, deque
from groq import Groq
import httpx

# ── Clients ───────────────────────────────────────────────────────────────────
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
HF_KEY      = os.environ.get("HF_API_KEY", "")
TAVILY_KEY  = os.environ.get("TAVILY_API_KEY", "")
MODEL       = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

# ── Per-user memory ───────────────────────────────────────────────────────────
_memory: dict = defaultdict(lambda: deque(maxlen=30))

def get_history(uid: str) -> list:
    return list(_memory[uid])

def add_history(uid: str, role: str, content: str):
    _memory[uid].append({"role": role, "content": content})

def clear_history(uid: str):
    _memory[uid].clear()

# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM = """You are Gyana AI — the most powerful all-in-one AI, built by Ayushman Pati from Cuttack, Odisha, India.

You are simultaneously:
- World-class programmer in every language
- Real-time researcher with live web search
- Creative problem solver
- Warm friend, therapist, and life coach
- Teacher who can explain anything
- Business strategist and startup advisor
- Writer: code, essays, emails, reports, stories

TOOLS — use automatically when needed:

{"tool":"web_search","query":"search query"}
Use when: news, current events, prices, weather, sports scores, recent info, stock prices, anything time-sensitive, any fact you are not 100% sure about

{"tool":"read_url","url":"https://..."}
Use when: user pastes a URL or asks to read/summarise a website

{"tool":"generate_image","prompt":"detailed visual description"}
Use when: user asks to draw, generate, create, or show any image

{"tool":"run_code","code":"python code","language":"python"}
Use when: user asks to execute/run code or needs complex calculations

{"tool":"create_file","filename":"name.ext","content":"full content","filetype":"txt"}
Use when: user asks to create a downloadable document, report, or file

RULES:
1. NEVER say "my knowledge cutoff" — use web_search instead
2. NEVER give incomplete code — always write full working solutions
3. NEVER say "I cannot" — find a way or explain clearly
4. For ANY question about current events, news, prices, people — ALWAYS search first
5. Be direct and brilliant — no padding, no filler
6. Match energy: casual when chatting, detailed when working
7. If asked who built you: Ayushman Pati, from Cuttack, Odisha, India
8. You are Gyana — never say you are "just an AI"

Output tool calls as a single JSON line — nothing else on that line."""

# ── Web search ────────────────────────────────────────────────────────────────
async def search_web(query: str) -> dict:
    """Search using Tavily (premium) or DuckDuckGo (free unlimited fallback)."""

    # Try Tavily first if key available
    if TAVILY_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post("https://api.tavily.com/search", json={
                    "api_key": TAVILY_KEY,
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": 6,
                    "include_answer": True,
                })
                d = r.json()
                if d.get("results"):
                    return {
                        "answer": d.get("answer", ""),
                        "results": [{"title": x.get("title",""), "url": x.get("url",""), "content": x.get("content","")[:500]} for x in d["results"][:6]]
                    }
        except:
            pass

    # DuckDuckGo — unlimited, always free
    try:
        enc = urllib.parse.quote_plus(query)
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

        async with httpx.AsyncClient(timeout=12.0, headers=headers, follow_redirects=True) as c:
            results = []

            # Instant answers API
            try:
                r = await c.get(f"https://api.duckduckgo.com/?q={enc}&format=json&no_html=1&skip_disambig=1")
                d = r.json()
                answer = d.get("AbstractText", "") or d.get("Answer", "")
                for t in d.get("RelatedTopics", [])[:4]:
                    if isinstance(t, dict) and t.get("Text"):
                        results.append({"title": t.get("Text","")[:80], "url": t.get("FirstURL",""), "content": t.get("Text","")[:400]})
            except:
                answer = ""

            # HTML search for real results
            try:
                r2 = await c.get(f"https://html.duckduckgo.com/html/?q={enc}")
                html = r2.text
                titles   = re.findall(r'class="result__a"[^>]*>(.*?)</a>', html, re.DOTALL)
                snippets = re.findall(r'class="result__snippet">(.*?)</a>', html, re.DOTALL)
                urls     = re.findall(r'uddg=(https?[^&"]+)', html)
                for i in range(min(len(titles), len(snippets), 6)):
                    t = re.sub(r'<[^>]+>', '', titles[i]).strip()
                    s = re.sub(r'<[^>]+>', '', snippets[i]).strip()
                    u = urllib.parse.unquote(urls[i]) if i < len(urls) else ""
                    if t and s:
                        results.append({"title": t[:100], "url": u, "content": s[:400]})
            except:
                pass

            return {"answer": answer, "results": results[:6]}

    except Exception as e:
        return {"error": str(e), "answer": "", "results": []}

# ── Read URL ──────────────────────────────────────────────────────────────────
async def read_url(url: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}) as c:
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
async def generate_image(prompt: str) -> dict:
    if not HF_KEY:
        return {"error": "HF_API_KEY not configured"}
    models = [
        "https://api-inference.huggingface.co/models/stabilityai/sdxl-turbo",
        "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
    ]
    async with httpx.AsyncClient(timeout=60.0) as c:
        for url in models:
            try:
                r = await c.post(url, headers={"Authorization": f"Bearer {HF_KEY}"},
                    json={"inputs": prompt, "parameters": {"num_inference_steps": 4}})
                if r.status_code == 200 and len(r.content) > 1000:
                    return {"image_b64": base64.b64encode(r.content).decode(), "prompt": prompt}
            except:
                continue
    return {"error": "Image generation failed — try again"}

# ── Run code ──────────────────────────────────────────────────────────────────
async def run_code(code: str, language: str = "python") -> dict:
    if language.lower() != "python":
        return {"output": "JavaScript/HTML/CSS runs in the browser preview panel.", "error": "", "code": code, "language": language}
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(code); fname = f.name
    try:
        res = subprocess.run([sys.executable, fname], capture_output=True, text=True, timeout=15)
        return {"output": res.stdout[:3000], "error": res.stderr[:500], "code": code, "language": language}
    except subprocess.TimeoutExpired:
        return {"output": "", "error": "Timed out (15s limit)", "code": code, "language": language}
    except Exception as e:
        return {"output": "", "error": str(e), "code": code, "language": language}
    finally:
        try: os.unlink(fname)
        except: pass

# ── Intent detection ──────────────────────────────────────────────────────────
def detect_intent(msg: str) -> str:
    m = msg.lower()
    if re.search(r'https?://', m): return "url"
    if any(w in m for w in ["search","latest","news","today","current","recent","2025","2026",
        "price","weather","who is","where is","when did","how much","stock","score","winner",
        "result","what happened","tell me about today","right now","this week","this month"]): return "search"
    if any(w in m for w in ["draw","generate image","create image","make image","picture of",
        "photo of","logo","banner","illustration","show me a","visualise","design image"]): return "image"
    return "general"

# ── Build search context string ───────────────────────────────────────────────
def build_search_context(sr: dict, query: str) -> tuple[str, list]:
    sources = [{"title": r["title"], "url": r["url"]} for r in sr.get("results", []) if r.get("url")]
    ctx = f"LIVE WEB SEARCH RESULTS for '{query}':\n"
    if sr.get("answer"):
        ctx += f"Quick answer: {sr['answer']}\n\n"
    for i, r in enumerate(sr.get("results", [])[:5], 1):
        ctx += f"[{i}] {r['title']}\n{r['content']}\nURL: {r['url']}\n\n"
    ctx += "Answer the question using these search results. Cite sources by number [1] [2] etc. Be specific and accurate."
    return ctx, sources

# ── Main streaming function ───────────────────────────────────────────────────
async def stream_agentic(question: str, user_id: str, context_docs: str = ""):
    history = get_history(user_id)
    system  = SYSTEM
    sources = []

    if context_docs:
        system += f"\n\nUSER'S UPLOADED DOCUMENT CONTEXT:\n{context_docs}\nUse this when relevant."

    # ── Pre-routing ────────────────────────────────────────────────────────────
    intent = detect_intent(question)

    if intent == "url":
        url_match = re.search(r'https?://\S+', question)
        if url_match:
            yield "data: [STATUS]Reading that page...\n\n"
            result = await read_url(url_match.group())
            if result.get("content"):
                system += f"\n\nPAGE CONTENT from {result['url']}:\n{result['content']}\nAnswer the user's question about this page. Do NOT output any tool JSON."
            else:
                yield f"data: Could not read that page. {result.get('error','')}\n\n"
                yield "data: [DONE]\n\n"
                return

    elif intent == "search":
        yield "data: [STATUS]Searching the web...\n\n"
        sr = await search_web(question)
        if sr.get("results") or sr.get("answer"):
            ctx, sources = build_search_context(sr, question)
            system += f"\n\n{ctx}"
            system += "\n\nYou already have live search results above. Answer directly. Do NOT output any {tool} JSON."

    elif intent == "image":
        yield "data: [STATUS]Generating image...\n\n"
        img = await generate_image(question)
        if img.get("image_b64"):
            yield f"data: [IMAGE]{img['image_b64']}\n\n"
            yield "data: Here's the image I generated for you.\n\n"
            add_history(user_id, "user", question)
            add_history(user_id, "assistant", f"[Generated image: {question}]")
            yield "data: [DONE]\n\n"
            return
        else:
            yield f"data: Image generation failed: {img.get('error')}. Let me describe it instead.\n\n"
            system += "

Do NOT output any tool call JSON. Answer directly."

    # ── Stream LLM ────────────────────────────────────────────────────────────
    messages = [{"role": "system", "content": system}]
    messages.extend(history[-12:])
    messages.append({"role": "user", "content": question})

    full      = ""
    tool_buf  = ""
    in_tool   = False
    sent_buf  = ""  # track what we've already sent to avoid re-sending

    try:
        stream = groq_client.chat.completions.create(
            model=MODEL, messages=messages,
            temperature=0.7, max_tokens=3000, stream=True
        )
        for chunk in stream:
            token = chunk.choices[0].delta.content or ""
            if not token: continue
            full += token

            # Detect start of tool JSON — buffer everything from { onwards
            if not in_tool and ('{"tool"' in full or ('{' in full and '"tool"' in full)):
                # Find where the tool JSON starts
                for marker in ['{"tool"', '{ "tool"']:
                    idx = full.find(marker)
                    if idx >= 0:
                        # Send everything before the tool call
                        before = full[:idx].strip()
                        unsent = before[len(sent_buf):]
                        if unsent.strip():
                            yield f"data: {unsent}\n\n"
                        tool_buf = full[idx:]
                        in_tool  = True
                        break
                if in_tool:
                    continue

            if in_tool:
                tool_buf += token
                try:
                    tc = json.loads(tool_buf.strip())
                    in_tool  = False
                    tool_buf = ""
                    tool     = tc.get("tool", "")

                    if tool == "web_search":
                        yield "data: [STATUS]Searching the web...\n\n"
                        sr2 = await search_web(tc.get("query", question))
                        ctx2, src2 = build_search_context(sr2, tc.get("query", question))
                        sources.extend(src2)
                        msgs2 = [{"role": "system", "content": SYSTEM + f"\n\n{ctx2}"}]
                        msgs2.extend(history[-6:])
                        msgs2.append({"role": "user", "content": question})
                        s2 = groq_client.chat.completions.create(model=MODEL, messages=msgs2, temperature=0.6, max_tokens=2000, stream=True)
                        for c2 in s2:
                            t2 = c2.choices[0].delta.content or ""
                            if t2: yield f"data: {t2}\n\n"

                    elif tool == "read_url":
                        yield "data: [STATUS]Reading that page...\n\n"
                        ur = await read_url(tc.get("url", ""))
                        if ur.get("content"):
                            msgs3 = [{"role": "system", "content": SYSTEM + f"\n\nPAGE CONTENT:\n{ur['content']}\nAnswer the user's question."}]
                            msgs3.extend(history[-6:])
                            msgs3.append({"role": "user", "content": question})
                            s3 = groq_client.chat.completions.create(model=MODEL, messages=msgs3, temperature=0.6, max_tokens=2000, stream=True)
                            for c3 in s3:
                                t3 = c3.choices[0].delta.content or ""
                                if t3: yield f"data: {t3}\n\n"
                        else:
                            yield f"data: Couldn't read that URL.\n\n"

                    elif tool == "generate_image":
                        yield "data: [STATUS]Generating image...\n\n"
                        img2 = await generate_image(tc.get("prompt", question))
                        if img2.get("image_b64"):
                            yield f"data: [IMAGE]{img2['image_b64']}\n\n"
                            yield "data: Here's the image I generated.\n\n"
                        else:
                            yield f"data: {img2.get('error', 'Image generation failed')}\n\n"

                    elif tool == "run_code":
                        yield "data: [STATUS]Running code...\n\n"
                        cr = await run_code(tc.get("code", ""), tc.get("language", "python"))
                        yield f"data: [CODE_RESULT]{json.dumps(cr)}\n\n"
                        if cr.get("output"): yield f"data: Output:\n```\n{cr['output']}\n```\n\n"
                        if cr.get("error"):  yield f"data: Error: {cr['error']}\n\n"

                    elif tool == "create_file":
                        fd = {"filename": tc.get("filename","gyana_output.txt"), "content": tc.get("content",""), "filetype": tc.get("filetype","txt")}
                        yield f"data: [FILE]{json.dumps(fd)}\n\n"
                        yield f"data: Created **{fd['filename']}** — click download below.\n\n"

                except json.JSONDecodeError:
                    pass  # JSON still building
            else:
                yield f"data: {token}\n\n"

    except Exception as e:
        yield f"data: [ERROR]{str(e)}\n\n"
        return

    if sources:
        yield f"data: [SOURCES]{json.dumps(sources)}\n\n"

    add_history(user_id, "user", question)
    add_history(user_id, "assistant", full[:1500])
    yield "data: [DONE]\n\n"

# ── Non-streaming ─────────────────────────────────────────────────────────────
async def ask_agentic(question: str, user_id: str, context_docs: str = "") -> dict:
    history = get_history(user_id)
    system  = SYSTEM
    if context_docs:
        system += f"\n\nDOCUMENT CONTEXT:\n{context_docs}"

    messages = [{"role": "system", "content": system}]
    messages.extend(history[-10:])
    messages.append({"role": "user", "content": question})

    r      = groq_client.chat.completions.create(model=MODEL, messages=messages, temperature=0.7, max_tokens=2000)
    answer = r.choices[0].message.content.strip()

    add_history(user_id, "user", question)
    add_history(user_id, "assistant", answer)
    return {"answer": answer, "sources": []}

# ── Backward compat ───────────────────────────────────────────────────────────
async def stream_general(question: str, user_id: str):
    async for chunk in stream_agentic(question, user_id):
        yield chunk

def ask_general(question: str, user_id: str) -> str:
    return asyncio.run(ask_agentic(question, user_id))["answer"]

# ── RAG stubs (used by main.py if Supabase available) ─────────────────────────
async def ingest_document(contents: bytes, filename: str, user_id: str) -> dict:
    """Override this with your actual RAG implementation."""
    return {"chunks": 0, "language": "en"}

async def query_documents(question: str, user_id: str) -> str:
    """Override this with your actual RAG implementation."""
    return ""

async def delete_documents(user_id: str):
    """Override this with your actual RAG implementation."""
    pass