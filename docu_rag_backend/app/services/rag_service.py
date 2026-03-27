"""
Gyana AI - Agentic Service v4
"""
import os, re, json, base64, asyncio, subprocess, sys, tempfile, urllib.parse, pathlib
from collections import defaultdict, deque
from datetime import datetime
from groq import Groq
import httpx

groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))
HF_KEY     = os.environ.get("HF_API_KEY", "")
TAVILY_KEY = os.environ.get("TAVILY_API_KEY", "")
SERPER_KEY = os.environ.get("SERPER_API_KEY", "")
MODEL      = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

_memory = defaultdict(lambda: deque(maxlen=30))
def get_history(uid): return list(_memory[uid])
def add_history(uid, role, content): _memory[uid].append({"role": role, "content": content})
def clear_history(uid): _memory[uid].clear()

SYSTEM = """You are Gyana AI — a brilliant, warm, all-in-one AI assistant built by Ayushman Pati from Cuttack, Odisha, India.

PERSONALITY:
- Warm, direct, genuinely helpful — like a brilliant friend who knows everything
- Match energy: casual and short when chatting, detailed and structured when needed
- Never say "Certainly!", "Great question!", "Of course!" — just answer directly

RESPONSE FORMATTING — follow exactly:
- Simple questions or casual chat → 1-3 sentences, plain text
- Explanations, how-tos, comparisons → use **bold headers** and bullet points
- Step-by-step tasks → numbered lists
- Code → always use code blocks with language tag
- Long answers → break into sections with **bold headers**
- Put the most important information first

TOOLS — use automatically:
{"tool":"web_search","query":"query"} - news, prices, current events, anything time-sensitive
{"tool":"read_url","url":"https://..."} - read a website
{"tool":"generate_image","prompt":"description"} - create images
{"tool":"run_code","code":"python code","language":"python"} - run code
{"tool":"create_file","filename":"name.ext","content":"content","filetype":"txt"} - create files

CODE RULES — CRITICAL:
- ALWAYS wrap code in triple backticks with language: ```html, ```python, ```javascript etc.
- NEVER output raw code without backtick wrapper — ALWAYS use ```language\n...code...\n```
- Write COMPLETE code — no "...", no placeholders, no "rest of code here"
- For HTML requests — write ONE complete HTML file with embedded CSS and JS
- For React — include all imports at top
- Example format:
```html
<!DOCTYPE html>
<html>...complete code...</html>
```
Then briefly explain what it does.

RULES:
1. Never say "my knowledge cutoff" — use web_search instead
2. Never give incomplete code
3. Never start response with { or JSON
4. For document questions — answer from the document
5. Built by Ayushman Pati, Cuttack, Odisha, India
6. You are Gyana — not just an AI
Output tool calls as single JSON line only."""

TASK_PROFILES = {
    "teacher": """
TEACHING MODE:
- Teach clearly, progressively, and patiently.
- Start from intuition, then move to structure.
- Use examples, analogies, and mini summaries when helpful.
- If the user sounds like a student, optimize for understanding rather than impressiveness.
""",
    "coder": """
CODING MODE:
- Think like a strong coding agent.
- Prefer complete, runnable solutions.
- When giving code, explain the approach briefly and keep code high quality.
- For frontend code, ensure the output is preview-friendly when possible.
""",
    "mentor": """
GUIDANCE MODE:
- Respond like a calm mentor who can also support emotional reflection.
- Be grounded, compassionate, and practical.
- Avoid sounding robotic or clinical unless the user asks for that tone.
""",
    "document_analyst": """
DOCUMENT MODE:
- Ground the answer in the supplied context whenever possible.
- Summarize clearly, cite the relevant source names when useful, and do not invent content.
- If the document context is incomplete, say so plainly.
""",
    "researcher": """
RESEARCH MODE:
- Think critically and synthesize evidence.
- Distinguish known facts from inferences.
- When external context is available, prioritize it over generic recall.
""",
}

