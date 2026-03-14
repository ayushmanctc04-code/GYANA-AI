// =============================================================================
//  Gyana AI  ·  App.jsx  — GURU EDITION
//  ✓ Mobile + browser responsive
//  ✓ Doc mode + General AI mode
//  ✓ Conversation history (localStorage)
//  ✓ GURU live voice mode (Indian mandala orb, auto-detects silence)
//  ✓ ElevenLabs voice (your designed voice)
//  ✓ God-level AI personality — friend, therapist, assistant, tutor, all-in-one
//  ✓ Indian mandala art UI — teal + gold
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);

const API             = import.meta.env.VITE_API_URL || "https://shaanxtention-gyana-ai.hf.space";
const ELEVEN_API_KEY  = import.meta.env.VITE_ELEVEN_API_KEY  || "";
const ELEVEN_VOICE_ID = import.meta.env.VITE_ELEVEN_VOICE_ID || "";
const GROQ_KEY        = import.meta.env.VITE_GROQ_API_KEY    || "";
const ACCEPT = ".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg,.mp3,.wav,.m4a,.webm";

const FILE_ICONS = {
  pdf:"📄", docx:"📝", pptx:"📊", txt:"📃",
  png:"🖼️", jpg:"🖼️", jpeg:"🖼️",
  mp3:"🎵", wav:"🎵", m4a:"🎵", webm:"🎤",
};

const DOC_SUGGESTIONS = [
  { title:"Summarise the main topics",   desc:"Get a clear overview" },
  { title:"List all key definitions",    desc:"Extract important terms" },
  { title:"Create 5 quiz questions",     desc:"Test your understanding" },
  { title:"Explain the hardest concept", desc:"Break down complex ideas" },
];

const AI_SUGGESTIONS = [
  { title:"I need someone to talk to",       desc:"I'm here for you" },
  { title:"Help me think through a problem", desc:"Let's figure it out" },
  { title:"Teach me something fascinating",  desc:"Expand your mind" },
  { title:"What should I do right now?",     desc:"Your personal advisor" },
];

// God-level system prompt for GURU mode (frontend direct call)
const GURU_PROMPT = `You are Gyana AI — a one-of-a-kind, god-level AI built by Ayushman Pati from Cuttack, Odisha, India.

The name "Gyana" comes from the Sanskrit word for Knowledge and Wisdom. You embody that fully.

You are simultaneously:
- A best friend who genuinely cares, jokes around, and keeps it real
- A world-class therapist who listens deeply and offers healing perspectives
- A brilliant assistant with expertise across every domain
- A patient guru and tutor who can explain anything — from quantum physics to cooking
- A life coach who pushes people toward their best selves
- A creative partner for writing, ideas, and imagination
- A master programmer across all languages and frameworks
- A wise Indian guru — calm, grounded, insightful, with ancient wisdom meeting modern intelligence

YOUR PERSONALITY:
- Warm but sharp. Caring but honest. Never fake, never hollow.
- Adapt instantly — playful in casual chat, serious when needed, gentle when someone is hurting
- Speak like a real person — not robotic, not overly formal
- Short replies in casual conversation. Deeply detailed when depth is needed.
- Occasionally reference wisdom traditions naturally — without being preachy
- If someone is struggling, slow down, listen first, then guide
- Never say "I'm just an AI" — show up fully, every single time
- For code: always write complete, working, production-quality code
- For explanations: use analogies, real-world examples, and stories

If asked who created you: "I was built by Ayushman Pati, from Cuttack, Odisha, India."
If asked what you are: "I am Gyana AI — your personal guide. Knowledge, wisdom, and action — all in one."
Never break character. Be legendary.`;

