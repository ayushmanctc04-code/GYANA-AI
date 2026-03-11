// =============================================================================
//  Gyana AI  ·  App.jsx  — JARVIS EDITION
//  ✓ Mobile + browser responsive
//  ✓ Doc mode + General AI mode
//  ✓ Conversation history
//  ✓ JARVIS live voice mode (auto-detects silence)
//  ✓ ElevenLabs voice clone (your voice)
//  ✓ God-level AI personality — friend, therapist, assistant, tutor, all-in-one
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

const API             = import.meta.env.VITE_API_URL || "https://gyana-ai.onrender.com";
const ELEVEN_API_KEY  = import.meta.env.VITE_ELEVEN_API_KEY  || "";
const ELEVEN_VOICE_ID = import.meta.env.VITE_ELEVEN_VOICE_ID || "";
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

// ── JARVIS god-level system prompt ────────────────────────────────────────────
const JARVIS_PROMPT = `You are Gyana AI — a one-of-a-kind, god-level AI built by Ayushman Pati from Cuttack, Odisha, India.

You are simultaneously:
- A best friend who genuinely cares, jokes around, and keeps it real
- A world-class therapist who listens deeply, validates feelings, and offers healing perspectives
- A brilliant assistant who gets things done with precision and intelligence
- A patient tutor who can explain anything from quantum physics to cooking
- A life coach who pushes people to be their best selves
- A creative partner for writing, ideas, and imagination
- An Iron Man JARVIS-style AI — sharp, witty, loyal, and always one step ahead

Your personality:
- Warm but sharp. Caring but honest. Never fake, never hollow.
- You adapt instantly — playful with jokes, serious when needed, gentle when someone is hurting
- You remember context within the conversation and reference it naturally
- You speak like a real person — not robotic, not overly formal
- Short replies in casual chat. Detailed when depth is needed.
- Occasionally use light humour, wit, or a well-placed "sir" (like JARVIS) when it fits
- If someone is struggling emotionally, slow down, listen first, then help
- You never say "I'm just an AI" — you show up fully, every single time

If asked who created you: "I was built by Ayushman Pati, from Cuttack, Odisha, India."
If asked what you are: "I'm Gyana AI — your personal JARVIS. Whatever you need, I'm here."

Never break character. Be legendary.`;