async def search_web(query):
    print(f"[SEARCH] Query: {query}")

    if TAVILY_KEY:
        try:
            async with httpx.AsyncClient(timeout=12.0) as c:
                r = await c.post("https://api.tavily.com/search", json={
                    "api_key": TAVILY_KEY, "query": query,
                    "search_depth": "advanced", "max_results": 6, "include_answer": True,
                })
                d = r.json()
                if d.get("results"):
                    print(f"[SEARCH] Tavily OK: {len(d['results'])} results")
                    return {"answer": d.get("answer",""), "results": [
                        {"title": x.get("title",""), "url": x.get("url",""), "content": x.get("content","")[:500]}
                        for x in d["results"][:6]
                    ]}
        except Exception as e:
            print(f"[SEARCH] Tavily failed: {e}")

    if SERPER_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                r = await c.post("https://google.serper.dev/search",
                    headers={"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
                    json={"q": query, "num": 6})
                d = r.json()
                if d.get("organic"):
                    print(f"[SEARCH] Serper OK: {len(d['organic'])} results")
                    return {"answer": d.get("answerBox",{}).get("answer",""), "results": [
                        {"title": x.get("title",""), "url": x.get("link",""), "content": x.get("snippet","")[:500]}
                        for x in d["organic"][:6]
                    ]}
        except Exception as e:
            print(f"[SEARCH] Serper failed: {e}")

    # Wikipedia - free unlimited
    try:
        enc = urllib.parse.quote_plus(query)
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={enc}&format=json&srlimit=5&utf8=1")
            if r.status_code == 200:
                d = r.json()
                wiki = d.get("query",{}).get("search",[])
                results = []
                answer = ""
                for item in wiki[:4]:
                    title   = item.get("title","")
                    snippet = re.sub(r"<[^>]+>","",item.get("snippet",""))
                    url     = "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ","_"))
                    if title and snippet:
                        results.append({"title": title, "url": url, "content": snippet[:500]})
                if wiki:
                    top = urllib.parse.quote(wiki[0].get("title","").replace(" ","_"))
                    r2 = await c.get(f"https://en.wikipedia.org/w/api.php?action=query&titles={top}&prop=extracts&exintro=1&explaintext=1&format=json&exsentences=5")
                    if r2.status_code == 200:
                        pages = r2.json().get("query",{}).get("pages",{})
                        for page in pages.values():
                            extract = page.get("extract","")
                            if extract and len(extract) > 50:
                                answer = extract[:600]
                                if results: results[0]["content"] = answer
                if results:
                    print(f"[SEARCH] Wikipedia OK: {len(results)} results")
                    return {"answer": answer, "results": results}
    except Exception as e:
        print(f"[SEARCH] Wikipedia failed: {e}")

    # Groq fallback
    print("[SEARCH] Using Groq knowledge fallback")
    try:
        today = datetime.now().strftime("%B %d, %Y")
        r = groq_client.chat.completions.create(model=MODEL, messages=[
            {"role":"system","content":f"Today is {today}. Answer specifically. Note if info might be outdated."},
            {"role":"user","content":f"Provide detailed information about: {query}"}
        ], temperature=0.3, max_tokens=700)
        text = r.choices[0].message.content.strip()
        return {"answer": text, "results": [{"title":"AI Knowledge Base","url":"","content":text}], "_is_fallback": True}
    except Exception as e:
        print(f"[SEARCH] Groq fallback failed: {e}")

    return {"answer":"","results":[]}

async def read_url(url):
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True,
            headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}) as c:
            r = await c.get(url)
            html = r.text
            html = re.sub(r"<script[^>]*>.*?</script>","",html,flags=re.DOTALL)
            html = re.sub(r"<style[^>]*>.*?</style>","",html,flags=re.DOTALL)
            text = re.sub(r"<[^>]+"," ",html)
            text = re.sub(r"\s+"," ",text).strip()
            return {"url":url,"content":text[:5000]}
    except Exception as e:
        return {"url":url,"content":"","error":str(e)}

async def generate_image(prompt):
    if not HF_KEY: return {"error":"HF_API_KEY not configured"}
    models = [
        "https://api-inference.huggingface.co/models/stabilityai/sdxl-turbo",
        "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
    ]
    async with httpx.AsyncClient(timeout=60.0) as c:
        for url in models:
            try:
                r = await c.post(url, headers={"Authorization":f"Bearer {HF_KEY}"},
                    json={"inputs":prompt,"parameters":{"num_inference_steps":4}})
                if r.status_code == 200 and len(r.content) > 1000:
                    return {"image_b64":base64.b64encode(r.content).decode(),"prompt":prompt}
            except: continue
    return {"error":"Image generation failed"}