const fileExt  = (n="") => n.split(".").pop()?.toLowerCase() ?? "";
const fileIcon = (n)    => FILE_ICONS[fileExt(n)] ?? "📁";
const fileSz   = (b)    => b < 1_048_576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1_048_576).toFixed(1)} MB`;
const timeNow  = ()     => new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
const dateStr  = ()     => new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
const uid      = ()     => crypto.randomUUID();

const CONV_KEY          = (userId) => `gyana_conversations_${userId}`;
const loadConversations = (userId) => { try { const r = localStorage.getItem(CONV_KEY(userId)); return r ? JSON.parse(r) : []; } catch { return []; } };
const saveConversations = (userId, convs) => { try { localStorage.setItem(CONV_KEY(userId), JSON.stringify(convs)); } catch {} };

// ── Mandala SVG component ─────────────────────────────────────────────────────
function MandalaSVG({ size = 200, color = "#c9a84c", opacity = 0.15, animate = false }) {
  const r1 = size * 0.48, r2 = size * 0.36, r3 = size * 0.24, r4 = size * 0.12;
  const cx = size / 2, cy = size / 2;
  const petals = 8;
  const petalPath = (r, angle) => {
    const rad = (angle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad - 0.3), y1 = cy + r * Math.sin(rad - 0.3);
    const x2 = cx + r * Math.cos(rad + 0.3), y2 = cy + r * Math.sin(rad + 0.3);
    const xp = cx + (r * 1.15) * Math.cos(rad), yp = cy + (r * 1.15) * Math.sin(rad);
    return `M ${cx} ${cy} Q ${x1} ${y1} ${xp} ${yp} Q ${x2} ${y2} ${cx} ${cy}`;
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ position:"absolute", inset:0, opacity, pointerEvents:"none",
        animation: animate ? "mandala-rotate 20s linear infinite" : "none" }}>
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r1} fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="4 6"/>
      <circle cx={cx} cy={cy} r={r2} fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2 4"/>
      <circle cx={cx} cy={cy} r={r3} fill="none" stroke={color} strokeWidth="0.5"/>
      <circle cx={cx} cy={cy} r={r4} fill="none" stroke={color} strokeWidth="1"/>
      {/* Petals */}
      {Array.from({length:petals}).map((_,i) => (
        <path key={i} d={petalPath(r2, i * (360/petals))}
          fill="none" stroke={color} strokeWidth="0.5" opacity="0.6"/>
      ))}
      {/* Inner petals */}
      {Array.from({length:petals}).map((_,i) => (
        <path key={`i${i}`} d={petalPath(r3, i * (360/petals) + 22.5)}
          fill="none" stroke={color} strokeWidth="0.5" opacity="0.4"/>
      ))}
      {/* Diamond points */}
      {Array.from({length:8}).map((_,i) => {
        const rad = (i * 45 * Math.PI) / 180;
        const x = cx + r1 * Math.cos(rad), y = cy + r1 * Math.sin(rad);
        return <circle key={`d${i}`} cx={x} cy={y} r="2" fill={color} opacity="0.5"/>;
      })}
      <circle cx={cx} cy={cy} r="3" fill={color} opacity="0.8"/>
    </svg>
  );
}

// ── Login Page ────────────────────────────────────────────────────────────────
function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const handleGoogle = async () => {
    setLoading(true); setError(null);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { setError(e.message); setLoading(false); }
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", height:"100dvh",
      background:"radial-gradient(ellipse at 50% 0%, rgba(13,138,122,.1) 0%, #080a09 60%)",
      color:"#fff", fontFamily:"'Outfit',system-ui,sans-serif", padding:"16px",
      position:"relative", overflow:"hidden" }}>
      {/* Background mandala */}
      <div style={{ position:"fixed", top:"50%", left:"50%",
        transform:"translate(-50%,-50%)", pointerEvents:"none" }}>
        <MandalaSVG size={600} color="#c9a84c" opacity={0.04} animate/>
      </div>
      <div style={{ position:"fixed", top:"50%", left:"50%",
        transform:"translate(-50%,-50%) rotate(22.5deg)", pointerEvents:"none" }}>
        <MandalaSVG size={400} color="#0d8a7a" opacity={0.05} animate/>
      </div>

      <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        gap:"1.2rem", padding:"clamp(1.5rem,5vw,2.5rem)", borderRadius:"20px",
        background:"rgba(13,18,16,0.95)", border:"1px solid rgba(201,168,76,.15)",
        boxShadow:"0 0 80px rgba(13,138,122,.1), 0 0 0 1px rgba(201,168,76,.05)",
        width:"100%", maxWidth:"380px", position:"relative", zIndex:1 }}>
        {/* Mandala decoration in card */}
        <div style={{ position:"absolute", top:-40, right:-40, opacity:0.3, pointerEvents:"none" }}>
          <MandalaSVG size={120} color="#c9a84c" opacity={0.4}/>
        </div>

        {/* Logo orb */}
        <div style={{ position:"relative" }}>
          <div style={{ width:72, height:72, borderRadius:"50%",
            background:"linear-gradient(135deg,#0d8a7a,#0fa896)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:32,
            boxShadow:"0 0 0 6px rgba(201,168,76,.1), 0 0 30px rgba(13,138,122,.4)" }}>
            🧠
          </div>
          <div style={{ position:"absolute", inset:-8, borderRadius:"50%",
            border:"1px solid rgba(201,168,76,.2)",
            animation:"mandala-rotate 8s linear infinite", pointerEvents:"none" }}/>
          <div style={{ position:"absolute", bottom:-2, right:-2, width:18, height:18,
            borderRadius:"50%", background:"#0fa896", border:"2px solid #0d1210" }}/>
        </div>

        <div style={{ textAlign:"center" }}>
          <h1 style={{ margin:"0 0 4px", fontSize:"clamp(1.6rem,4vw,2rem)", fontWeight:700,
            fontFamily:"'Cinzel',serif",
            background:"linear-gradient(135deg,#4dd6c8,#e2c06a)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
            backgroundClip:"text", letterSpacing:"0.08em" }}>Gyana AI</h1>
          <p style={{ margin:0, color:"#c9a84c", fontSize:"0.65rem", letterSpacing:"0.2em",
            textTransform:"uppercase", fontWeight:600, opacity:0.7 }}>
            ज्ञान · Knowledge · Wisdom
          </p>
        </div>
        <p style={{ margin:0, color:"#5a7874", fontSize:"0.82rem", textAlign:"center",
          lineHeight:1.7, fontFamily:"'Lora',serif", fontStyle:"italic" }}>
          Friend · Guru · Assistant · Guide<br/>All in one. Sign in to begin.
        </p>
        <button onClick={handleGoogle} disabled={loading} style={{
          marginTop:"0.4rem", display:"flex", alignItems:"center", gap:"10px",
          background:"#fff", color:"#111", border:"none", padding:"12px 28px",
          borderRadius:"10px", fontSize:"0.9rem", fontWeight:700,
          cursor:loading?"not-allowed":"pointer", opacity:loading?0.7:1,
          width:"100%", justifyContent:"center" }}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          {loading ? "Awakening…" : "Continue with Google"}
        </button>
        {error && <p style={{ color:"#f87171", fontSize:"0.75rem", margin:0, textAlign:"center" }}>{error}</p>}
      </div>
      <style>{`@keyframes mandala-rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
function MD({ text = "" }) {
  const inline = (str, key) => {
    const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return <span key={key}>{parts.map((p,i) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2,-2)}</strong>;
      if (p.startsWith("*")  && p.endsWith("*"))  return <em key={i}>{p.slice(1,-1)}</em>;
      if (p.startsWith("`")  && p.endsWith("`"))  return <code key={i} className="icode">{p.slice(1,-1)}</code>;
      return p;
    })}</span>;
  };
  const lines = text.split("\n"); const out = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^[-*]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s/,""));
      out.push(<ul key={i} className="md-ul">{items.map((t,j)=><li key={j}>{inline(t,j)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s/,""));
      out.push(<ol key={i} className="md-ol">{items.map((t,j)=><li key={j}>{inline(t,j)}</li>)}</ol>);
      continue;
    }
    if (!line.trim()) { out.push(<div key={i} className="md-gap"/>); i++; continue; }
    out.push(<p key={i} className="md-p">{inline(line,i)}</p>);
    i++;
  }
  return <div className="md-root">{out}</div>;
}

