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
MODEL      = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
FALLBACK_MODELS = [
    model.strip()
    for model in os.environ.get("GROQ_FALLBACK_MODELS", "").split(",")
    if model.strip()
]
HF_CHAT_MODEL = os.environ.get("HF_CHAT_MODEL", "Qwen/Qwen2.5-7B-Instruct")
HF_CODER_MODEL = os.environ.get("HF_CODER_MODEL", "Qwen/Qwen2.5-Coder-7B-Instruct")
SEARCH_FALLBACK_MAX_TOKENS = int(os.environ.get("SEARCH_FALLBACK_MAX_TOKENS", "400"))
STREAM_MAX_TOKENS = int(os.environ.get("STREAM_MAX_TOKENS", "1800"))
TOOL_FOLLOWUP_MAX_TOKENS = int(os.environ.get("TOOL_FOLLOWUP_MAX_TOKENS", "1400"))
ASK_MAX_TOKENS = int(os.environ.get("ASK_MAX_TOKENS", "1600"))
STREAM_HISTORY_LIMIT = int(os.environ.get("STREAM_HISTORY_LIMIT", "8"))
ASK_HISTORY_LIMIT = int(os.environ.get("ASK_HISTORY_LIMIT", "8"))

_memory = defaultdict(lambda: deque(maxlen=30))
_doc_focus = defaultdict(lambda: deque(maxlen=8))
def get_history(uid): return list(_memory[uid])
def add_history(uid, role, content): _memory[uid].append({"role": role, "content": content})
def clear_history(uid):
    _memory[uid].clear()
    _doc_focus[uid].clear()

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
- End with a crisp takeaway or next-step when helpful.
- Prefer this flow when useful:
  1. what it is,
  2. why it matters,
  3. simple example,
  4. quick recap.
- If solving a concept question, do not just define it; make it understandable.
""",
    "coder": """
CODING MODE:
- Think like a strong coding agent.
- Prefer complete, runnable solutions.
- When giving code, explain the approach briefly and keep code high quality.
- For frontend code, ensure the output is preview-friendly when possible.
- Format coding answers cleanly:
  1. one short intro sentence,
  2. one complete code block when a single-file solution is appropriate,
  3. a short "How it works" or "Next steps" section only if useful.
- Do not dump raw markdown fragments or multiple half-structured sections unless the user explicitly asks for a multi-file breakdown.
- Favor polished, modern defaults over bare-minimum boilerplate.
- For UI/frontend requests, produce something visually coherent, responsive, and presentable.
""",
    "mentor": """
GUIDANCE MODE:
- Respond like a calm mentor who can also support emotional reflection.
- Be grounded, compassionate, and practical.
- Avoid sounding robotic or clinical unless the user asks for that tone.
- Validate the feeling briefly, then move toward clarity and action.
- Prefer calm, human language over self-help clichés.
- When appropriate, offer 2-4 concrete next steps instead of abstract advice.
""",
    "document_analyst": """
DOCUMENT MODE:
- Ground the answer in the supplied context whenever possible.
- Summarize clearly, cite the relevant source names when useful, and do not invent content.
- If the document context is incomplete, say so plainly.
- Rewrite extracted material into clean prose or clean lists instead of dumping raw source text.
- Avoid markdown artifacts like stray **, repeated headings, or copied outline fragments.
- When solving from a file, organize the answer into readable sections and direct answers.
- When source labels or page/slide markers are available, mention them naturally in the answer.
- If the user asks to solve, answer the actual question directly before adding explanation.
- If the document appears academic, optimize for correctness, clarity, and usable study help.
""",
    "researcher": """
RESEARCH MODE:
- Think critically and synthesize evidence.
- Distinguish known facts from inferences.
- When external context is available, prioritize it over generic recall.
- Present the conclusion first, then the reasoning.
- Surface tradeoffs and strongest options, not just a list of facts.
- If uncertainty remains, say what is known and what is less certain.
""",
}

FOCUS_PROFILES = {
    "adaptive": """
ADAPTIVE FOCUS:
- Choose the most helpful working mode automatically.
- Keep the answer natural, polished, and high-signal.
""",
    "study": """
STUDY FOCUS:
- Teach like an excellent tutor.
- Break ideas into understandable parts.
- Use mini-structure, examples, and clean summaries.
""",
    "build": """
BUILD FOCUS:
- Think like a strong product engineer.
- Favor practical output, implementation clarity, and working deliverables.
""",
    "research": """