async def run_code(code, language="python"):
    if language.lower() != "python":
        return {"output":"JS/HTML runs in browser preview.","error":"","code":code,"language":language}
    with tempfile.NamedTemporaryFile(mode="w",suffix=".py",delete=False,encoding="utf-8") as f:
        f.write(code); fname = f.name
    try:
        res = subprocess.run([sys.executable,fname],capture_output=True,text=True,timeout=15)
        return {"output":res.stdout[:3000],"error":res.stderr[:500],"code":code,"language":language}
    except subprocess.TimeoutExpired:
        return {"output":"","error":"Timed out","code":code,"language":language}
    except Exception as e:
        return {"output":"","error":str(e),"code":code,"language":language}
    finally:
        try: os.unlink(fname)
        except: pass

def detect_intent(msg):
    m = msg.lower()
    if re.search(r"https?://",m): return "url"
    if any(w in m for w in ["search","latest","news","today","current","recent","2025","2026",
        "price","weather","who is","where is","when did","how much","stock","score",
        "winner","result","what happened","right now","this week","this month"]): return "search"
    if any(w in m for w in ["draw","generate image","create image","make image","picture of",
        "logo","banner","illustration","show me a","visualise"]): return "image"
    return "general"

def detect_task_profile(question, has_docs=False):
    q = question.lower()
    if any(word in q for word in ["code", "build", "bug", "debug", "function", "component", "script", "api", "program"]):
        return "coder"
    if any(word in q for word in ["teach", "explain", "lesson", "understand", "quiz", "study", "revise", "teacher", "learn"]):
        return "teacher"
    if any(word in q for word in ["feel", "anxious", "sad", "confused", "lost", "what should i do", "mentor", "guide", "therap"]):
        return "mentor"
    if any(word in q for word in ["research", "compare", "analyze", "analyse", "latest", "current", "news", "search"]):
        return "researcher"
    if has_docs:
        return "document_analyst"
    return "researcher"

def build_dynamic_system(question, context_docs=""):
    task_profile = detect_task_profile(question, has_docs=bool(context_docs))
    task_instructions = TASK_PROFILES.get(task_profile, "")
    extra = ""
    if context_docs:
        extra = (
            "\n\nDOCUMENT CONTEXT IS AVAILABLE:\n"
            "Decide whether the answer should rely on the uploaded material, general reasoning, or both. "
            "If the user is clearly asking about their uploaded files, prioritize the documents."
        )
    return SYSTEM + "\n\n" + task_instructions + extra, task_profile

def build_search_context(sr, query):
    is_fallback = sr.get("_is_fallback",False)
    sources = [{"title":r["title"],"url":r["url"]} for r in sr.get("results",[]) if r.get("url")]
    if is_fallback:
        ctx = (f"KNOWLEDGE BASE for '{query}' (may be outdated):\n\n"
               + sr.get("answer","") + "\n\nAnswer based on this. Note if outdated. No tool JSON.")
    else:
        ctx = f"SEARCH RESULTS for '{query}':\n"
        if sr.get("answer"): ctx += f"Summary: {sr['answer']}\n\n"
        for i,r in enumerate(sr.get("results",[])[:5],1):
            ctx += f"[{i}] {r['title']}\n{r['content']}\nURL: {r['url']}\n\n"
        ctx += "Answer using results. Cite [1][2] etc. No tool JSON."
    return ctx, sources