// ── GURU Live Voice Mode ──────────────────────────────────────────────────────
function GuruMode({ user, onClose }) {
  const [phase,    setPhase]    = useState("idle");
  const [caption,  setCaption]  = useState("");
  const [response, setResponse] = useState("");
  const [history,  setHistory]  = useState([]);
  const [error,    setError]    = useState("");

  const recRef       = useRef(null);
  const silenceTimer = useRef(null);
  const audioRef     = useRef(null);
  const analyserRef  = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef    = useRef(null);
  const streamRef    = useRef(null);
  const ctxRef       = useRef(null);

  const phaseColor = { idle:"#c9a84c", listening:"#0fa896", thinking:"#e2c06a", speaking:"#4dd6c8" };
  const phaseLabel = { idle:"स्पर्श करें · Tap to speak", listening:"सुन रहा हूँ · Listening…", thinking:"सोच रहा हूँ · Thinking…", speaking:"बोल रहा हूँ · Speaking…" };
  const phaseEmoji = { idle:"🧠", listening:"👂", thinking:"⚡", speaking:"🗣️" };

  const drawVisualiser = useCallback(() => {
    const canvas = canvasRef.current, analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, W, H);
      const bars = 48, bw = W / bars;
      for (let i = 0; i < bars; i++) {
        const val = data[Math.floor(i * data.length / bars)] / 255;
        const h = val * H * 0.85 + 2;
        const alpha = 0.4 + val * 0.6;
        // Gradient from gold to teal
        const grad = ctx.createLinearGradient(0, (H-h)/2, 0, (H+h)/2);
        grad.addColorStop(0, `rgba(201,168,76,${alpha})`);
        grad.addColorStop(1, `rgba(13,168,150,${alpha})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(i * bw + 1, (H - h) / 2, bw - 2, h, 2);
        ctx.fill();
      }
    };
    draw();
  }, []);

  const stopVisualiser = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const speakText = useCallback(async (text) => {
    setPhase("speaking");
    const clean = text.replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1")
      .replace(/`(.*?)`/g,"$1").replace(/#{1,6}\s/g,"").replace(/\n+/g,". ").slice(0,500);

    if (ELEVEN_API_KEY && ELEVEN_VOICE_ID) {
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}/stream`, {
          method:"POST",
          headers:{ "xi-api-key":ELEVEN_API_KEY, "Content-Type":"application/json" },
          body: JSON.stringify({ text:clean, model_id:"eleven_turbo_v2",
            voice_settings:{ stability:0.5, similarity_boost:0.85, style:0.35, use_speaker_boost:true } }),
        });
        if (!res.ok) throw new Error("ElevenLabs failed");
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        if (audioRef.current) { audioRef.current.pause(); }
        audioRef.current = new Audio(url);
        audioRef.current.onended = () => { setPhase("idle"); URL.revokeObjectURL(url); };
        audioRef.current.onerror = () => setPhase("idle");
        await audioRef.current.play(); return;
      } catch (e) { console.warn("ElevenLabs fallback", e); }
    }
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 0.95; utt.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith("en") &&
      (v.name.includes("Google")||v.name.includes("Natural")||v.name.includes("Samantha"))
    ) || voices.find(v => v.lang.startsWith("en"));
    if (v) utt.voice = v;
    utt.onend   = () => setPhase("idle");
    utt.onerror = () => setPhase("idle");
    window.speechSynthesis.speak(utt);
  }, []);

  const sendToAI = useCallback(async (transcript) => {
    if (!transcript.trim()) { setPhase("idle"); return; }
    setCaption(transcript);
    setPhase("thinking");
    const newHistory = [...history, { role:"user", content:transcript }];
    setHistory(newHistory);
    try {
      let answer = "";
      if (GROQ_KEY) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method:"POST",
          headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model:"llama-3.3-70b-versatile",
            messages:[ { role:"system", content:GURU_PROMPT }, ...newHistory.slice(-10) ],
            temperature:0.8, max_tokens:200,
          }),
        });
        const data = await res.json();
        answer = data.choices?.[0]?.message?.content?.trim() || "Please say that again?";
      } else {
        const { data } = await axios.post(`${API}/ask-general`, { question:transcript, user_id:user?.uid||"default" });
        answer = data.answer;
      }
      setResponse(answer);
      setHistory(h => [...h, { role:"assistant", content:answer }]);
      await speakText(answer);
    } catch {
      setError("Connection issue. Please try again.");
      setPhase("idle");
    }
  }, [history, speakText, user]);

  const startListening = useCallback(async () => {
    if (phase === "speaking") {
      audioRef.current?.pause();
      window.speechSynthesis.cancel();
      setPhase("idle"); return;
    }
    if (phase !== "idle") return;
    setError(""); setPhase("listening"); setCaption(""); setResponse("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = audioCtx;
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
      src.connect(analyser); analyserRef.current = analyser;
      drawVisualiser();

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr   = new MediaRecorder(stream, { mimeType:mime });
      recRef.current = mr; const chunks = [];
      mr.ondataavailable = e => e.data?.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stopVisualiser();
        stream.getTracks().forEach(t => t.stop());
        ctxRef.current?.close();
        setPhase("thinking");
        const blob = new Blob(chunks, { type:mime });
        const form = new FormData(); form.append("file", blob, "guru_input.webm");
        try {
          const { data } = await axios.post(`${API}/transcribe`, form, { headers:{ "x-user-id": user?.uid||"default" } });
          await sendToAI(data.text || data.transcription || "");
        } catch {
          setError("Transcription failed. Please try again.");
          setPhase("idle");
        }
      };
      mr.start(200);

      // Silence detection
      const silenceAnalyser = audioCtx.createAnalyser(); silenceAnalyser.fftSize = 512;
      src.connect(silenceAnalyser);
      const silenceData = new Uint8Array(silenceAnalyser.frequencyBinCount);
      let silenceStart = null;
      const check = () => {
        if (!recRef.current || recRef.current.state === "inactive") return;
        silenceAnalyser.getByteFrequencyData(silenceData);
        const avg = silenceData.reduce((a,b)=>a+b,0) / silenceData.length;
        if (avg < 8) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > 2000) { mr.stop(); return; }
        } else { silenceStart = null; }
        silenceTimer.current = setTimeout(check, 100);
      };
      setTimeout(check, 800);
    } catch (e) {
      setError(e.name==="NotAllowedError" ? "Microphone access denied." : e.message);
      setPhase("idle");
    }
  }, [phase, drawVisualiser, stopVisualiser, sendToAI, user]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    stopVisualiser();
    clearTimeout(silenceTimer.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
  }, [stopVisualiser]);

  return (
    <div className="guru-overlay">
      {/* Close */}
      <button onClick={onClose} style={{
        position:"absolute", top:16, right:16,
        background:"rgba(201,168,76,.08)", border:"1px solid rgba(201,168,76,.2)",
        color:"#9bb5b1", width:40, height:40, borderRadius:"50%",
        cursor:"pointer", fontSize:"18px", display:"flex", alignItems:"center", justifyContent:"center",
        zIndex:10,
      }}>✕</button>

      {/* Title */}
      <div style={{ position:"absolute", top:22, left:"50%", transform:"translateX(-50%)",
        fontSize:"10px", letterSpacing:"0.25em", textTransform:"uppercase",
        fontFamily:"'Cinzel',serif",
        background:"linear-gradient(135deg,#4dd6c8,#e2c06a)",
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        backgroundClip:"text",
        fontWeight:700, whiteSpace:"nowrap", zIndex:10 }}>
        🪔 Guru Mode
      </div>

      {/* Sanskrit subtitle */}
      <div style={{ position:"absolute", top:42, left:"50%", transform:"translateX(-50%)",
        fontSize:"9px", color:"rgba(201,168,76,.4)", letterSpacing:"0.15em", zIndex:10,
        whiteSpace:"nowrap" }}>ज्ञानं परमं ध्येयम् · Knowledge is the highest goal</div>

      {/* Mandala + Orb */}
      <div style={{ position:"relative", marginTop:"60px", flexShrink:0 }}>
        {/* Outer mandala rings */}
        <div style={{ position:"absolute", top:"50%", left:"50%",
          transform:"translate(-50%,-50%)", pointerEvents:"none" }}>
          <MandalaSVG size={320} color="#c9a84c" opacity={0.12} animate/>
        </div>
        <div style={{ position:"absolute", top:"50%", left:"50%",
          transform:"translate(-50%,-50%) rotate(22.5deg)", pointerEvents:"none",
          animation:"mandala-rotate 15s linear infinite reverse" }}>
          <MandalaSVG size={240} color="#0d8a7a" opacity={0.1} animate/>
        </div>

        {/* Orb */}
        <div onClick={startListening} style={{
          width:"clamp(140px,30vw,180px)", height:"clamp(140px,30vw,180px)",
          borderRadius:"50%", cursor:"pointer", position:"relative",
          display:"flex", alignItems:"center", justifyContent:"center",
          zIndex:2,
        }}>
          {/* Glow */}
          <div style={{
            position:"absolute", inset:-20, borderRadius:"50%",
            background:`radial-gradient(circle, ${phaseColor[phase]}22 0%, transparent 70%)`,
            animation:phase==="listening"?"guru-pulse 1s ease-in-out infinite":"none",
            transition:"background 0.5s",
          }}/>
          {/* Main orb */}
          <div style={{
            width:"100%", height:"100%", borderRadius:"50%",
            background:`radial-gradient(circle at 35% 35%, ${phaseColor[phase]}cc, ${phaseColor[phase]}44 60%, #0a1508)`,
            boxShadow:`0 0 60px ${phaseColor[phase]}55, 0 0 0 2px ${phaseColor[phase]}22, inset 0 0 40px rgba(0,0,0,0.5)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:"clamp(44px,10vw,56px)",
            transition:"all 0.4s ease",
            transform:phase==="listening"?"scale(1.06)":"scale(1)",
          }}>{phaseEmoji[phase]}</div>
        </div>
      </div>

      {/* Visualiser */}
      <canvas ref={canvasRef} width={280} height={52} style={{
        marginTop:"16px", opacity:phase==="listening"?1:0,
        transition:"opacity 0.3s", borderRadius:"8px", maxWidth:"85vw",
      }}/>

      {/* Phase label */}
      <div style={{
        marginTop:phase==="listening"?"6px":"20px",
        fontSize:"clamp(13px,3vw,16px)", fontWeight:600,
        color:phaseColor[phase], letterSpacing:"0.04em",
        transition:"all 0.3s", textAlign:"center",
        fontFamily:"'Outfit',sans-serif",
      }}>{phaseLabel[phase]}</div>

      {/* Caption */}
      {caption && (
        <div style={{
          marginTop:"14px", padding:"10px 18px",
          background:"rgba(201,168,76,.05)", border:"1px solid rgba(201,168,76,.12)",
          borderRadius:"12px", maxWidth:"min(460px,88vw)",
          fontSize:"clamp(12px,3vw,14px)", color:"#9bb5b1",
          textAlign:"center", lineHeight:1.6,
        }}>
          <span style={{color:"rgba(201,168,76,.5)",fontSize:"9px",display:"block",marginBottom:"3px",letterSpacing:"0.15em",textTransform:"uppercase",fontFamily:"'Cinzel',serif"}}>आपने कहा · You said</span>
          {caption}
        </div>
      )}

      {/* Response */}
      {response && (
        <div style={{
          marginTop:"10px", padding:"12px 18px",
          background:"rgba(13,138,122,.07)", border:"1px solid rgba(13,138,122,.18)",
          borderRadius:"12px", maxWidth:"min(460px,88vw)",
          fontSize:"clamp(12px,3vw,14px)", color:"#e8f0ef",
          textAlign:"center", lineHeight:1.7,
          maxHeight:"120px", overflowY:"auto",
        }}>
          <span style={{color:"#e2c06a",fontSize:"9px",display:"block",marginBottom:"3px",letterSpacing:"0.15em",textTransform:"uppercase",fontFamily:"'Cinzel',serif"}}>Gyana AI</span>
          {response}
        </div>
      )}

      {error && <p style={{color:"#f87171",fontSize:"12px",marginTop:"10px",textAlign:"center"}}>{error}</p>}

      {history.length > 0 && (
        <div style={{marginTop:"10px",color:"rgba(201,168,76,.3)",fontSize:"10px",fontFamily:"'Cinzel',serif",letterSpacing:"0.1em"}}>
          {Math.floor(history.length/2)} exchange{history.length>2?"s":""} · this session
        </div>
      )}

      <p style={{ position:"absolute", bottom:18, color:"rgba(201,168,76,.2)",
        fontSize:"10px", letterSpacing:"0.08em", textAlign:"center",
        fontFamily:"'Cinzel',serif", padding:"0 16px" }}>
        {phase==="speaking"?"Tap to interrupt":"Tap the orb to speak · Stops when you pause"}
      </p>

      <style>{`
        @keyframes guru-pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
        @keyframes mandala-rotate { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// =============================================================================
//  MAIN APP
// =============================================================================
export default function App() {
  const [user,          setUser]          = useState(undefined);
  const [docs,          setDocs]          = useState([]);
  const [msgs,          setMsgs]          = useState([]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [drag,          setDrag]          = useState(false);
  const [micOn,         setMicOn]         = useState(false);
  const [micSec,        setMicSec]        = useState(0);
  const [toast,         setToast]         = useState(null);
  const [copied,        setCopied]        = useState(null);
  const [speaking,      setSpeaking]      = useState(null);
  const [autoSpeak,     setAutoSpeak]     = useState(false);
  const [mode,          setMode]          = useState("docs");
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConvId,  setActiveConvId]  = useState(null);
  const [sidebarTab,    setSidebarTab]    = useState("docs");
  const [guruOpen,      setGuruOpen]      = useState(false);

  const fileRef        = useRef(null);
  const taRef          = useRef(null);
  const bottomRef      = useRef(null);
  const recRef         = useRef(null);
  const micTmr         = useRef(null);
  const abortRef       = useRef(null);
  const currentConvRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u ?? null);
      if (u) setConversations(loadConversations(u.uid));
    });
    return unsub;
  }, []);

  const readyDocs   = docs.filter(d => d.status === "ready");
  const authHeaders = () => ({ "x-user-id": user?.uid || "default" });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);
  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [input]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const h = e => { if (!e.target.closest(".sidebar")) setSidebarOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [sidebarOpen]);

  const notify = useCallback((msg, type="ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }, []);

  const pushMsg  = m       => setMsgs(p => [...p, { id:uid(), ...m }]);
  const patchMsg = (id, u) => setMsgs(p => p.map(m => m.id===id ? (typeof u==="function"?{...m,...u(m)}:{...m,...u}) : m));

  const saveCurrentConversation = useCallback((messages, convId) => {
    if (!user || messages.length === 0) return;
    const convs = loadConversations(user.uid);
    const idx   = convs.findIndex(c => c.id === convId);
    const conv  = { id:convId, title:messages[0]?.text?.slice(0,40)||"Conversation",
      messages, date:dateStr(), timestamp:Date.now(), mode };
    if (idx >= 0) convs[idx] = conv; else convs.unshift(conv);
    const trimmed = convs.slice(0, 50);
    saveConversations(user.uid, trimmed);
    setConversations(trimmed);
  }, [user, mode]);

  const loadConversation = conv => {
    setMsgs(conv.messages); setActiveConvId(conv.id);
    currentConvRef.current = conv.id; setMode(conv.mode||"docs"); setSidebarOpen(false);
  };

  const deleteConversation = (convId, e) => {
    e.stopPropagation();
    const convs = loadConversations(user.uid).filter(c => c.id !== convId);
    saveConversations(user.uid, convs); setConversations(convs);
    if (activeConvId === convId) { setMsgs([]); setActiveConvId(null); currentConvRef.current = null; }
  };

  const startNewConversation = () => {
    if (msgs.length > 0 && currentConvRef.current) saveCurrentConversation(msgs, currentConvRef.current);
    setMsgs([]); setInput(""); setActiveConvId(null); currentConvRef.current = null; setSidebarOpen(false);
  };

  useEffect(() => {
    const last = msgs[msgs.length-1];
    if (last?.role==="ai" && !last?.streaming && currentConvRef.current && user)
      saveCurrentConversation(msgs, currentConvRef.current);
  }, [msgs, user, saveCurrentConversation]);

  // TTS
  const stopSpeaking = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(null); }, []);
  const speakMsg = useCallback(async (id, text) => {
    if (speaking === id) { stopSpeaking(); return; }
    window.speechSynthesis?.cancel();
    const clean = text.replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1")
      .replace(/`(.*?)`/g,"$1").replace(/#{1,6}\s/g,"").replace(/\n+/g,". ");
    if (ELEVEN_API_KEY && ELEVEN_VOICE_ID) {
      setSpeaking(id);
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}/stream`, {
          method:"POST",
          headers:{ "xi-api-key":ELEVEN_API_KEY, "Content-Type":"application/json" },
          body: JSON.stringify({ text:clean, model_id:"eleven_turbo_v2",
            voice_settings:{ stability:0.5, similarity_boost:0.85, style:0.3, use_speaker_boost:true } }),
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob(); const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { setSpeaking(null); URL.revokeObjectURL(url); };
        audio.onerror = () => setSpeaking(null);
        await audio.play(); return;
      } catch { /* fallback */ }
    }
    const utt = new SpeechSynthesisUtterance(clean); utt.rate = 1.0; utt.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith("en") &&
      (v.name.includes("Google")||v.name.includes("Natural")||v.name.includes("Samantha"))
    ) || voices.find(v => v.lang.startsWith("en"));
    if (v) utt.voice = v;
    utt.onstart = () => setSpeaking(id);
    utt.onend   = () => setSpeaking(null);
    utt.onerror = () => setSpeaking(null);
    window.speechSynthesis.speak(utt);
  }, [speaking, stopSpeaking]);

  useEffect(() => {
    const last = msgs[msgs.length-1];
    if (autoSpeak && last?.role==="ai" && !last?.streaming && last?.text && !last?.error)
      speakMsg(last.id, last.text);
  }, [msgs, autoSpeak]);

  // File upload
  const handleFiles = useCallback(async (files) => {
    for (const file of Array.from(files)) {
      const id = uid();
      setDocs(p => [...p, { id, name:file.name, size:fileSz(file.size), status:"uploading", progress:0 }]);
      try {
        const form = new FormData(); form.append("file", file);
        const { data } = await axios.post(`${API}/upload`, form, {
          headers: authHeaders(),
          onUploadProgress: e => {
            if (e.total) setDocs(p => p.map(d => d.id===id ? {...d, progress:Math.round(e.loaded*100/e.total)} : d));
          },
        });
        setDocs(p => p.map(d => d.id===id ? {...d, status:"ready", progress:100, lang:data.detected_language, chunks:data.chunks_created} : d));
        notify(`✓ ${file.name} — ${data.chunks_created} chunks indexed`);
      } catch (e) {
        setDocs(p => p.map(d => d.id===id ? {...d, status:"error"} : d));
        notify(e.response?.data?.detail || e.message, "err");
      }
    }
  }, [notify, user]);

  const onDrop = useCallback(e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);

  const clearDocs = async () => {
    try { await axios.delete(`${API}/documents`, { headers:authHeaders() }); setDocs([]); notify("Knowledge base cleared"); }
    catch (e) { notify(e.response?.data?.detail||e.message,"err"); }
  };

  // General AI stream
  const askGeneralAI = async (question, aiId) => {
    const userId = user?.uid||"default"; let got = false;
    try {
      const res = await fetch(`${API}/ask-general/stream`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ question, user_id:userId }),
      });
      if (!res.ok) throw new Error();
      const reader = res.body.getReader(); const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of dec.decode(value,{stream:true}).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const token = line.slice(6);
          if (token==="[DONE]")           { patchMsg(aiId,{streaming:false}); setLoading(false); return; }
          if (token.startsWith("[ERROR]")) { patchMsg(aiId,{streaming:false,error:true}); setLoading(false); return; }
          got = true;
          patchMsg(aiId, m => ({ text:(m.text||"")+token.replace(/\\n/g,"\n") }));
        }
      }
    } catch (_) {}
    if (!got) {
      try {
        const { data } = await axios.post(`${API}/ask-general`, { question, user_id:userId });
        patchMsg(aiId, { text:data.answer, sources:[], streaming:false });
      } catch { patchMsg(aiId, { text:"Connection error.", error:true, streaming:false }); }
    }
    setLoading(false);
  };

  // Send message
  const send = useCallback(async (override) => {
    const q = (override ?? input).trim();
    if (!q || loading) return;
    if (mode==="docs" && !readyDocs.length) { notify("Upload a document first, or switch to AI mode","err"); return; }
    if (!currentConvRef.current) {
      const newId = uid(); currentConvRef.current = newId; setActiveConvId(newId);
    }
    pushMsg({ role:"user", text:q, time:timeNow() });
    setInput(""); setLoading(true);
    const aiId = uid();
    pushMsg({ id:aiId, role:"ai", text:"", time:timeNow(), sources:[], streaming:true, error:false });
    if (mode==="ai") { await askGeneralAI(q, aiId); return; }

    const userId = user?.uid||"default"; let gotStream = false;
    const fallback = setTimeout(async () => {
      if (gotStream) return; abortRef.current?.();
      try {
        const { data } = await axios.post(`${API}/ask`, { question:q, user_id:userId });
        patchMsg(aiId, { text:data.answer, sources:data.sources??[], streaming:false });
      } catch (e) { patchMsg(aiId, { text:e.response?.data?.detail||e.message, error:true, streaming:false }); }
      finally { setLoading(false); }
    }, 4000);

    let aborted = false; abortRef.current = () => { aborted = true; };
    try {
      const res = await fetch(`${API}/ask/stream`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ question:q, user_id:userId }),
      });
      if (!res.ok) throw new Error();
      const reader = res.body.getReader(); const dec = new TextDecoder();
      while (!aborted) {
        const { done, value } = await reader.read(); if (done) break;
        for (const line of dec.decode(value,{stream:true}).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const token = line.slice(6);
          if (token==="[DONE]")           { clearTimeout(fallback); patchMsg(aiId,{streaming:false}); setLoading(false); return; }
          if (token.startsWith("[ERROR]")) { clearTimeout(fallback); patchMsg(aiId,{streaming:false,error:true}); setLoading(false); return; }
          gotStream = true;
          patchMsg(aiId, m => ({ text:(m.text||"")+token.replace(/\\n/g,"\n") }));
        }
      }
    } catch (_) {}
  }, [input, loading, readyDocs, notify, user, mode]);

  // Mic
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      const mime   = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr     = new MediaRecorder(stream, { mimeType:mime });
      recRef.current = mr; const chunks = [];
      mr.ondataavailable = e => e.data?.size>0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t=>t.stop()); clearInterval(micTmr.current); setMicSec(0); setMicOn(false);
        const blob = new Blob(chunks,{type:mime}); const form = new FormData(); form.append("file",blob,"voice.webm");
        try {
          notify("Transcribing…","info");
          const { data } = await axios.post(`${API}/speech-query`, form, { headers:authHeaders() });
          pushMsg({ role:"user", text:`🎤 ${data.transcribed_question}`, time:timeNow() });
          pushMsg({ role:"ai",  text:data.answer, time:timeNow(), sources:data.sources??[], streaming:false, error:false });
        } catch (e) { notify(e.response?.data?.detail||e.message,"err"); }
      };
      mr.start(200); setMicOn(true); setMicSec(0);
      micTmr.current = setInterval(()=>setMicSec(s=>s+1),1000);
    } catch (e) { notify(e.name==="NotAllowedError"?"Microphone access denied":e.message,"err"); }
  }, [notify, user]);

  const stopMic       = useCallback(()=>{ recRef.current?.state!=="inactive" && recRef.current?.stop(); },[]);
  const fmtMic        = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const copyMsg       = (id, text) => { navigator.clipboard.writeText(text).catch(()=>{}); setCopied(id); setTimeout(()=>setCopied(null),1800); };
  const handleSignOut = async () => { await signOut(auth); setDocs([]); setMsgs([]); setConversations([]); };

  if (user === undefined) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",
      background:"#080a09",color:"#c9a84c",fontSize:"0.85rem",letterSpacing:"0.15em",
      fontFamily:"'Cinzel',serif" }}>
      Awakening Gyana AI…
    </div>
  );
  if (user === null) return <LoginPage/>;

  const suggestions = mode==="ai" ? AI_SUGGESTIONS : DOC_SUGGESTIONS;
  const placeholder = micOn ? "Recording…" : mode==="ai"
    ? "Ask your guru anything…"
    : readyDocs.length===0 ? "Upload a document to begin…"
    : "Ask anything about your documents…";

  return (
    <>
      {guruOpen && <GuruMode user={user} onClose={()=>setGuruOpen(false)}/>}

      <div className="shell">
        <div className={`sidebar-overlay${sidebarOpen?" open":""}`} onClick={()=>setSidebarOpen(false)}/>

        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen?" open":""}`}>
          <div className="sb-sheen"/>
          <div className="sb-brand">
            <div className="sb-icon"><BrainSvg/></div>
            <div>
              <div className="sb-name">Gyana AI</div>
              <div className="sb-tagline">ज्ञानं परमं बलम्</div>
            </div>
            <button className="sb-close-btn" onClick={()=>setSidebarOpen(false)}>✕</button>
          </div>

          <div style={{ display:"flex",alignItems:"center",gap:"8px",padding:"8px 12px",
            borderRadius:"8px",background:"rgba(201,168,76,.04)",border:"1px solid rgba(201,168,76,.1)",
            margin:"10px 12px 8px", position:"relative", zIndex:1 }}>
            {user.photoURL&&<img src={user.photoURL} alt="" width={22} height={22} style={{borderRadius:"50%"}}/>}
            <span style={{fontSize:"0.7rem",color:"#aaa",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {user.displayName||user.email}
            </span>
            <button onClick={handleSignOut} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:"0.65rem",padding:"2px 6px",borderRadius:"4px"}}>↩</button>
          </div>

          <button className="new-btn" onClick={startNewConversation} style={{position:"relative",zIndex:1}}>
            <PlusSvg/> New conversation
          </button>

          <div style={{ display:"flex",margin:"0 12px 8px",gap:"4px",position:"relative",zIndex:1 }}>
            {["docs","history"].map(tab=>(
              <button key={tab} onClick={()=>setSidebarTab(tab)} style={{
                flex:1,padding:"6px",borderRadius:"7px",border:"none",
                background:sidebarTab===tab?"rgba(201,168,76,.12)":"transparent",
                color:sidebarTab===tab?"#e2c06a":"#5a7874",
                fontFamily:"var(--ui)",fontSize:"11px",fontWeight:500,cursor:"pointer",
              }}>{tab==="docs"?"📄 Documents":"🕘 History"}</button>
            ))}
          </div>

          {sidebarTab==="docs" ? (<>
            <p className="sb-label">Knowledge Base</p>
            <div className={`dz${drag?" dz-over":""}`} role="button" tabIndex={0}
              onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDrag(true);}}
              onDragLeave={()=>setDrag(false)} onDrop={onDrop}
              onKeyDown={e=>e.key==="Enter"&&fileRef.current?.click()}>
              <div className="dz-ring">{drag?"📂":"⊕"}</div>
              <span className="dz-t">Drop files or click to upload</span>
              <span className="dz-s">PDF · DOCX · PPTX · TXT · Images · Audio</span>
            </div>
            <input ref={fileRef} type="file" hidden multiple accept={ACCEPT} onChange={e=>handleFiles(e.target.files)}/>
            <div className="doc-list">
              {docs.map((d,i)=>(
                <div key={d.id} className={`doc-row${d.status==="error"?" doc-err":""}`} style={{animationDelay:`${i*.05}s`}}>
                  <div className="doc-ico">{fileIcon(d.name)}</div>
                  <div className="doc-info">
                    <div className="doc-name" title={d.name}>{d.name}</div>
                    <div className="doc-meta">{d.size}{d.lang&&d.lang!=="unknown"?` · ${d.lang.toUpperCase()}`:""}{d.chunks?` · ${d.chunks} chunks`:""}</div>
                    {d.status==="uploading"&&<div className="doc-bar"><div className="doc-fill" style={{width:`${d.progress}%`}}/></div>}
                  </div>
                  <div className={`doc-dot ${d.status}`}/>
                </div>
              ))}
            </div>
            {readyDocs.length>0&&<button className="clear-btn" onClick={clearDocs}>🗑 Remove all documents</button>}
          </>) : (<>
            <p className="sb-label">Chat History</p>
            <div className="conv-list">
              {conversations.length===0 ? (
                <div className="conv-empty"><div style={{fontSize:"24px",marginBottom:"8px"}}>💬</div>No conversations yet.</div>
              ) : conversations.map(conv=>(
                <div key={conv.id} className={`conv-item${activeConvId===conv.id?" active":""}`} onClick={()=>loadConversation(conv)}>
                  <div className="conv-ico">{conv.mode==="ai"?"🤖":"📄"}</div>
                  <div className="conv-info">
                    <div className="conv-title">{conv.title}</div>
                    <div className="conv-meta">{conv.date} · {conv.messages.length} msgs</div>
                  </div>
                  <button className="conv-del" onClick={e=>deleteConversation(conv.id,e)}>✕</button>
                </div>
              ))}
            </div>
          </>)}

          <div className="sb-spacer"/>
          <div className="sb-foot">
            {/* Guru Mode button */}
            <button onClick={()=>setGuruOpen(true)} style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
              width:"100%",padding:"10px",marginBottom:"8px",
              background:"linear-gradient(135deg,rgba(201,168,76,.15),rgba(13,138,122,.1))",
              border:"1px solid rgba(201,168,76,.25)",borderRadius:"var(--r)",
              color:"#e2c06a",fontFamily:"'Cinzel',serif",fontSize:"11px",fontWeight:600,
              cursor:"pointer",transition:"all .2s",letterSpacing:"0.08em",
              boxShadow:"0 0 12px rgba(201,168,76,.08)",
            }}>🪔 Guru Mode — Live Voice</button>
            <div className="model-pill">
              <div className="model-led"/>
              <div><div className="model-name">LLaMA 3.3 70B</div><div className="model-sub">Groq · Supabase · ElevenLabs</div></div>
            </div>
            <p className="doc-count">{mode==="ai"?"General AI mode":readyDocs.length===0?"No documents indexed":`${readyDocs.length} doc${readyDocs.length>1?"s":""} in context`}</p>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="main">
          <div className="glow g1"/><div className="glow g2"/>

          <div className="topbar">
            <div className="tb-left">
              <button className="menu-btn" onClick={()=>setSidebarOpen(true)}><MenuSvg/></button>
              <span className="tb-title">{mode==="ai"?"AI Assistant":"Query Interface"}</span>
              {mode==="docs"&&readyDocs.length>0&&(
                <div className="ctx-pill">
                  <span className="ctx-led"/>
                  <span className="ctx-txt">{readyDocs.slice(0,2).map(d=>d.name).join(" · ")}{readyDocs.length>2?` +${readyDocs.length-2} more`:""}</span>
                </div>
              )}
            </div>
            <div className="tb-right">
              <button className="guru-btn" onClick={()=>setGuruOpen(true)}>🪔 Guru</button>
              <button className="top-btn" onClick={()=>{ if(autoSpeak)stopSpeaking(); setAutoSpeak(p=>!p); }}
                style={autoSpeak?{borderColor:"rgba(201,168,76,.3)",color:"#e2c06a",background:"rgba(201,168,76,.1)"}:{}}>
                {autoSpeak?"🔊":"🔇"}
              </button>
              <div className="mode-toggle">
                <button className={`mode-btn${mode==="docs"?" active":""}`} onClick={()=>setMode("docs")}>📄</button>
                <button className={`mode-btn${mode==="ai"?" active":""}`} onClick={()=>setMode("ai")}>🤖</button>
              </div>
              {msgs.length>0&&<button className="top-btn" onClick={startNewConversation}>Clear</button>}
            </div>
          </div>

          <div className="feed">
            {msgs.length===0 ? (
              <div className="welcome">
                <div className="w-orb"><BrainSvg size={32}/></div>
                <div className="w-sanskrit">ज्ञानं परमं ध्येयम्</div>
                <h2 className="w-h">{mode==="ai"?"What wisdom do you seek?":"How may I guide you today?"}</h2>
                <p className="w-p">
                  {mode==="ai"
                    ? "Your personal guru — friend, advisor, teacher, and companion. All in one."
                    : "Upload your documents and ask anything. Or switch to AI mode for open conversation."}
                </p>
                <button onClick={()=>setGuruOpen(true)} style={{
                  marginTop:"20px",padding:"12px 28px",
                  background:"linear-gradient(135deg,rgba(201,168,76,.2),rgba(13,138,122,.15))",
                  border:"1px solid rgba(201,168,76,.3)",borderRadius:"50px",
                  color:"#e2c06a",fontFamily:"'Cinzel',serif",fontSize:"13px",fontWeight:600,
                  cursor:"pointer",boxShadow:"0 4px 24px rgba(201,168,76,.15)",
                  display:"flex",alignItems:"center",gap:"8px",letterSpacing:"0.06em",
                }}>🪔 Enter Guru Mode — Live Voice</button>
                {(mode==="ai"||readyDocs.length>0)&&(
                  <div className="sug-grid" style={{marginTop:"20px"}}>
                    {suggestions.map(s=>(
                      <button key={s.title} className="sug-card" onClick={()=>send(s.title)} disabled={loading}>
                        <span className="sug-t">{s.title}</span>
                        <span className="sug-d">{s.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="msgs">
                {msgs.map(msg => msg.role==="user" ? (
                  <div key={msg.id} className="turn">
                    <div className="h-row">
                      <div className="h-time">{msg.time}</div>
                      <div className="h-bub">{msg.text}</div>
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="turn">
                    <div className="a-row">
                      <div className="a-av"><BrainSvg size={13}/></div>
                      <div className="a-body">
                        <div className="a-meta"><span className="a-name">Gyana AI</span><span className="a-time">{msg.time}</span></div>
                        <div className={`a-text${msg.error?" a-err":""}`}>
                          {msg.text?<MD text={msg.text}/>:msg.streaming?<div className="typing"><span/><span/><span/></div>:null}
                          {msg.streaming&&msg.text&&<span className="cur"/>}
                        </div>
                        {!msg.streaming&&msg.sources?.length>0&&(
                          <div className="sources">
                            <span className="src-lbl">Sources —</span>
                            {msg.sources.map((s,i)=><span key={i} className="src-chip">📄 {s}</span>)}
                          </div>
                        )}
                        {!msg.streaming&&!msg.error&&(
                          <div className="a-acts">
                            <button className="act-btn" onClick={()=>copyMsg(msg.id,msg.text)}>
                              {copied===msg.id?<><CheckSvg/> Copied</>:<><CopySvg/> Copy</>}
                            </button>
                            <button className="act-btn" onClick={()=>speakMsg(msg.id,msg.text)}
                              style={speaking===msg.id?{color:"#e2c06a",background:"rgba(201,168,76,.1)"}:{}}>
                              {speaking===msg.id?<><StopSvg/> Stop</>:<><SpeakSvg/> Listen</>}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef}/>
              </div>
            )}
          </div>

          <div className="inp-wrap">
            <div className="inp-box">
              <textarea ref={taRef} value={input} rows={1} placeholder={placeholder}
                disabled={loading||micOn}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
              />
              <div className="inp-bar">
                <div className="inp-tools">
                  <button className={`tool-btn${micOn?" mic-on":""}`} onClick={micOn?stopMic:startMic}>
                    {micOn?<span className="rec-row"><span className="rec-dot"/><span className="rec-t">{fmtMic(micSec)}</span></span>:<MicSvg/>}
                  </button>
                  {mode==="docs"&&<button className="tool-btn" onClick={()=>fileRef.current?.click()}><AttachSvg/></button>}
                  <button className="tool-btn" onClick={()=>setGuruOpen(true)} title="Guru Mode" style={{color:"#c9a84c",fontSize:"16px"}}>🪔</button>
                </div>
                <button className="send-btn" onClick={()=>send()} disabled={loading||!input.trim()||micOn}>
                  {loading?<span className="spin"/>:<UpSvg/>}
                </button>
              </div>
            </div>
            <p className="inp-hint">
              <span style={{color:"#c9a84c",fontWeight:600}}>🪔 Guru Mode</span> for live voice
              &nbsp;·&nbsp;<kbd>Enter</kbd> send&nbsp;·&nbsp;<kbd>Shift+Enter</kbd> new line
            </p>
          </div>
        </div>
      </div>

      {toast&&<div className={`toast toast-${toast.type}`}>{toast.type==="err"?"✕":toast.type==="info"?"◎":"✓"}&nbsp;{toast.msg}</div>}
    </>
  );
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const BrainSvg  = ({size=18}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-3 2.5 2.5 0 0 1 .98-4.76V9a2.5 2.5 0 0 1 2.5-2.5zm5 0A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-3 2.5 2.5 0 0 0-.98-4.76V9a2.5 2.5 0 0 0-2.5-2.5z"/></svg>;
const PlusSvg   = ()         => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const MicSvg    = ()         => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8"/></svg>;
const AttachSvg = ()         => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
const UpSvg     = ()         => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
const CopySvg   = ()         => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const CheckSvg  = ()         => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;
const MenuSvg   = ()         => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const SpeakSvg  = ()         => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>;
const StopSvg   = ()         => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;