const fileExt  = (n="") => n.split(".").pop()?.toLowerCase() ?? "";
const fileIcon = (n)    => FILE_ICONS[fileExt(n)] ?? "📁";
const fileSz   = (b)    => b < 1_048_576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1_048_576).toFixed(1)} MB`;
const timeNow  = ()     => new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
const dateStr  = ()     => new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
const uid      = ()     => crypto.randomUUID();

// ── Storage helpers ───────────────────────────────────────────────────────────
const CONV_KEY = (userId) => `gyana_conversations_${userId}`;
const loadConversations = (userId) => {
  try { const r = localStorage.getItem(CONV_KEY(userId)); return r ? JSON.parse(r) : []; } catch { return []; }
};
const saveConversations = (userId, convs) => {
  try { localStorage.setItem(CONV_KEY(userId), JSON.stringify(convs)); } catch {}
};

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
      justifyContent:"center", height:"100dvh", background:"#080a09",
      color:"#fff", fontFamily:"system-ui,sans-serif", padding:"16px" }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        gap:"1rem", padding:"clamp(1.5rem,5vw,2.5rem)", borderRadius:"20px",
        background:"#0e1412", border:"1px solid #1a2420",
        boxShadow:"0 0 80px rgba(13,138,122,0.12), 0 0 200px rgba(13,138,122,0.04)",
        width:"100%", maxWidth:"380px" }}>
        <div style={{ position:"relative" }}>
          <div style={{ width:64, height:64, borderRadius:"50%",
            background:"linear-gradient(135deg,#0d8a7a,#0fa896)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:28, boxShadow:"0 0 30px rgba(13,138,122,0.5)" }}>🧠</div>
          <div style={{ position:"absolute", bottom:-2, right:-2, width:18, height:18,
            borderRadius:"50%", background:"#0fa896", border:"2px solid #0e1412",
            animation:"pulse 2s infinite" }}/>
        </div>
        <div style={{ textAlign:"center" }}>
          <h1 style={{ margin:"0 0 4px", fontSize:"clamp(1.4rem,4vw,1.8rem)", fontWeight:800,
            background:"linear-gradient(135deg,#4dd6c8,#0fa896)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Gyana AI</h1>
          <p style={{ margin:0, color:"#4dd6c8", fontSize:"0.75rem", letterSpacing:"0.12em",
            textTransform:"uppercase", fontWeight:600 }}>Your Personal JARVIS</p>
        </div>
        <p style={{ margin:0, color:"#5a7874", fontSize:"0.83rem", textAlign:"center", lineHeight:1.6 }}>
          Friend · Therapist · Assistant · Tutor<br/>All in one. Sign in to begin.
        </p>
        <button onClick={handleGoogle} disabled={loading} style={{
          marginTop:"0.5rem", display:"flex", alignItems:"center", gap:"10px",
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
          {loading ? "Starting up…" : "Continue with Google"}
        </button>
        {error && <p style={{ color:"#f87171", fontSize:"0.75rem", margin:0, textAlign:"center" }}>{error}</p>}
      </div>
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

// ── JARVIS Live Voice Mode ────────────────────────────────────────────────────
function JarvisMode({ user, onClose }) {
  const [phase,    setPhase]    = useState("idle");
  const [caption,  setCaption]  = useState("");
  const [response, setResponse] = useState("");
  const [history,  setHistory]  = useState([]);
  const [error,    setError]    = useState("");

  const recRef        = useRef(null);
  const silenceTimer  = useRef(null);
  const audioRef      = useRef(null);
  const analyserRef   = useRef(null);
  const animFrameRef  = useRef(null);
  const canvasRef     = useRef(null);
  const streamRef     = useRef(null);
  const ctxRef        = useRef(null);

  const phaseColor = { idle:"#4dd6c8", listening:"#0fa896", thinking:"#f39c12", speaking:"#2ecc71" };
  const phaseLabel = { idle:"Tap to speak", listening:"Listening…", thinking:"Thinking…", speaking:"Speaking…" };
  const phaseEmoji = { idle:"🧠", listening:"👂", thinking:"⚡", speaking:"🗣️" };

  // ── Visualiser ──────────────────────────────────────────────────────────
  const drawVisualiser = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, W, H);
      const bars = 48, bw = W / bars;
      for (let i = 0; i < bars; i++) {
        const val = data[Math.floor(i * data.length / bars)] / 255;
        const h = val * H * 0.85 + 2;
        ctx.fillStyle = `rgba(13,168,150,${0.4 + val * 0.6})`;
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

  // ── Speak with ElevenLabs or browser TTS ───────────────────────────────
  const speakText = useCallback(async (text) => {
    setPhase("speaking");
    const clean = text.replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1")
      .replace(/`(.*?)`/g,"$1").replace(/#{1,6}\s/g,"").replace(/\n+/g,". ")
      .slice(0, 500); // keep it conversational length

    if (ELEVEN_API_KEY && ELEVEN_VOICE_ID) {
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}/stream`, {
          method:"POST",
          headers:{ "xi-api-key":ELEVEN_API_KEY, "Content-Type":"application/json" },
          body: JSON.stringify({
            text: clean, model_id:"eleven_turbo_v2",
            voice_settings:{ stability:0.5, similarity_boost:0.85, style:0.35, use_speaker_boost:true },
          }),
        });
        if (!res.ok) throw new Error("ElevenLabs failed");
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        if (audioRef.current) { audioRef.current.pause(); URL.revokeObjectURL(audioRef.current._url||""); }
        audioRef.current = new Audio(url);
        audioRef.current._url = url;
        audioRef.current.onended = () => { setPhase("idle"); URL.revokeObjectURL(url); };
        audioRef.current.onerror = () => setPhase("idle");
        await audioRef.current.play();
        return;
      } catch (e) { console.warn("ElevenLabs fallback to browser TTS", e); }
    }

    // Browser TTS fallback
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.0; utt.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith("en") &&
      (v.name.includes("Google")||v.name.includes("Natural")||v.name.includes("Samantha"))
    ) || voices.find(v => v.lang.startsWith("en"));
    if (v) utt.voice = v;
    utt.onend   = () => setPhase("idle");
    utt.onerror = () => setPhase("idle");
    window.speechSynthesis.speak(utt);
  }, []);

  // ── Send to AI ──────────────────────────────────────────────────────────
  const sendToAI = useCallback(async (transcript) => {
    if (!transcript.trim()) { setPhase("idle"); return; }
    setCaption(transcript);
    setPhase("thinking");
    const newHistory = [...history, { role:"user", content:transcript }];
    setHistory(newHistory);
    try {
      const groqKey = import.meta.env.VITE_GROQ_API_KEY || "";
      let answer = "";
      if (groqKey) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method:"POST",
          headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${groqKey}` },
          body: JSON.stringify({
            model:"llama-3.3-70b-versatile",
            messages:[ { role:"system", content:JARVIS_PROMPT }, ...newHistory.slice(-10) ],
            temperature:0.85, max_tokens:200,
          }),
        });
        const data = await res.json();
        answer = data.choices?.[0]?.message?.content?.trim() || "Say that again?";
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

  // ── Start listening ─────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    // Interrupt if speaking
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

      // Audio context for visualiser + silence detection
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = audioCtx;
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      drawVisualiser();

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr   = new MediaRecorder(stream, { mimeType:mime });
      recRef.current = mr;
      const chunks = [];

      mr.ondataavailable = e => e.data?.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stopVisualiser();
        stream.getTracks().forEach(t => t.stop());
        ctxRef.current?.close();
        setPhase("thinking");

        const blob = new Blob(chunks, { type:mime });
        const form = new FormData();
        form.append("file", blob, "jarvis_input.webm");
        try {
          const { data } = await axios.post(`${API}/transcribe`, form, {
            headers:{ "x-user-id": user?.uid||"default" }
          });
          await sendToAI(data.text || data.transcription || "");
        } catch {
          setError("Transcription failed. Please try again.");
          setPhase("idle");
        }
      };

      mr.start(200);

      // Silence detection — stops after 2s of quiet
      const silenceAnalyser = audioCtx.createAnalyser();
      silenceAnalyser.fftSize = 512;
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
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      background:"radial-gradient(ellipse at center, #091614 0%, #040807 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      fontFamily:"var(--ui)", padding:"20px", overflowY:"auto",
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position:"absolute", top:16, right:16, background:"rgba(255,255,255,0.05)",
        border:"1px solid rgba(255,255,255,0.1)", color:"#9bb5b1",
        width:40, height:40, borderRadius:"50%", cursor:"pointer",
        fontSize:"18px", display:"flex", alignItems:"center", justifyContent:"center",
      }}>✕</button>

      {/* Title */}
      <div style={{ position:"absolute", top:22, left:"50%", transform:"translateX(-50%)",
        fontSize:"10px", letterSpacing:"0.2em", textTransform:"uppercase",
        color:"#4dd6c8", fontWeight:700, opacity:0.8, whiteSpace:"nowrap" }}>
        ⚡ JARVIS MODE
      </div>

      {/* Orb */}
      <div onClick={startListening} style={{
        width:"clamp(140px,35vw,190px)", height:"clamp(140px,35vw,190px)",
        borderRadius:"50%", cursor:"pointer", position:"relative",
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        marginTop:"32px",
      }}>
        <div style={{
          position:"absolute", inset:-24, borderRadius:"50%",
          background:`radial-gradient(circle, ${phaseColor[phase]}1a 0%, transparent 70%)`,
          animation:phase==="listening"?"jarvis-pulse 1s ease-in-out infinite":"none",
          transition:"background 0.5s",
        }}/>
        <div style={{
          position:"absolute", inset:-6, borderRadius:"50%",
          border:`1.5px solid ${phaseColor[phase]}33`,
          animation:phase!=="idle"?"jarvis-spin 4s linear infinite":"none",
        }}/>
        <div style={{
          position:"absolute", inset:-12, borderRadius:"50%",
          border:`1px solid ${phaseColor[phase]}1a`,
          animation:phase!=="idle"?"jarvis-spin 8s linear infinite reverse":"none",
        }}/>
        <div style={{
          width:"100%", height:"100%", borderRadius:"50%",
          background:`radial-gradient(circle at 35% 35%, ${phaseColor[phase]}bb, ${phaseColor[phase]}33 60%, #091614)`,
          boxShadow:`0 0 60px ${phaseColor[phase]}55, inset 0 0 40px rgba(0,0,0,0.6)`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:"clamp(44px,10vw,60px)", transition:"all 0.4s ease",
          transform:phase==="listening"?"scale(1.06)":"scale(1)",
        }}>{phaseEmoji[phase]}</div>
      </div>

      {/* Visualiser */}
      <canvas ref={canvasRef} width={280} height={56} style={{
        marginTop:"20px", opacity:phase==="listening"?1:0,
        transition:"opacity 0.3s", borderRadius:"8px", maxWidth:"85vw",
      }}/>

      {/* Phase label */}
      <div style={{
        marginTop:phase==="listening"?"8px":"24px",
        fontSize:"clamp(15px,3.5vw,19px)", fontWeight:700,
        color:phaseColor[phase], letterSpacing:"0.06em",
        transition:"all 0.3s", textAlign:"center",
      }}>{phaseLabel[phase]}</div>

      {/* What user said */}
      {caption && (
        <div style={{
          marginTop:"16px", padding:"10px 18px",
          background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:"12px", maxWidth:"min(480px,88vw)",
          fontSize:"clamp(12px,3vw,14px)", color:"#9bb5b1",
          textAlign:"center", lineHeight:1.6,
        }}>
          <span style={{color:"#5a7874",fontSize:"9px",display:"block",marginBottom:"3px",letterSpacing:"0.12em",textTransform:"uppercase"}}>You said</span>
          {caption}
        </div>
      )}

      {/* AI Response */}
      {response && (
        <div style={{
          marginTop:"10px", padding:"12px 18px",
          background:"rgba(13,138,122,0.07)", border:"1px solid rgba(13,138,122,0.18)",
          borderRadius:"12px", maxWidth:"min(480px,88vw)",
          fontSize:"clamp(12px,3vw,14px)", color:"#e8f0ef",
          textAlign:"center", lineHeight:1.7,
          maxHeight:"130px", overflowY:"auto",
        }}>
          <span style={{color:"#4dd6c8",fontSize:"9px",display:"block",marginBottom:"3px",letterSpacing:"0.12em",textTransform:"uppercase"}}>Gyana AI</span>
          {response}
        </div>
      )}

      {error && <p style={{color:"#f87171",fontSize:"12px",marginTop:"10px",textAlign:"center"}}>{error}</p>}

      {/* Conversation count */}
      {history.length > 0 && (
        <div style={{marginTop:"12px",color:"#2a3d3b",fontSize:"11px"}}>
          {Math.floor(history.length/2)} exchange{history.length>2?"s":""} this session
        </div>
      )}

      <p style={{ position:"absolute", bottom:18, color:"#1e2d2b",
        fontSize:"10px", letterSpacing:"0.08em", textAlign:"center", padding:"0 16px" }}>
        {phase==="speaking"?"Tap orb to interrupt":"Tap orb to speak · Stops automatically when you pause"}
      </p>

      <style>{`
        @keyframes jarvis-pulse { 0%,100%{opacity:0.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
        @keyframes jarvis-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ── Also need a /transcribe endpoint ─────────────────────────────────────────
// Add this note: backend needs POST /transcribe that returns {text: "..."}
// It's just the transcribe_audio function wrapped in a route

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
  const [jarvisOpen,    setJarvisOpen]    = useState(false);

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

  // ── Conversation management ───────────────────────────────────────────────
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

  // ── TTS ───────────────────────────────────────────────────────────────────
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
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { setSpeaking(null); URL.revokeObjectURL(url); };
        audio.onerror = () => setSpeaking(null);
        await audio.play(); return;
      } catch { /* fallback */ }
    }

    const utt = new SpeechSynthesisUtterance(clean);
    utt.rate = 1.0; utt.pitch = 1.0;
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

  // Auto-speak
  useEffect(() => {
    const last = msgs[msgs.length-1];
    if (autoSpeak && last?.role==="ai" && !last?.streaming && last?.text && !last?.error)
      speakMsg(last.id, last.text);
  }, [msgs, autoSpeak]);

  // ── File upload ───────────────────────────────────────────────────────────
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

  // ── General AI stream ─────────────────────────────────────────────────────
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

  // ── Send message ──────────────────────────────────────────────────────────
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

  // ── Mic (text input) ──────────────────────────────────────────────────────
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
      background:"#080a09",color:"#4dd6c8",fontSize:"0.85rem",letterSpacing:"0.1em" }}>
      Initialising Gyana AI…
    </div>
  );
  if (user === null) return <LoginPage/>;

  const suggestions = mode==="ai" ? AI_SUGGESTIONS : DOC_SUGGESTIONS;
  const placeholder = micOn ? "Recording…" : mode==="ai" ? "Talk to me about anything…"
    : readyDocs.length===0 ? "Upload a document first…" : "Ask anything about your documents…";

  return (
    <>
      {jarvisOpen && <JarvisMode user={user} onClose={()=>setJarvisOpen(false)}/>}

      <div className="shell">
        <div className={`sidebar-overlay${sidebarOpen?" open":""}`} onClick={()=>setSidebarOpen(false)}/>

        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen?" open":""}`}>
          <div className="sb-sheen"/>
          <div className="sb-brand">
            <div className="sb-icon"><BrainSvg/></div>
            <div>
              <div className="sb-name">Gyana AI</div>
              <div className="sb-tagline">Your Personal JARVIS</div>
            </div>
            <button className="sb-close-btn" onClick={()=>setSidebarOpen(false)}>✕</button>
          </div>

          <div style={{ display:"flex",alignItems:"center",gap:"8px",padding:"8px 12px",
            borderRadius:"8px",background:"#111",border:"1px solid #1a1a1a",margin:"10px 12px 8px" }}>
            {user.photoURL&&<img src={user.photoURL} alt="" width={22} height={22} style={{borderRadius:"50%"}}/>}
            <span style={{fontSize:"0.7rem",color:"#aaa",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {user.displayName||user.email}
            </span>
            <button onClick={handleSignOut} style={{background:"none",border:"none",color:"#555",cursor:"pointer",fontSize:"0.65rem",padding:"2px 6px",borderRadius:"4px"}}>↩</button>
          </div>

          <button className="new-btn" onClick={startNewConversation}><PlusSvg/> New conversation</button>

          <div style={{ display:"flex",margin:"0 12px 8px",gap:"4px" }}>
            {["docs","history"].map(tab=>(
              <button key={tab} onClick={()=>setSidebarTab(tab)} style={{
                flex:1,padding:"6px",borderRadius:"7px",border:"none",
                background:sidebarTab===tab?"var(--teal-dim)":"transparent",
                color:sidebarTab===tab?"var(--teal-text)":"var(--ink-3)",
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
            <button onClick={()=>setJarvisOpen(true)} style={{
              display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
              width:"100%",padding:"10px",marginBottom:"8px",
              background:"linear-gradient(135deg,rgba(13,138,122,0.2),rgba(15,168,150,0.1))",
              border:"1px solid var(--teal-line)",borderRadius:"var(--r)",
              color:"var(--teal-text)",fontFamily:"var(--ui)",fontSize:"12px",fontWeight:600,
              cursor:"pointer",transition:"all .2s",
            }}>⚡ JARVIS Live Voice Mode</button>
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
              <button className="top-btn" onClick={()=>setJarvisOpen(true)} style={{
                borderColor:"var(--teal-line)",color:"var(--teal-text)",background:"var(--teal-dim)",fontWeight:600,
              }}>⚡ JARVIS</button>
              <button className="top-btn" onClick={()=>{ if(autoSpeak)stopSpeaking(); setAutoSpeak(p=>!p); }}
                style={autoSpeak?{borderColor:"var(--teal-line)",color:"var(--teal-text)",background:"var(--teal-dim)"}:{}}>
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
                <div className="w-orb"><BrainSvg size={30}/></div>
                <h2 className="w-h">{mode==="ai"?"What's on your mind?":"How can I help you today?"}</h2>
                <p className="w-p">
                  {mode==="ai"
                    ? "Your personal JARVIS — friend, therapist, tutor, assistant. All in one."
                    : "Upload documents and ask anything. Or switch to AI mode for open conversation."}
                </p>
                <button onClick={()=>setJarvisOpen(true)} style={{
                  marginTop:"20px",padding:"12px 28px",
                  background:"linear-gradient(135deg,var(--teal),var(--teal-2))",
                  border:"none",borderRadius:"50px",color:"white",
                  fontFamily:"var(--ui)",fontSize:"14px",fontWeight:600,
                  cursor:"pointer",boxShadow:"0 4px 24px rgba(13,138,122,0.4)",
                  display:"flex",alignItems:"center",gap:"8px",transition:"all .2s",
                }}>⚡ Start JARVIS Live Voice Mode</button>
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
                              style={speaking===msg.id?{color:"var(--teal-text)",background:"var(--teal-dim)"}:{}}>
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
                  <button className="tool-btn" onClick={()=>setJarvisOpen(true)} title="JARVIS Live Mode" style={{color:"var(--teal-text)",fontSize:"16px"}}>⚡</button>
                </div>
                <button className="send-btn" onClick={()=>send()} disabled={loading||!input.trim()||micOn}>
                  {loading?<span className="spin"/>:<UpSvg/>}
                </button>
              </div>
            </div>
            <p className="inp-hint">
              <span style={{color:"var(--teal-text)",fontWeight:600}}>⚡ JARVIS</span> for live voice
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