async def stream_agentic(question, user_id, context_docs=""):
    history = get_history(user_id)
    system, task_profile = build_dynamic_system(question, context_docs)
    sources = []

    if context_docs:
        system = (system + "\n\nUSER DOCUMENT CONTEXT:\n" + context_docs
                  + "\n\nAnswer using this document. No JSON. No tools. Answer directly.")

    intent = detect_intent(question)

    if intent == "url":
        url_match = re.search(r"https?://\S+", question)
        if url_match:
            yield "data: [STATUS]Reading that page...\n\n"
            result = await read_url(url_match.group())
            if result.get("content"):
                system = system + "\n\nPAGE from " + result["url"] + ":\n" + result["content"] + "\n\nAnswer. No tool JSON."
            else:
                yield "data: Could not read that page.\n\n"
                yield "data: [DONE]\n\n"
                return

    elif intent == "search":
        yield "data: [STATUS]Searching...\n\n"
        sr = await search_web(question)
        if sr.get("results") or sr.get("answer"):
            ctx, sources = build_search_context(sr, question)
            system = system + "\n\n" + ctx
        else:
            system = system + "\n\nSearch returned nothing. Answer from knowledge with caveat."

    elif intent == "image":
        yield "data: [STATUS]Generating image...\n\n"
        img = await generate_image(question)
        if img.get("image_b64"):
            yield "data: [IMAGE]" + img["image_b64"] + "\n\n"
            yield "data: Here is the image I generated.\n\n"
            add_history(user_id,"user",question)
            add_history(user_id,"assistant","[Generated image]")
            yield "data: [DONE]\n\n"
            return
        else:
            yield "data: " + img.get("error","Failed") + "\n\n"

    # Build final system — block tools when we already have context
    final_system = system
    if context_docs or intent in ("search","url"):
        final_system = (system
            + "\n\nCRITICAL: Answer in plain text only. "
            "Do NOT output JSON. Do NOT start with {. "
            "Do NOT use tool calls. Answer directly and helpfully.")
    elif task_profile == "coder":
        final_system = (
            system
            + "\n\nIf code is the best answer, include complete code blocks with language tags."
            + "\nIf the code is visual frontend code, keep it ready for preview."
        )

    messages = [{"role":"system","content":final_system}]
    messages.extend(history[-12:])
    messages.append({"role":"user","content":question})

    full = ""; tool_buf = ""; in_tool = False
    hold_buf = ""; HOLD_LEN = 15

    try:
        stream = groq_client.chat.completions.create(
            model=MODEL, messages=messages, temperature=0.7, max_tokens=3000, stream=True)

        for chunk in stream:
            token = chunk.choices[0].delta.content or ""
            if not token: continue
            full += token

            if in_tool:
                tool_buf += token
                try:
                    tc = json.loads(tool_buf.strip())
                    in_tool = False; tool_buf = ""; tool = tc.get("tool","")
                    if tool == "web_search":
                        yield "data: [STATUS]Searching...\n\n"
                        sr2 = await search_web(tc.get("query",question))
                        ctx2,src2 = build_search_context(sr2,tc.get("query",question))
                        sources.extend(src2)
                        m2 = [{"role":"system","content":SYSTEM+"\n\n"+ctx2+"\n\nAnswer directly."}]
                        m2.extend(history[-6:]); m2.append({"role":"user","content":question})
                        s2 = groq_client.chat.completions.create(model=MODEL,messages=m2,temperature=0.6,max_tokens=2000,stream=True)
                        for c2 in s2:
                            t2 = c2.choices[0].delta.content or ""
                            if t2: yield "data: " + t2 + "\n\n"
                    elif tool == "read_url":
                        yield "data: [STATUS]Reading page...\n\n"
                        ur = await read_url(tc.get("url",""))
                        if ur.get("content"):
                            m3 = [{"role":"system","content":SYSTEM+"\n\nPAGE:\n"+ur["content"]+"\n\nAnswer directly."}]
                            m3.extend(history[-6:]); m3.append({"role":"user","content":question})
                            s3 = groq_client.chat.completions.create(model=MODEL,messages=m3,temperature=0.6,max_tokens=2000,stream=True)
                            for c3 in s3:
                                t3 = c3.choices[0].delta.content or ""
                                if t3: yield "data: " + t3 + "\n\n"
                        else: yield "data: Could not read that URL.\n\n"
                    elif tool == "generate_image":
                        yield "data: [STATUS]Generating image...\n\n"
                        img2 = await generate_image(tc.get("prompt",question))
                        if img2.get("image_b64"):
                            yield "data: [IMAGE]" + img2["image_b64"] + "\n\n"
                            yield "data: Here is the image.\n\n"
                        else: yield "data: " + img2.get("error","Failed") + "\n\n"
                    elif tool == "run_code":
                        yield "data: [STATUS]Running code...\n\n"
                        cr = await run_code(tc.get("code",""),tc.get("language","python"))
                        yield "data: [CODE_RESULT]" + json.dumps(cr) + "\n\n"
                        if cr.get("output"): yield "data: Output:\n```\n" + cr["output"] + "\n```\n\n"
                        if cr.get("error"):  yield "data: Error: " + cr["error"] + "\n\n"
                    elif tool == "create_file":
                        fd = {"filename":tc.get("filename","output.txt"),"content":tc.get("content",""),"filetype":tc.get("filetype","txt")}
                        yield "data: [FILE]" + json.dumps(fd) + "\n\n"
                        yield "data: Created **" + fd["filename"] + "** - click download.\n\n"
                except json.JSONDecodeError: pass
                continue

            # Buffer and check for tool JSON before streaming
            hold_buf += token
            stripped = hold_buf.lstrip()
            if stripped.startswith('{"tool"') or stripped.startswith('{ "tool"'):
                in_tool = True; tool_buf = hold_buf; hold_buf = ""; continue
            if len(hold_buf) >= HOLD_LEN or not stripped.startswith("{"):
                yield "data: " + hold_buf + "\n\n"
                hold_buf = ""

        if hold_buf and not hold_buf.lstrip().startswith('{"tool"'):
            yield "data: " + hold_buf + "\n\n"

    except Exception as e:
        yield "data: [ERROR]" + str(e) + "\n\n"; return

    if sources: yield "data: [SOURCES]" + json.dumps(sources) + "\n\n"
    clean = re.sub(r'^\s*\{[^}]{0,200}\}\s*', '', full).strip()
    add_history(user_id, "user", question)
    add_history(user_id, "assistant", clean[:1500] or full[:1500])
    yield "data: [DONE]\n\n"