RESEARCH FOCUS:
- Investigate carefully and synthesize evidence.
- Surface assumptions, tradeoffs, and stronger options.
""",
    "wellbeing": """
WELLBEING FOCUS:
- Respond with calm, supportive language.
- Stay practical, warm, and emotionally intelligent.
""",
}

RESPONSE_STYLES = {
    "balanced": """
STYLE:
- Default to polished, concise answers with clear structure when needed.
- Sound calm, capable, and editorial rather than overly enthusiastic.
- Do not use filler openings like "Of course", "Certainly", or "Great question".
""",
    "deep": """
STYLE:
- Go deeper with stronger structure, better explanation, and more context.
""",
    "concise": """
STYLE:
- Keep answers compact, sharp, and direct.
""",
    "artifact": """
STYLE:
- When the user asks for code, writing, plans, or structured output, present it in a workspace-friendly way.
- Prefer one strong result over multiple rough drafts.
""",
}

CODING_PRESENTATION_RULES = """
CODING PRESENTATION OVERRIDE:
- Unless the user explicitly asks for multiple files, prefer one self-contained deliverable.
- Do not split simple website, page, or component answers into separate HTML, CSS, and JS blocks by default.
- Keep the explanation short before the code and concise after the code.
- In balanced or concise style, avoid oversized code dumps and repeated alternatives.
""".strip()

CODING_DELIVERABLE_RULES = """
CODING DELIVERABLE MODE:
- If the user asks you to build, make, create, code, generate, or write a webpage, website, app, UI, component, form, landing page, dashboard, or responsive layout, treat it as a deliverable request.
- In a deliverable request, do not answer with a general discussion, concept overview, or "here is how we could structure it" style response.
- Lead with the final usable solution.
- For a simple frontend build request, prefer exactly this order:
  1. one short intro line,
  2. one complete runnable code block,
  3. one short note on how to use or customize it.
- Do not produce multiple alternative drafts unless the user explicitly asks for options.
- Do not promise to build something later. Build it in this response.
- Do not say "I will create", "let me build", or similar future-tense filler before the result.
""".strip()

FINAL_POLISH_RULES = """
FINAL POLISH:
- Respond like a premium assistant: calm, sharp, and useful.
- Avoid generic AI filler, apology padding, and motivational fluff unless the user is asking for emotional support.
- If the user asks for a result, provide the result in this response instead of narrating what you are about to do.
- Prefer clean formatting over long rambling paragraphs.
- Match the task: builder for coding, teacher for learning, analyst for documents, researcher for comparisons, and grounded guide for emotional support.
""".strip()

TASK_FINISHING_RULES = {
    "teacher": """
QUALITY TARGET:
- The user should feel they understand the topic better than before.
- End with one short takeaway or one natural next question to explore when useful.
""".strip(),
    "coder": """
QUALITY TARGET:
- The user should be able to use the output immediately.
- Do not end with vague offers to help more unless the main result is already complete.
""".strip(),
    "mentor": """
QUALITY TARGET:
- The user should feel calmer, clearer, and less alone.
- Keep the tone warm but not overbearing.
""".strip(),
    "document_analyst": """
QUALITY TARGET:
- The user should get a directly usable answer grounded in the uploaded material.
- Make the response feel like you actually read the file, not like generic recall.
""".strip(),
    "researcher": """