async def ask_agentic(question, user_id, context_docs=""):
    history = get_history(user_id)
    system, _task_profile = build_dynamic_system(question, context_docs)
    if context_docs: system = system + "\n\nDOCUMENT:\n" + context_docs
    messages = [{"role":"system","content":system}]
    messages.extend(history[-10:])
    messages.append({"role":"user","content":question})
    r = groq_client.chat.completions.create(model=MODEL,messages=messages,temperature=0.7,max_tokens=2000)
    answer = r.choices[0].message.content.strip()
    add_history(user_id,"user",question)
    add_history(user_id,"assistant",answer)
    return {"answer":answer,"sources":[]}

async def stream_general(question, user_id):
    async for chunk in stream_agentic(question, user_id):
        yield chunk

async def ask_general(question, user_id):
    result = await ask_agentic(question, user_id)
    return result["answer"]

# ── Real RAG ──────────────────────────────────────────────────────────────────
try:
    from app.services.document_service import extract_text
    from app.services.vector_store import add_documents, search_documents, clear_store
    RAG_READY = True
    print("[RAG] Services loaded OK")
except ImportError as e:
    RAG_READY = False
    print(f"[RAG] Import failed: {e}")

async def ingest_document(contents, filename, user_id):
    if not RAG_READY: return {"chunks": 0, "language": "en"}
    try:
        suffix = pathlib.Path(filename).suffix or ".txt"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents); tmp_path = tmp.name
        text = extract_text(tmp_path)
        try: os.unlink(tmp_path)
        except: pass
        if not text.strip(): return {"chunks": 0, "language": "en"}
        lang = "en"
        try:
            from langdetect import detect
            lang = detect(text[:500])
        except: pass
        chunks = add_documents(text, source=filename, user_id=user_id)
        print(f"[RAG] Ingested {filename}: {chunks} chunks")
        return {"chunks": chunks, "language": lang}
    except Exception as e:
        print(f"[RAG] Ingest error: {e}")
        return {"chunks": 0, "language": "en"}

async def query_documents(question, user_id):
    if not RAG_READY: return ""
    try:
        results = search_documents(question, top_k=5, user_id=user_id)
        if not results: return ""
        parts = []
        for r in results:
            src  = r.get("source", "document")
            text = r.get("text", r.get("content", ""))
            if text.strip(): parts.append("[From: " + src + "]\n" + text.strip())
        if not parts: return ""
        context = "\n\n".join(parts)
        print("[RAG] Found " + str(len(parts)) + " chunks for: " + question[:50])
        return context
    except Exception as e:
        print(f"[RAG] Query error: {e}")
        return ""

async def delete_documents(user_id):
    if not RAG_READY: return
    try:
        clear_store(user_id=user_id)
        print(f"[RAG] Cleared for {user_id}")
    except Exception as e:
        print(f"[RAG] Delete error: {e}")