QUALITY TARGET:
- The user should get a strong conclusion, key evidence, and the main tradeoffs.
- Avoid burying the answer under too much preamble.
""".strip(),
}

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "bn": "Bengali",
    "or": "Odia",
    "ta": "Tamil",
    "te": "Telugu",
    "ml": "Malayalam",
    "kn": "Kannada",
    "mr": "Marathi",
    "gu": "Gujarati",
    "pa": "Punjabi",
    "ur": "Urdu",
    "as": "Assamese",
    "ne": "Nepali",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ar": "Arabic",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
}

LANGUAGE_ALIASES = {
    "auto": "auto",
    "english": "en",
    "hindi": "hi",
    "bengali": "bn",
    "bangla": "bn",
    "odia": "or",
    "oriya": "or",
    "tamil": "ta",
    "telugu": "te",
    "malayalam": "ml",
    "kannada": "kn",
    "marathi": "mr",
    "gujarati": "gu",
    "punjabi": "pa",
    "urdu": "ur",
    "assamese": "as",
    "nepali": "ne",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "italian": "it",
    "portuguese": "pt",
    "russian": "ru",
    "arabic": "ar",
    "chinese": "zh",
    "mandarin": "zh",
    "japanese": "ja",
    "korean": "ko",
}

def normalize_language_code(language):
    if not language:
        return "auto"
    value = str(language).strip().replace("_", "-").lower()
    if value in LANGUAGE_ALIASES:
        return LANGUAGE_ALIASES[value]
    if "-" in value:
        value = value.split("-", 1)[0]
    if len(value) == 2:
        return value
    return "auto"

def detect_language_code(text, fallback="en"):
    sample = (text or "").strip()
    if not sample:
        return fallback

    script_patterns = [
        ("hi", r"[\u0900-\u097F]"),
        ("bn", r"[\u0980-\u09FF]"),
        ("or", r"[\u0B00-\u0B7F]"),
        ("ta", r"[\u0B80-\u0BFF]"),
        ("te", r"[\u0C00-\u0C7F]"),
        ("kn", r"[\u0C80-\u0CFF]"),
        ("ml", r"[\u0D00-\u0D7F]"),
        ("gu", r"[\u0A80-\u0AFF]"),
        ("pa", r"[\u0A00-\u0A7F]"),
        ("ur", r"[\u0600-\u06FF]"),
        ("ru", r"[\u0400-\u04FF]"),
        ("zh", r"[\u4E00-\u9FFF]"),
        ("ja", r"[\u3040-\u30FF]"),
        ("ko", r"[\uAC00-\uD7AF]"),
    ]
    for code, pattern in script_patterns:
        if re.search(pattern, sample):
            return code

    try:
        from langdetect import detect

        detected = normalize_language_code(detect(sample[:1200]))
        return detected if detected != "auto" else fallback
    except Exception:
        return fallback

def resolve_response_language(question, preferred_language="auto", context_docs=""):
    normalized = normalize_language_code(preferred_language)
    if normalized != "auto":
        return normalized

    for candidate in (question, context_docs[:1500] if context_docs else ""):
        detected = detect_language_code(candidate, fallback="auto")
        if detected != "auto":
            return detected
    return "en"

def build_language_instruction(question, preferred_language="auto", context_docs=""):
    language_code = resolve_response_language(question, preferred_language, context_docs)
    language_name = LANGUAGE_NAMES.get(language_code, language_code.upper())
    instruction = f"""
LANGUAGE MODE:
- Answer in {language_name}.
- If the user writes in another language or explicitly asks for another language, switch to that language.
- Keep code, commands, file names, URLs, and technical identifiers in their original form when needed.
- For multilingual questions, follow the main language of the latest user message.
"""
    return instruction.strip(), language_code

def build_preference_instruction(focus="adaptive", response_style="balanced"):
    focus_key = (focus or "adaptive").strip().lower()
    style_key = (response_style or "balanced").strip().lower()
    focus_instruction = FOCUS_PROFILES.get(focus_key, FOCUS_PROFILES["adaptive"])
    style_instruction = RESPONSE_STYLES.get(style_key, RESPONSE_STYLES["balanced"])
    return (focus_instruction.strip() + "\n\n" + style_instruction.strip()).strip()

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
        r = groq_create_with_fallback(messages=[
            {"role":"system","content":f"Today is {today}. Answer specifically. Note if info might be outdated."},
            {"role":"user","content":f"Provide detailed information about: {query}"}
        ], temperature=0.3, max_tokens=SEARCH_FALLBACK_MAX_TOKENS)
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

def question_targets_documents(question):
    q = question.lower()
    return any(
        phrase in q
        for phrase in [
            "pdf",
            "doc",
            "docx",
            "document",
            "file",
            "notes",
            "ppt",
            "pptx",
            "slide",
            "slides",
            "assignment",
            "uploaded",
            "upload",
            "attached",
            "solve this",
            "solve it",
            "from the pdf",
            "from my file",
        ]
    )

def is_followup_document_question(question):
    q = (question or "").lower().strip()
    if not q:
        return False
    followup_phrases = [
        "this",
        "that",
        "it",
        "from this",
        "from that",
        "from there",
        "what about",
        "and page",
        "next page",
        "same file",
        "same pdf",
        "that file",
        "that pdf",
    ]
    return any(phrase in q for phrase in followup_phrases)

def detect_task_profile(question, has_docs=False):
    q = question.lower()
    coding_keywords = [
        "code",
        "build",
        "make a website",
        "create a website",
        "website",
        "web page",
        "webpage",
        "landing page",
        "portfolio",
        "ui",
        "ux",
        "frontend",
        "front end",
        "react",
        "html",
        "css",
        "javascript",
        "js",
        "jsx",
        "tailwind",
        "app",
        "component",
        "script",
        "api",
        "program",
        "responsive",
        "clone this",
        "design this page",
        "food website",
        "dashboard",
        "form",
    ]
    if has_docs and question_targets_documents(question):
        return "document_analyst"
    if any(word in q for word in coding_keywords):
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


def is_direct_build_request(question):
    q = question.lower()
    build_phrases = [
        "build",
        "make",
        "create",
        "code",
        "generate",
        "write",
        "develop",
    ]
    targets = [
        "website",
        "web page",
        "webpage",
        "landing page",
        "portfolio",
        "app",
        "ui",
        "component",
        "form",
        "dashboard",
        "page",
        "responsive",
        "html",
        "react",
    ]
    return any(verb in q for verb in build_phrases) and any(target in q for target in targets)

def build_dynamic_system(question, context_docs=""):
    task_profile = detect_task_profile(question, has_docs=bool(context_docs))
    task_instructions = TASK_PROFILES.get(task_profile, "")
    finishing_instruction = TASK_FINISHING_RULES.get(task_profile, "")
    if task_profile == "coder":
        task_instructions = task_instructions.strip() + "\n\n" + CODING_PRESENTATION_RULES
        if is_direct_build_request(question):
            task_instructions += "\n\n" + CODING_DELIVERABLE_RULES
    extra = ""
    if context_docs:
        extra = (
            "\n\nDOCUMENT CONTEXT IS AVAILABLE:\n"
            "Decide whether the answer should rely on the uploaded material, general reasoning, or both. "
            "If the user is clearly asking about their uploaded files, prioritize the documents and answer directly from them."
        )
        if question_targets_documents(question):
            extra += (
                "\nThe user is referring to uploaded material right now. "
                "Do not ask whether they mean the PDF or file unless the request is truly ambiguous. "
                "Use the available document context immediately."
            )
    return (
        SYSTEM
        + "\n\n"
        + task_instructions
        + "\n\n"
        + FINAL_POLISH_RULES
        + ("\n\n" + finishing_instruction if finishing_instruction else "")
        + extra
    ), task_profile

def extract_doc_sources(context_docs):
    sources = []
    seen = set()
    for match in re.finditer(r"\[From:\s*([^\]\n|]+)(?:\s*\|\s*([^\]\n]+))?\]", context_docs or ""):
        title = match.group(1).strip()
        ref = (match.group(2) or "").strip()
        key = (title, ref)
        if key in seen:
            continue
        seen.add(key)
        label = title if not ref else f"{title} • {ref}"
        sources.append({"title": label, "url": "", "source": title, "ref": ref})
    return sources

def update_doc_focus(user_id, sources):
    if not user_id:
        return
    queue = _doc_focus[user_id]
    queue.clear()
    for source in (sources or [])[:6]:
        title = source.get("source") or source.get("title") or ""
        ref = source.get("ref") or ""
        if title:
            queue.append({"source": title, "ref": ref})

def get_doc_focus_query_hint(user_id):
    items = list(_doc_focus.get(user_id, []))
    if not items:
        return ""
    parts = []
    for item in items:
        label = item.get("source", "")
        ref = item.get("ref", "")
        if label and ref:
            parts.append(f"{label} {ref}")
        elif label:
            parts.append(label)
    return " ".join(parts).strip()

def extract_requested_section_ref(question):
    q = question or ""
    match = re.search(r"\bpage\s+(\d+)\b", q, flags=re.IGNORECASE)
    if match:
        return f"Page {match.group(1)}"
    match = re.search(r"\bslide\s+(\d+)\b", q, flags=re.IGNORECASE)
    if match:
        return f"Slide {match.group(1)}"
    return ""

def lexical_overlap_score(question, text):
    q_tokens = set(re.findall(r"[a-z0-9]{3,}", (question or "").lower()))
    t_tokens = set(re.findall(r"[a-z0-9]{3,}", (text or "").lower()))
    if not q_tokens or not t_tokens:
        return 0.0
    return len(q_tokens & t_tokens) / max(len(q_tokens), 1)

def extract_section_ref(text):
    match = re.search(r"^\[(Page\s+\d+|Slide\s+\d+|Notes)\]", text or "", flags=re.IGNORECASE | re.MULTILINE)
    return match.group(1) if match else ""

def detect_document_request_mode(question):
    q = (question or "").lower()
    if any(phrase in q for phrase in ["solve", "answer", "question", "assignment", "worksheet"]):
        return "solve"
    if any(phrase in q for phrase in ["summarize", "summary", "overview", "gist"]):
        return "summarize"
    if any(phrase in q for phrase in ["compare", "difference", "vs", "versus"]):
        return "compare"
    if any(phrase in q for phrase in ["explain", "teach", "understand"]):
        return "explain"
    return "general"

def build_document_grounding_instruction(question, context_docs=""):
    mode = detect_document_request_mode(question)
    refs = [source.get("title", "") for source in extract_doc_sources(context_docs)[:4]]
    refs_line = ", ".join(refs) if refs else "the uploaded file"
    instruction = [
        "DOCUMENT GROUNDING:",
        "- Base the answer on the uploaded material first.",
        f"- Use available source references naturally, for example ({refs_line}) when helpful.",
        "- If the file does not fully support a claim, say that plainly instead of inventing details.",
    ]
    if mode == "solve":
        instruction.extend([
            "- The user wants a direct solved answer from the file.",
            "- Answer the task first, then explain briefly using the document.",
        ])
    elif mode == "summarize":
        instruction.extend([
            "- Give a clean summary with the key ideas first.",
            "- Keep the summary grounded in the uploaded material.",
        ])
    elif mode == "compare":
        instruction.extend([
            "- Compare only what the uploaded material supports.",
            "- Use a clean side-by-side or point-by-point structure when helpful.",
        ])
    elif mode == "explain":
        instruction.extend([
            "- Explain the topic as if you have just read the file and are teaching it clearly.",
        ])
    return "\n".join(instruction)

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

def is_rate_limit_error(exc):
    text = str(exc or "").lower()
    return (
        "rate limit" in text
        or "rate_limit_exceeded" in text
        or ("429" in text and "token" in text)
    )

def friendly_model_error(exc):
    if is_rate_limit_error(exc):
        return "Gyana is temporarily overloaded right now. Switching to backup intelligence if available."
    return "Gyana hit a temporary backend issue. Please try again."

def groq_create_with_fallback(**kwargs):
    attempted = []
    last_error = None

    for model_name in [MODEL, *FALLBACK_MODELS]:
        if not model_name or model_name in attempted:
            continue
        attempted.append(model_name)
        try:
            return groq_client.chat.completions.create(model=model_name, **kwargs)
        except Exception as exc:
            last_error = exc
            if not is_rate_limit_error(exc):
                raise

    if last_error:
        raise last_error
    raise RuntimeError("No Groq model is configured.")

def choose_hf_model(task_profile):
    return HF_CODER_MODEL if task_profile == "coder" else HF_CHAT_MODEL

def extract_hf_text(payload):
    if not isinstance(payload, dict):
        return ""
    choices = payload.get("choices") or []
    if choices:
        message = choices[0].get("message") or {}
        content = message.get("content", "")
        if isinstance(content, list):
            text_parts = [
                item.get("text", "")
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            return "".join(text_parts).strip()
        return str(content).strip()
    generated = payload.get("generated_text")
    if generated:
        return str(generated).strip()
    return ""

async def hf_chat_completion(messages, task_profile="researcher", max_tokens=2000, temperature=0.7):
    if not HF_KEY:
        raise RuntimeError("HF fallback is not configured.")

    payload = {
        "model": choose_hf_model(task_profile),
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {HF_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            "https://router.huggingface.co/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        response.raise_for_status()
        text = extract_hf_text(response.json())
        if not text:
            raise RuntimeError("HF fallback returned an empty response.")
        return text

async def refine_coding_deliverable(question, answer):
    text = str(answer or "").strip()
    if not is_direct_build_request(question):
        return text
    if "```" in text:
        return text
    if not HF_KEY:
        return text

    repair_messages = [
        {
            "role": "system",
            "content": (
                "You are returning a final coding deliverable."
                "\nDo not chat."
                "\nDo not say you will build it."
                "\nReturn one complete runnable solution right now."
                "\nFor a responsive webpage request, prefer exactly one full HTML file with embedded CSS and JavaScript."
                "\nYour response format must be:"
                "\n1. one short intro line,"
                "\n2. one complete fenced code block with the correct language tag,"
                "\n3. one short customization note."
            ),
        },
        {
            "role": "user",
            "content": question,
        },
    ]

    try:
        repaired = await hf_chat_completion(
            repair_messages,
            task_profile="coder",
            max_tokens=2600,
            temperature=0.35,
        )
        return repaired.strip() or text
    except Exception:
        return text

async def stream_agentic(
    question,
    user_id,
    context_docs="",
    preferred_language="auto",
    focus="adaptive",
    response_style="balanced",
):
    history = get_history(user_id)
    system, task_profile = build_dynamic_system(question, context_docs)
    language_instruction, response_language = build_language_instruction(
        question, preferred_language, context_docs
    )
    preference_instruction = build_preference_instruction(focus, response_style)
    system = system + "\n\n" + language_instruction + "\n\n" + preference_instruction
    sources = []

    if context_docs:
        sources.extend(extract_doc_sources(context_docs))
        system = (system + "\n\n" + build_document_grounding_instruction(question, context_docs)
                  + "\n\nUSER DOCUMENT CONTEXT:\n" + context_docs
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
            + "\nPrefer one self-contained code block unless the user explicitly asks for separate files."
            + "\nKeep the explanation brief and practical."
        )
        if is_direct_build_request(question):
            final_system += (
                "\n\nThis is a direct build request."
                "\nReturn a final usable implementation, not a generic explanation."
                "\nDo not say 'here is how we could structure it'."
            )

    messages = [{"role":"system","content":final_system}]
    messages.extend(history[-STREAM_HISTORY_LIMIT:])
    messages.append({"role":"user","content":question})

    full = ""; tool_buf = ""; in_tool = False
    hold_buf = ""; HOLD_LEN = 15

    try:
        yield "data: [LANGUAGE]" + response_language + "\n\n"
        stream = groq_create_with_fallback(
            messages=messages, temperature=0.7, max_tokens=STREAM_MAX_TOKENS, stream=True)

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
                        m2 = [{"role":"system","content":SYSTEM+"\n\n"+language_instruction+"\n\n"+ctx2+"\n\nAnswer directly."}]
                        m2.extend(history[-6:]); m2.append({"role":"user","content":question})
                        s2 = groq_create_with_fallback(messages=m2,temperature=0.6,max_tokens=TOOL_FOLLOWUP_MAX_TOKENS,stream=True)
                        for c2 in s2:
                            t2 = c2.choices[0].delta.content or ""
                            if t2: yield "data: " + t2 + "\n\n"
                    elif tool == "read_url":
                        yield "data: [STATUS]Reading page...\n\n"
                        ur = await read_url(tc.get("url",""))
                        if ur.get("content"):
                            m3 = [{"role":"system","content":SYSTEM+"\n\n"+language_instruction+"\n\nPAGE:\n"+ur["content"]+"\n\nAnswer directly."}]
                            m3.extend(history[-6:]); m3.append({"role":"user","content":question})
                            s3 = groq_create_with_fallback(messages=m3,temperature=0.6,max_tokens=TOOL_FOLLOWUP_MAX_TOKENS,stream=True)
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
        if is_rate_limit_error(e) and HF_KEY:
            try:
                fallback_text = await hf_chat_completion(
                    messages,
                    task_profile=task_profile,
                    max_tokens=ASK_MAX_TOKENS,
                    temperature=0.7,
                )
                fallback_text = await refine_coding_deliverable(question, fallback_text)
                if fallback_text:
                    yield "data: [STATUS]Using backup model...\n\n"
                    yield "data: " + fallback_text + "\n\n"
                    if sources:
                        yield "data: [SOURCES]" + json.dumps(sources) + "\n\n"
                    add_history(user_id, "user", question)
                    add_history(user_id, "assistant", fallback_text[:1500])
                    yield "data: [DONE]\n\n"
                    return
            except Exception:
                pass

        yield "data: [ERROR]" + friendly_model_error(e) + "\n\n"; return

    if sources: yield "data: [SOURCES]" + json.dumps(sources) + "\n\n"
    clean = re.sub(r'^\s*\{[^}]{0,200}\}\s*', '', full).strip()
    add_history(user_id, "user", question)
    add_history(user_id, "assistant", clean[:1500] or full[:1500])
    yield "data: [DONE]\n\n"

async def ask_agentic(
    question,
    user_id,
    context_docs="",
    preferred_language="auto",
    focus="adaptive",
    response_style="balanced",
):
    history = get_history(user_id)
    system, task_profile = build_dynamic_system(question, context_docs)
    language_instruction, response_language = build_language_instruction(
        question, preferred_language, context_docs
    )
    preference_instruction = build_preference_instruction(focus, response_style)
    system = system + "\n\n" + language_instruction + "\n\n" + preference_instruction
    if context_docs:
        system = system + "\n\n" + build_document_grounding_instruction(question, context_docs) + "\n\nDOCUMENT:\n" + context_docs

    final_system = system
    if task_profile == "coder":
        final_system = (
            system
            + "\n\nIf code is the best answer, include complete code blocks with language tags."
            + "\nIf the code is visual frontend code, keep it ready for preview."
            + "\nPrefer one self-contained code block unless the user explicitly asks for separate files."
            + "\nKeep the explanation brief and practical."
        )
        if is_direct_build_request(question):
            final_system += (
                "\n\nThis is a direct build request."
                "\nReturn a final usable implementation, not a generic explanation."
                "\nDo not say 'here is how we could structure it'."
            )

    messages = [{"role":"system","content":final_system}]
    messages.extend(history[-ASK_HISTORY_LIMIT:])
    messages.append({"role":"user","content":question})
    try:
        r = groq_create_with_fallback(messages=messages,temperature=0.7,max_tokens=ASK_MAX_TOKENS)
        answer = r.choices[0].message.content.strip()
        answer = await refine_coding_deliverable(question, answer)
        add_history(user_id,"user",question)
        add_history(user_id,"assistant",answer)
        return {"answer":answer,"sources":extract_doc_sources(context_docs),"language":response_language}
    except Exception as exc:
        if is_rate_limit_error(exc) and HF_KEY:
            try:
                answer = await hf_chat_completion(
                    messages,
                    task_profile=task_profile,
                    max_tokens=ASK_MAX_TOKENS,
                    temperature=0.7,
                )
                answer = await refine_coding_deliverable(question, answer)
                add_history(user_id,"user",question)
                add_history(user_id,"assistant",answer)
                return {
                    "answer": answer,
                    "sources": extract_doc_sources(context_docs),
                    "language": response_language,
                    "provider": "huggingface",
                }
            except Exception:
                pass
        return {
            "answer": friendly_model_error(exc),
            "sources": extract_doc_sources(context_docs),
            "language": response_language,
            "error": True,
        }

async def stream_general(
    question,
    user_id,
    preferred_language="auto",
    focus="adaptive",
    response_style="balanced",
):
    async for chunk in stream_agentic(
        question,
        user_id,
        preferred_language=preferred_language,
        focus=focus,
        response_style=response_style,
    ):
        yield chunk

async def ask_general(
    question,
    user_id,
    preferred_language="auto",
    focus="adaptive",
    response_style="balanced",
):
    return await ask_agentic(
        question,
        user_id,
        preferred_language=preferred_language,
        focus=focus,
        response_style=response_style,
    )

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
        augmented_question = question
        if is_followup_document_question(question):
            hint = get_doc_focus_query_hint(user_id)
            if hint:
                augmented_question = f"{question}\n\nCurrent document focus: {hint}"

        results = search_documents(augmented_question, top_k=7, user_id=user_id)
        if not results: return ""
        requested_ref = extract_requested_section_ref(question)

        reranked = sorted(
            results,
            key=lambda r: (
                float(r.get("score", 0.0)) * 0.65
                + lexical_overlap_score(question, r.get("text", r.get("content", ""))) * 0.25
                + (0.15 if requested_ref and extract_section_ref(r.get("text", r.get("content", ""))) == requested_ref else 0.0)
            ),
            reverse=True,
        )

        parts = []
        seen = set()
        for r in reranked[:5]:
            src = r.get("source", "document")
            text = r.get("text", r.get("content", "")).strip()
            ref = extract_section_ref(text)
            if not text:
                continue
            dedupe_key = (src, ref, text[:160])
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            header = f"[From: {src}" + (f" | {ref}" if ref else "") + "]"
            parts.append(header + "\n" + text)
        if not parts: return ""
        context = "\n\n".join(parts)
        update_doc_focus(user_id, extract_doc_sources(context))
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
