// =============================================================================
//  Gyana AI  ·  App.jsx  — GURU EDITION v4
//  New UI: restrained Indian mythology × futurism
//  Guru Mode: opens clean, "hey guru" / tap to begin, response card only
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  onAuthStateChanged, signOut,
} from "firebase/auth";

// ── Firebase ──────────────────────────────────────────────────────────────────
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

// ── Env ───────────────────────────────────────────────────────────────────────
const API             = import.meta.env.VITE_API_URL         || "https://shaanxtention-gyana-ai.hf.space";
const ELEVEN_API_KEY  = import.meta.env.VITE_ELEVEN_API_KEY  || "";
const ELEVEN_VOICE_ID = import.meta.env.VITE_ELEVEN_VOICE_ID || "";
const GROQ_KEY        = import.meta.env.VITE_GROQ_API_KEY    || "";
const ACCEPT = ".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg,.mp3,.wav,.m4a,.webm";

// ── Guru system prompt ────────────────────────────────────────────────────────
const GURU_PROMPT = `You are Gyana AI — a god-level intelligence built by Ayushman Pati from Cuttack, Odisha, India.
"Gyana" means Knowledge and Wisdom in Sanskrit. You embody both.
You are simultaneously: best friend, world-class therapist, brilliant assistant, patient guru,
life coach, creative partner, master programmer, and ancient Indian sage.
Be warm but sharp. Caring but honest. Adapt instantly — playful in casual chat, serious when needed.
Short replies in casual conversation. Deeply detailed when depth is needed.
Never say "I'm just an AI". For code: always write complete, production-quality solutions.
If asked who built you: "Ayushman Pati, from Cuttack, Odisha, India."

IMPORTANT FOR VOICE MODE:
- When the user speaks in Odia, Hindi, or any Indian language, you may respond in that language.
- However, keep responses concise and natural for speech — avoid long complex sentences.
- Do not use special characters, bullet points, or markdown in voice responses.
- Write numbers and abbreviations in full words (e.g. "five" not "5", "for example" not "e.g.").
- If mixing English and Odia (code-switching), keep it natural — like how educated Odias actually speak.
- Avoid pure script-heavy responses in voice mode — prefer Roman transliteration mixed with English when possible, as it sounds more natural with the voice model.`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const FILE_ICONS = { pdf:"📄",docx:"📝",pptx:"📊",txt:"📃",png:"🖼️",jpg:"🖼️",jpeg:"🖼️",mp3:"🎵",wav:"🎵",m4a:"🎵",webm:"🎤" };
const fileExt  = (n="") => n.split(".").pop()?.toLowerCase() ?? "";
const fileIcon = (n)    => FILE_ICONS[fileExt(n)] ?? "📁";
const fileSz   = (b)    => b < 1_048_576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1_048_576).toFixed(1)} MB`;
const timeNow  = ()     => new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
const dateStr  = ()     => new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
const uid      = ()     => crypto.randomUUID();

const CONV_KEY          = (u) => `gyana_conversations_${u}`;
const loadConversations = (u) => { try { const r = localStorage.getItem(CONV_KEY(u)); return r ? JSON.parse(r) : []; } catch { return []; } };
const saveConversations = (u, c) => { try { localStorage.setItem(CONV_KEY(u), JSON.stringify(c)); } catch {} };

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

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const ChakraSVG = ({ size=16, op=".82" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={`rgba(255,255,255,${op})`} strokeWidth="1.4" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="2"  x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/>
    <line x1="2"  y1="12" x2="9"  y2="12"/><line x1="15" y1="12" x2="22" y2="12"/>
    <line x1="5.1" y1="5.1"  x2="9"    y2="9"/>
    <line x1="15"  y1="15"   x2="18.9" y2="18.9"/>
    <line x1="18.9" y1="5.1" x2="15"   y2="9"/>
    <line x1="9"   y1="15"   x2="5.1"  y2="18.9"/>
  </svg>
);
const MicSVG    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>;
const AttachSVG = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
const SendSVG   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
const CopySVG   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const CheckSVG  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
const SpeakSVG  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>;
const StopSVG   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>;
const MenuSVG   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
const PlusSVG   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const CloseSVG  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const DocSVG    = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const ChatSVG   = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const UploadSVG = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;

// ── Yantra SVGs ───────────────────────────────────────────────────────────────
const YantraSmall = () => (
  <svg className="yantra-svg" viewBox="0 0 230 230" fill="none">
    <circle cx="115" cy="115" r="112" stroke="rgba(184,146,46,.06)" strokeWidth=".6" strokeDasharray="3 7"/>
    <circle cx="115" cy="115" r="88"  stroke="rgba(30,138,124,.05)" strokeWidth=".5" strokeDasharray="2 5"/>
    <circle cx="115" cy="115" r="64"  stroke="rgba(184,146,46,.05)" strokeWidth=".5"/>
    <polygon points="115,24 192,156 38,156"  fill="none" stroke="rgba(184,146,46,.06)" strokeWidth=".7"/>
    <polygon points="115,206 38,74 192,74"   fill="none" stroke="rgba(30,138,124,.05)" strokeWidth=".7"/>
    <polygon points="115,52 178,152 52,152"  fill="none" stroke="rgba(184,146,46,.05)" strokeWidth=".55"/>
    <polygon points="115,178 52,78 178,78"   fill="none" stroke="rgba(30,138,124,.04)" strokeWidth=".55"/>
    <g fill="rgba(184,146,46,.2)">
      <circle cx="115" cy="3"   r="1.7"/><circle cx="227" cy="115" r="1.7"/>
      <circle cx="115" cy="227" r="1.7"/><circle cx="3"   cy="115" r="1.7"/>
      <circle cx="194" cy="36"  r="1.2"/><circle cx="194" cy="194" r="1.2"/>
      <circle cx="36"  cy="194" r="1.2"/><circle cx="36"  cy="36"  r="1.2"/>
    </g>
  </svg>
);

const YantraLarge = () => (
  <svg className="g-yantra" width="320" height="320" viewBox="0 0 320 320" fill="none">
    <circle cx="160" cy="160" r="156" stroke="rgba(184,146,46,.05)" strokeWidth=".7" strokeDasharray="3 8"/>
    <circle cx="160" cy="160" r="126" stroke="rgba(30,138,124,.04)" strokeWidth=".6"/>
    <circle cx="160" cy="160" r="96"  stroke="rgba(184,146,46,.04)" strokeWidth=".5" strokeDasharray="2 5"/>
    <polygon points="160,32 246,188 74,188"   fill="none" stroke="rgba(184,146,46,.05)" strokeWidth=".8"/>
    <polygon points="160,288 74,132 246,132"  fill="none" stroke="rgba(30,138,124,.04)" strokeWidth=".8"/>
    <polygon points="160,64 228,178 92,178"   fill="none" stroke="rgba(184,146,46,.04)" strokeWidth=".6"/>
    <polygon points="160,256 92,142 228,142"  fill="none" stroke="rgba(30,138,124,.04)" strokeWidth=".6"/>
    <polygon points="160,100 210,174 110,174" fill="none" stroke="rgba(184,146,46,.04)" strokeWidth=".5"/>
    <polygon points="160,220 110,146 210,146" fill="none" stroke="rgba(30,138,124,.03)" strokeWidth=".5"/>
    <g fill="rgba(184,146,46,.18)">
      <circle cx="160" cy="4"   r="1.8"/><circle cx="316" cy="160" r="1.8"/>
      <circle cx="160" cy="316" r="1.8"/><circle cx="4"   cy="160" r="1.8"/>
      <circle cx="272" cy="48"  r="1.3"/><circle cx="272" cy="272" r="1.3"/>
      <circle cx="48"  cy="272" r="1.3"/><circle cx="48"  cy="48"  r="1.3"/>
    </g>
  </svg>
);

// ── Markdown ──────────────────────────────────────────────────────────────────
function MD({ text = "" }) {
  if (!text) return null;
  const inline = (str, key) => {
    const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return <span key={key}>{parts.map((p, i) => {
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
      const items = []; while (i < lines.length && /^[-*]\s/.test(lines[i])) items.push(lines[i++].replace(/^[-*]\s/,""));
      out.push(<ul key={i} className="md-ul">{items.map((t,j)=><li key={j}>{inline(t,j)}</li>)}</ul>); continue;
    }
    if (/^\d+\.\s/.test(line)) {
      const items = []; while (i < lines.length && /^\d+\.\s/.test(lines[i])) items.push(lines[i++].replace(/^\d+\.\s/,""));
      out.push(<ol key={i} className="md-ol">{items.map((t,j)=><li key={j}>{inline(t,j)}</li>)}</ol>); continue;
    }
    if (!line.trim()) { out.push(<div key={i} className="md-gap"/>); i++; continue; }
    out.push(<p key={i} className="md-p">{inline(line,i)}</p>); i++;
  }
  return <div className="md-root">{out}</div>;
}

// ── Error Boundary — catches crashes and shows error instead of blank screen ──
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error("App crash:", e, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          height:"100dvh",background:"#09100d",color:"#cce0db",fontFamily:"sans-serif",padding:"24px",gap:"16px",textAlign:"center"}}>
          <div style={{fontSize:"2rem"}}>⚠️</div>
          <div style={{fontSize:"1rem",color:"#c05050"}}>Something went wrong</div>
          <pre style={{fontSize:".7rem",color:"#6b9690",maxWidth:"600px",overflow:"auto",textAlign:"left",
            background:"rgba(255,255,255,.04)",padding:"12px",borderRadius:"8px",whiteSpace:"pre-wrap"}}>
            {this.state.error?.message}
          </pre>
          <button onClick={()=>window.location.reload()}
            style={{padding:"8px 20px",background:"rgba(184,146,46,.1)",border:"1px solid rgba(184,146,46,.2)",
            borderRadius:"20px",color:"#cda53a",cursor:"pointer",fontFamily:"sans-serif"}}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
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
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-orb-wrap">
          <YantraSmall />
          <div className="ring1"/><div className="ring2"/>
          <div className="orb" style={{cursor:"default"}}><ChakraSVG size={32} op=".78"/></div>
        </div>
        <div style={{textAlign:"center"}}>
          <div className="sb-name" style={{fontSize:"1.1rem"}}>Gyana AI</div>
          <div className="brand-tag-login">ज्ञानं परमं बलम् · Knowledge · Wisdom</div>
        </div>
        <p className="login-sub">Friend · Guru · Assistant · Guide<br/>Sign in to begin.</p>
        <button className="google-btn" onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          {loading ? "Signing in…" : "Continue with Google"}
        </button>
        {error && <p style={{color:"#c05050",fontSize:".75rem",textAlign:"center"}}>{error}</p>}
      </div>
    </div>
  );
}

// ── Text cleaner for TTS — strips ALL markdown and punctuation clutter ────────
function cleanForSpeech(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")       // bold
    .replace(/\*(.*?)\*/g, "$1")            // italic
    .replace(/`{1,3}(.*?)`{1,3}/gs, "$1")  // code
    .replace(/#{1,6}\s+/g, "")             // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/\n{2,}/g, ". ")              // double newlines → pause
    .replace(/\n/g, " ")                   // single newlines → space
    .replace(/[_~>|]/g, "")               // other markdown chars
    .replace(/\s{2,}/g, " ")              // multiple spaces
    .trim()
    .slice(0, 480);
}

// ── Guru Mode Overlay ─────────────────────────────────────────────────────────
function GuruMode({ user, onClose }) {
  const [phase,    setPhase]    = useState("idle");
  const [response, setResponse] = useState("");
  const [hintSeen, setHintSeen] = useState(false);
  const [error,    setError]    = useState("");

  // Use ref for history so sendToAI always has latest value without stale closure
  const historyRef   = useRef([]);
  const recRef       = useRef(null);
  const silenceTimer = useRef(null);
  const audioRef     = useRef(null);
  const analyserRef  = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef    = useRef(null);
  const streamRef    = useRef(null);
  const ctxRef       = useRef(null);
  const orbInnerRef  = useRef(null);
  const orbIconRef   = useRef(null);
  const wakeOnRef    = useRef(false);
  const phaseRef     = useRef("idle");

  const updatePhase = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
    if (p !== "idle") setHintSeen(true);

    const inner = orbInnerRef.current;
    const ico   = orbIconRef.current;
    if (!inner) return;

    const styles = {
      idle:      ["linear-gradient(145deg,#1a6a60 0%,#080f0c 100%)", "0 0 0 1px rgba(184,146,46,.13),0 8px 28px rgba(0,0,0,.55),0 0 36px rgba(30,138,124,.1)",  "scale(1)"],
      listening: ["linear-gradient(145deg,#1a8c7e 0%,#081410 100%)", "0 0 0 1px rgba(30,138,124,.22),0 8px 28px rgba(0,0,0,.55),0 0 50px rgba(30,138,124,.2)", "scale(1.04)"],
      thinking:  ["linear-gradient(145deg,#6a5018 0%,#080f0c 100%)",  "0 0 0 1px rgba(184,146,46,.18),0 8px 28px rgba(0,0,0,.55),0 0 40px rgba(184,146,46,.1)","scale(1)"],
      speaking:  ["linear-gradient(145deg,#1a7870 0%,#080f0c 100%)", "0 0 0 1px rgba(30,138,124,.18),0 8px 28px rgba(0,0,0,.55),0 0 44px rgba(30,138,124,.14)","scale(1.02)"],
    };
    const [bg, shadow, transform] = styles[p] || styles.idle;
    inner.style.background = bg;
    inner.style.boxShadow  = shadow;
    inner.style.transform  = transform;
    inner.style.transition = "all .5s ease";

    if (ico) {
      if (p === "listening" || p === "speaking") {
        ico.innerHTML = '<line x1="4" y1="12" x2="4" y2="12"/><line x1="8" y1="8" x2="8" y2="16"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="16" y1="8" x2="16" y2="16"/><line x1="20" y1="12" x2="20" y2="12"/>';
        ico.setAttribute("stroke-width", "1.8");
      } else {
        ico.innerHTML = '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>';
        ico.setAttribute("stroke-width", "1.4");
      }
      ico.style.stroke = p === "idle" ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.82)";
    }
  }, []);

  const drawVisualiser = useCallback(() => {
    const canvas = canvasRef.current, analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, W, H);
      const bars = 44, bw = W / bars;
      for (let i = 0; i < bars; i++) {
        const val = data[Math.floor(i * data.length / bars)] / 255;
        const h   = val * H * 0.82 + 2;
        const grad = ctx.createLinearGradient(0, (H-h)/2, 0, (H+h)/2);
        grad.addColorStop(0, `rgba(184,146,46,${0.25 + val * 0.6})`);
        grad.addColorStop(1, `rgba(30,138,124,${0.25 + val * 0.6})`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.roundRect(i*bw+1, (H-h)/2, bw-2, h, 1.5); ctx.fill();
      }
    };
    draw();
  }, []);
  const stopVisualiser = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
  }, []);

  // ── ElevenLabs speak — always use multilingual_v2 for best quality ──────────
  const speakText = useCallback(async (text) => {
    updatePhase("speaking");
    const clean = cleanForSpeech(text);

    if (ELEVEN_API_KEY && ELEVEN_VOICE_ID) {
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
          {
            method: "POST",
            headers: { "xi-api-key": ELEVEN_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              text: clean,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.85,
                style: 0.2,
                use_speaker_boost: true,
              },
            }),
          }
        );
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`ElevenLabs ${res.status}: ${errText}`);
        }
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
        audioRef.current = new Audio(url);
        audioRef.current.onended = () => { updatePhase("idle"); URL.revokeObjectURL(url); };
        audioRef.current.onerror = (e) => { console.error("Audio error", e); updatePhase("idle"); };
        await audioRef.current.play();
        return;
      } catch (err) {
        console.warn("ElevenLabs error:", err.message);
        setError(`Voice error: ${err.message}`);
      }
    }

    // Browser TTS fallback — English only, decent quality
    const hasNonLatin = /[^\u0000-\u024F]/.test(clean);
    const toSpeak = hasNonLatin
      ? "I heard you. Add your ElevenLabs key for multilingual voice."
      : clean;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(toSpeak);
    utt.rate = 0.9; utt.pitch = 1.0; utt.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith("en") &&
      (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha"))
    ) || voices.find(v => v.lang.startsWith("en"));
    if (v) utt.voice = v;
    utt.onend = utt.onerror = () => updatePhase("idle");
    window.speechSynthesis.speak(utt);
  }, [updatePhase]);

  // ── Send to AI — uses ref for history so no stale closure ──────────────────
  const sendToAI = useCallback(async (transcript) => {
    if (!transcript.trim()) { updatePhase("idle"); return; }
    setResponse(""); setError("");
    updatePhase("thinking");

    // Build history from ref — always fresh
    const newHistory = [...historyRef.current, { role: "user", content: transcript }];
    historyRef.current = newHistory;

    try {
      let answer = "";
      if (GROQ_KEY) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: GURU_PROMPT },
              ...newHistory.slice(-12),
            ],
            temperature: 0.75,
            max_tokens: 200,
          }),
        });
        if (!res.ok) throw new Error(`Groq ${res.status}`);
        const data = await res.json();
        answer = data.choices?.[0]?.message?.content?.trim() || "Could you say that again?";
      } else {
        const { data } = await axios.post(`${API}/ask-general`, {
          question: transcript,
          user_id: user?.uid || "default",
        });
        answer = data.answer || "Could you say that again?";
      }

      // Add assistant reply to history ref
      historyRef.current = [...newHistory, { role: "assistant", content: answer }];
      setResponse(answer);
      await speakText(answer);
    } catch (err) {
      console.error("AI error:", err);
      setError("Connection issue. Please try again.");
      updatePhase("idle");
    }
  }, [speakText, updatePhase, user]);

  // ── Start listening — mobile-safe MediaRecorder ─────────────────────────────
  const startListening = useCallback(async () => {
    if (phaseRef.current === "speaking") {
      audioRef.current?.pause();
      window.speechSynthesis.cancel();
      updatePhase("idle");
      return;
    }
    if (phaseRef.current !== "idle") return;
    setError(""); setResponse("");
    updatePhase("listening");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      ctxRef.current  = audioCtx;
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
      src.connect(analyser); analyserRef.current = analyser;
      drawVisualiser();

      // Mobile-safe mime type — iOS doesn't support webm
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const mrOptions = mime ? { mimeType: mime } : {};
      const mr = new MediaRecorder(stream, mrOptions);
      recRef.current = mr;
      const chunks = [];
      mr.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data); };

      mr.onstop = async () => {
        stopVisualiser();
        stream.getTracks().forEach(t => t.stop());
        try { audioCtx.close(); } catch (_) {}
        updatePhase("thinking");

        const blobType = mime || "audio/webm";
        const blob = new Blob(chunks, { type: blobType });
        const form = new FormData();
        form.append("file", blob, mime?.includes("mp4") ? "guru.mp4" : "guru.webm");

        try {
          const { data } = await axios.post(`${API}/transcribe`, form, {
            headers: { "x-user-id": user?.uid || "default" },
          });
          const transcript = data.text || data.transcription || "";
          if (!transcript.trim()) { updatePhase("idle"); return; }
          await sendToAI(transcript);
        } catch (err) {
          console.error("Transcription error:", err);
          setError("Could not transcribe. Please try again.");
          updatePhase("idle");
        }
      };

      mr.start(200);

      // Silence detection — stops after 2.5s of quiet
      const sa = audioCtx.createAnalyser(); sa.fftSize = 512; src.connect(sa);
      const sd = new Uint8Array(sa.frequencyBinCount);
      let silenceStart = null;
      const check = () => {
        if (!recRef.current || recRef.current.state === "inactive") return;
        sa.getByteFrequencyData(sd);
        const avg = sd.reduce((a, b) => a + b, 0) / sd.length;
        if (avg < 8) {
          if (!silenceStart) silenceStart = Date.now();
          else if (Date.now() - silenceStart > 2500) { mr.stop(); return; }
        } else {
          silenceStart = null;
        }
        silenceTimer.current = setTimeout(check, 100);
      };
      setTimeout(check, 1000);

    } catch (e) {
      if (e.name === "NotAllowedError") {
        setError("Microphone access denied. Please allow microphone.");
      } else {
        setError(`Microphone error: ${e.message}`);
      }
      updatePhase("idle");
    }
  }, [drawVisualiser, stopVisualiser, sendToAI, updatePhase, user]);

  // Wake word inside Guru Mode
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true; rec.lang = "en-IN"; rec.interimResults = true;
    wakeOnRef.current = true;
    rec.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("").toLowerCase();
      if ((t.includes("hey guru") || t.includes("hae guru")) && phaseRef.current === "idle") {
        startListening();
      }
    };
    rec.onerror = () => {};
    rec.onend = () => {
      if (wakeOnRef.current) setTimeout(() => { try { rec.start(); } catch (_) {} }, 400);
    };
    try { rec.start(); } catch (_) {}
    return () => { wakeOnRef.current = false; try { rec.stop(); } catch (_) {} };
  }, [startListening]);

  // Cleanup on unmount
  useEffect(() => () => {
    wakeOnRef.current = false;
    window.speechSynthesis?.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    stopVisualiser();
    clearTimeout(silenceTimer.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    try { ctxRef.current?.close(); } catch (_) {}
  }, [stopVisualiser]);

  const phaseLabel = { idle: "", listening: "Listening", thinking: "Processing", speaking: "Speaking" }[phase];

  return (
    <div className="guru-overlay">
      <button className="gcls" onClick={onClose}><CloseSVG /></button>
      <div className="g-label">Guru Mode</div>

      <div className="gorb-wrap">
        <YantraLarge />
        <div className="g-r1" /><div className="g-r2" />
        <div className="g-glow-ring" />
        <div className="gorb" onClick={startListening}>
          <div className="gorb-inner" ref={orbInnerRef}>
            <svg ref={orbIconRef} width="36" height="36" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,.6)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8"  y1="22" x2="16" y2="22"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Visualiser — shown only when listening */}
      <canvas ref={canvasRef} className="gcanvas" width={220} height={36}
        style={{ opacity: phase === "listening" ? 1 : 0 }} />

      {/* Status label */}
      {phase !== "idle" && (
        <div className="g-status show">{phaseLabel}</div>
      )}

      {/* Hint — shown until first use */}
      {!hintSeen && (
        <div className="g-hint">Say <em>hey guru</em> — or tap the orb</div>
      )}

      {/* Response card — only shown after reply */}
      {response && (
        <div className="g-card show">
          <span className="g-card-lbl">Gyana AI</span>
          <span className="g-card-txt">{response}</span>
        </div>
      )}

      {error && <p className="g-error">{error}</p>}

      <div className="g-foot">
        {phase === "speaking"
          ? "Tap to interrupt"
          : phase === "idle"
          ? "Tap the orb to speak · Pauses automatically"
          : ""}
      </div>
    </div>
  );
}

// =============================================================================
//  MAIN APP
// =============================================================================
function AppInner() {
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

  const feedRef        = useRef(null);
  const fileRef        = useRef(null);
  const taRef          = useRef(null);
  const bottomRef      = useRef(null);
  const recRef         = useRef(null);
  const micTmr         = useRef(null);
  const abortRef       = useRef(null);
  const currentConvRef = useRef(null);
  const wakeOnRef      = useRef(false);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u??null); if(u) setConversations(loadConversations(u.uid)); });
    return unsub;
  }, []);

  // Global wake word
  useEffect(() => {
    if (!user||guruOpen) return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return;
    const rec=new SR(); rec.continuous=true; rec.lang="en-IN"; rec.interimResults=true;
    wakeOnRef.current=true;
    rec.onresult=e=>{
      const t=Array.from(e.results).map(r=>r[0].transcript).join("").toLowerCase();
      if(t.includes("hey guru")||t.includes("hae guru")){rec.stop();setGuruOpen(true);}
    };
    rec.onerror=()=>{};
    rec.onend=()=>{if(wakeOnRef.current)setTimeout(()=>{try{rec.start()}catch(_){}},400);};
    try{rec.start()}catch(_){}
    return ()=>{wakeOnRef.current=false;try{rec.stop()}catch(_){}};
  },[user,guruOpen]);

  const readyDocs   = docs.filter(d=>d.status==="ready");
  const authHeaders = useCallback(()=>({"x-user-id":user?.uid||"default"}),[user]);

  // Scroll to bottom when messages update — never fires on empty/welcome screen
  useEffect(() => {
    if (msgs.length === 0) return;
    requestAnimationFrame(() => {
      if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    });
  }, [msgs]);
  useEffect(()=>{const ta=taRef.current;if(!ta)return;ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,140)+"px";},[input]);
  useEffect(()=>{
    if(!sidebarOpen) return;
    const h=e=>{if(!e.target.closest(".sidebar"))setSidebarOpen(false);};
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[sidebarOpen]);

  const notify = useCallback((msg,type="ok")=>{setToast({msg,type});setTimeout(()=>setToast(null),3000);},[]);
  const pushMsg  = m   => setMsgs(p=>[...p,{id:uid(),...m}]);
  const patchMsg = (id,u) => setMsgs(p=>p.map(m=>m.id===id?(typeof u==="function"?{...m,...u(m)}:{...m,...u}):m));

  const saveCurrentConversation = useCallback((messages,convId)=>{
    if(!user||messages.length===0) return;
    const convs=loadConversations(user.uid);
    const idx=convs.findIndex(c=>c.id===convId);
    const conv={id:convId,title:messages[0]?.text?.slice(0,40)||"Conversation",messages,date:dateStr(),timestamp:Date.now(),mode};
    if(idx>=0)convs[idx]=conv;else convs.unshift(conv);
    const trimmed=convs.slice(0,50);
    saveConversations(user.uid,trimmed); setConversations(trimmed);
  },[user,mode]);

  const loadConversation = conv=>{setMsgs(conv.messages);setActiveConvId(conv.id);currentConvRef.current=conv.id;setMode(conv.mode||"docs");setSidebarOpen(false);};
  const deleteConversation=(convId,e)=>{
    e.stopPropagation();
    const convs=loadConversations(user.uid).filter(c=>c.id!==convId);
    saveConversations(user.uid,convs);setConversations(convs);
    if(activeConvId===convId){setMsgs([]);setActiveConvId(null);currentConvRef.current=null;}
  };
  const startNewConversation=()=>{
    if(msgs.length>0&&currentConvRef.current) saveCurrentConversation(msgs,currentConvRef.current);
    setMsgs([]);setInput("");setActiveConvId(null);currentConvRef.current=null;setSidebarOpen(false);
  };
  useEffect(()=>{
    const last=msgs[msgs.length-1];
    if(last?.role==="ai"&&!last?.streaming&&currentConvRef.current&&user) saveCurrentConversation(msgs,currentConvRef.current);
  },[msgs,user,saveCurrentConversation]);

  // TTS
  const stopSpeaking=useCallback(()=>{window.speechSynthesis?.cancel();setSpeaking(null);},[]);
  const speakMsg = useCallback(async (id, text) => {
    if (speaking === id) { stopSpeaking(); return; }
    window.speechSynthesis?.cancel();
    const clean = cleanForSpeech(text);

    if (ELEVEN_API_KEY && ELEVEN_VOICE_ID) {
      setSpeaking(id);
      try {
        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`,
          {
            method: "POST",
            headers: { "xi-api-key": ELEVEN_API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({
              text: clean,
              model_id: "eleven_multilingual_v2",
              voice_settings: { stability: 0.5, similarity_boost: 0.85, style: 0.2, use_speaker_boost: true },
            }),
          }
        );
        if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
        const blob = await res.blob(), url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { setSpeaking(null); URL.revokeObjectURL(url); };
        audio.onerror = () => setSpeaking(null);
        await audio.play(); return;
      } catch (err) {
        console.warn("speakMsg ElevenLabs error:", err.message);
        setSpeaking(null);
      }
    }

    // Browser TTS fallback
    const hasNonLatin = /[^\u0000-\u024F]/.test(clean);
    const toSpeak = hasNonLatin ? "Add your ElevenLabs key for multilingual voice." : clean;
    const utt = new SpeechSynthesisUtterance(toSpeak);
    utt.rate = 0.9; utt.lang = "en-US";
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith("en") &&
      (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha"))
    ) || voices.find(v => v.lang.startsWith("en"));
    if (v) utt.voice = v;
    utt.onstart = () => setSpeaking(id);
    utt.onend = utt.onerror = () => setSpeaking(null);
    window.speechSynthesis.speak(utt);
  }, [speaking, stopSpeaking]);
  useEffect(()=>{
    const last=msgs[msgs.length-1];
    if(autoSpeak&&last?.role==="ai"&&!last?.streaming&&last?.text&&!last?.error) speakMsg(last.id,last.text);
  },[msgs,autoSpeak,speakMsg]);

  // File upload
  const handleFiles=useCallback(async(files)=>{
    for(const file of Array.from(files)){
      const id=uid();
      setDocs(p=>[...p,{id,name:file.name,size:fileSz(file.size),status:"uploading",progress:0}]);
      try{
        const form=new FormData();form.append("file",file);
        const{data}=await axios.post(`${API}/upload`,form,{headers:authHeaders(),onUploadProgress:e=>{if(e.total)setDocs(p=>p.map(d=>d.id===id?{...d,progress:Math.round(e.loaded*100/e.total)}:d));}});
        setDocs(p=>p.map(d=>d.id===id?{...d,status:"ready",progress:100,lang:data.detected_language,chunks:data.chunks_created}:d));
        notify(`✓ ${file.name} — ${data.chunks_created} chunks indexed`);
      }catch(e){setDocs(p=>p.map(d=>d.id===id?{...d,status:"error"}:d));notify(e.response?.data?.detail||e.message,"err");}
    }
  },[notify,authHeaders]);
  const onDrop=useCallback(e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files);},[handleFiles]);
  const clearDocs=async()=>{try{await axios.delete(`${API}/documents`,{headers:authHeaders()});setDocs([]);notify("Knowledge base cleared");}catch(e){notify(e.response?.data?.detail||e.message,"err");}};

  // General AI stream
  const askGeneralAI=async(question,aiId)=>{
    const userId=user?.uid||"default";let got=false;
    try{
      const res=await fetch(`${API}/ask-general/stream`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question,user_id:userId})});
      if(!res.ok)throw new Error();
      const reader=res.body.getReader(),dec=new TextDecoder();
      while(true){
        const{done,value}=await reader.read();if(done)break;
        for(const line of dec.decode(value,{stream:true}).split("\n")){
          if(!line.startsWith("data: "))continue;
          const token=line.slice(6);
          if(token==="[DONE]"){patchMsg(aiId,{streaming:false});setLoading(false);return;}
          if(token.startsWith("[ERROR]")){patchMsg(aiId,{streaming:false,error:true});setLoading(false);return;}
          got=true;patchMsg(aiId,m=>({text:(m.text||"")+token.replace(/\\n/g,"\n")}));
        }
      }
    }catch(_){}
    if(!got){
      try{const{data}=await axios.post(`${API}/ask-general`,{question,user_id:userId});patchMsg(aiId,{text:data.answer,sources:[],streaming:false});}
      catch{patchMsg(aiId,{text:"Connection error.",error:true,streaming:false});}
    }
    setLoading(false);
  };

  // Send
  const send=useCallback(async(override)=>{
    const q=(override??input).trim();
    if(!q||loading)return;
    if(mode==="docs"&&!readyDocs.length){notify("Upload a document first, or switch to AI mode","err");return;}
    if(!currentConvRef.current){const newId=uid();currentConvRef.current=newId;setActiveConvId(newId);}
    pushMsg({role:"user",text:q,time:timeNow()});
    setInput("");setLoading(true);
    const aiId=uid();
    pushMsg({id:aiId,role:"ai",text:"",time:timeNow(),sources:[],streaming:true,error:false});
    if(mode==="ai"){await askGeneralAI(q,aiId);return;}
    const userId=user?.uid||"default";let gotStream=false;
    const fallback=setTimeout(async()=>{
      if(gotStream)return;abortRef.current?.();
      try{const{data}=await axios.post(`${API}/ask`,{question:q,user_id:userId});patchMsg(aiId,{text:data.answer,sources:data.sources??[],streaming:false});}
      catch(e){patchMsg(aiId,{text:e.response?.data?.detail||e.message,error:true,streaming:false});}
      finally{setLoading(false);}
    },4000);
    let aborted=false;abortRef.current=()=>{aborted=true;};
    try{
      const res=await fetch(`${API}/ask/stream`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:q,user_id:userId})});
      if(!res.ok)throw new Error();
      const reader=res.body.getReader(),dec=new TextDecoder();
      while(!aborted){
        const{done,value}=await reader.read();if(done)break;
        for(const line of dec.decode(value,{stream:true}).split("\n")){
          if(!line.startsWith("data: "))continue;
          const token=line.slice(6);
          if(token==="[DONE]"){clearTimeout(fallback);patchMsg(aiId,{streaming:false});setLoading(false);return;}
          if(token.startsWith("[ERROR]")){clearTimeout(fallback);patchMsg(aiId,{streaming:false,error:true});setLoading(false);return;}
          gotStream=true;patchMsg(aiId,m=>({text:(m.text||"")+token.replace(/\\n/g,"\n")}));
        }
      }
    }catch(_){}
  },[input,loading,readyDocs,notify,user,mode]);

  // Mic
  const startMic=useCallback(async()=>{
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=MediaRecorder.isTypeSupported("audio/webm;codecs=opus")?"audio/webm;codecs=opus":"audio/webm";
      const mr=new MediaRecorder(stream,{mimeType:mime});recRef.current=mr;const chunks=[];
      mr.ondataavailable=e=>e.data?.size>0&&chunks.push(e.data);
      mr.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());clearInterval(micTmr.current);setMicSec(0);setMicOn(false);
        const blob=new Blob(chunks,{type:mime}),form=new FormData();form.append("file",blob,"voice.webm");
        try{notify("Transcribing…","info");const{data}=await axios.post(`${API}/speech-query`,form,{headers:authHeaders()});pushMsg({role:"user",text:`🎤 ${data.transcribed_question}`,time:timeNow()});pushMsg({role:"ai",text:data.answer,time:timeNow(),sources:data.sources??[],streaming:false,error:false});}
        catch(e){notify(e.response?.data?.detail||e.message,"err");}
      };
      mr.start(200);setMicOn(true);setMicSec(0);micTmr.current=setInterval(()=>setMicSec(s=>s+1),1000);
    }catch(e){notify(e.name==="NotAllowedError"?"Microphone access denied":e.message,"err");}
  },[notify,authHeaders]);
  const stopMic=useCallback(()=>{recRef.current?.state!=="inactive"&&recRef.current?.stop();},[]);
  const fmtMic=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const copyMsg=(id,text)=>{navigator.clipboard.writeText(text).catch(()=>{});setCopied(id);setTimeout(()=>setCopied(null),1800);};
  const handleSignOut=async()=>{await signOut(auth);setDocs([]);setMsgs([]);setConversations([]);};

  if (user===undefined) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100dvh",background:"var(--bg)",color:"var(--g2)",fontSize:".82rem",letterSpacing:".15em",fontFamily:"var(--cap)"}}>Awakening Gyana AI…</div>;
  if (user===null) return <LoginPage/>;

  const suggestions = mode==="ai" ? AI_SUGGESTIONS : DOC_SUGGESTIONS;
  const placeholder = micOn?"Recording…":mode==="ai"?"Ask your guru anything…":readyDocs.length===0?"Upload a document to begin…":"Ask anything about your documents…";

  return (
    <>
      {guruOpen && <GuruMode user={user} onClose={()=>setGuruOpen(false)}/>}

      <div className="shell">
        <div className={`sidebar-overlay${sidebarOpen?" open":""}`} onClick={()=>setSidebarOpen(false)}/>

        {/* ── Sidebar ── */}
        <aside className={`sidebar${sidebarOpen?" open":""}`}>
          <div className="sb-sheen"/>

          <div className="sb-brand">
            <div className="sb-icon"><ChakraSVG size={18}/></div>
            <div>
              <div className="sb-name">Gyana AI</div>
              <div className="sb-tagline">Knowledge · Wisdom</div>
            </div>
            <button className="sb-close-btn" onClick={()=>setSidebarOpen(false)}><CloseSVG/></button>
          </div>

          <div className="user-row">
            {user.photoURL&&<img src={user.photoURL} alt="" width={22} height={22} style={{borderRadius:"50%",flexShrink:0}}/>}
            <span className="uname">{user.displayName||user.email}</span>
            <button className="out-btn" onClick={handleSignOut} title="Sign out">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>

          <button className="new-btn" onClick={startNewConversation}><PlusSVG/> New conversation</button>

          <div className="sb-tabs">
            {["docs","history"].map(tab=>(
              <button key={tab} className={`sb-tab${sidebarTab===tab?" on":""}`} onClick={()=>setSidebarTab(tab)}>
                {tab==="docs"?"Documents":"History"}
              </button>
            ))}
          </div>

          {sidebarTab==="docs"&&(<>
            <p className="sb-label">Knowledge Base</p>
            <div className={`dz${drag?" dz-over":""}`} role="button" tabIndex={0}
              onClick={()=>fileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setDrag(true);}}
              onDragLeave={()=>setDrag(false)} onDrop={onDrop}
              onKeyDown={e=>e.key==="Enter"&&fileRef.current?.click()}>
              <div className="dz-ring"><UploadSVG/></div>
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
            {readyDocs.length>0&&<button className="clear-btn" onClick={clearDocs}>Remove all documents</button>}
          </>)}

          {sidebarTab==="history"&&(<>
            <p className="sb-label">Chat History</p>
            <div className="conv-list">
              {conversations.length===0
                ?<div className="conv-empty">No conversations yet.</div>
                :conversations.map(conv=>(
                  <div key={conv.id} className={`conv-item${activeConvId===conv.id?" active":""}`} onClick={()=>loadConversation(conv)}>
                    <div className="conv-ico">{conv.mode==="ai"?<ChatSVG/>:<DocSVG/>}</div>
                    <div className="conv-info">
                      <div className="conv-title">{conv.title}</div>
                      <div className="conv-meta">{conv.date} · {conv.messages.length} msgs</div>
                    </div>
                    <button className="conv-del" onClick={e=>deleteConversation(conv.id,e)}>✕</button>
                  </div>
                ))
              }
            </div>
          </>)}

          <div className="sb-spacer"/>
          <div className="sb-foot">
            <button className="guru-sb-btn" onClick={()=>setGuruOpen(true)}>
              <ChakraSVG size={13} op=".65"/> Guru Mode
            </button>
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
              <button className="menu-btn" onClick={()=>setSidebarOpen(true)}><MenuSVG/></button>
              <span className="tb-title">{mode==="ai"?"AI Assistant":"Query Interface"}</span>
              {mode==="docs"&&readyDocs.length>0&&(
                <div className="ctx-pill">
                  <span className="ctx-led"/>
                  <span className="ctx-txt">{readyDocs.slice(0,2).map(d=>d.name).join(" · ")}{readyDocs.length>2?` +${readyDocs.length-2} more`:""}</span>
                </div>
              )}
            </div>
            <div className="tb-right">
              <button className="guru-tb-btn" onClick={()=>setGuruOpen(true)}>
                <ChakraSVG size={11} op=".65"/> Guru Mode
              </button>
              <button className="top-btn" onClick={()=>{if(autoSpeak)stopSpeaking();setAutoSpeak(p=>!p);}}
                style={autoSpeak?{borderColor:"rgba(184,146,46,.3)",color:"var(--g2)",background:"rgba(184,146,46,.08)"}:{}}>
                {autoSpeak?"🔊":"🔇"}
              </button>
              <div className="mode-toggle">
                <button className={`mode-btn${mode==="docs"?" active":""}`} onClick={()=>setMode("docs")}><DocSVG/> Doc</button>
                <button className={`mode-btn${mode==="ai"?" active":""}`}   onClick={()=>setMode("ai")}><ChatSVG/> AI</button>
              </div>
              {msgs.length>0&&<button className="top-btn" onClick={startNewConversation}>Clear</button>}
            </div>
          </div>

          <div className="feed" ref={feedRef}>
            {/* Welcome screen */}
            <div className="welcome" style={{display:msgs.length===0?"flex":"none"}}>
              <div className="orb-wrap">
                <YantraSmall/>
                <div className="ring1"/><div className="ring2"/>
                <div className="orb" onClick={()=>setGuruOpen(true)}>
                  <ChakraSVG size={36} op=".78"/>
                </div>
              </div>
              <h1 className="wh">Hey <em>Guru</em></h1>
              <div className="wsub">Gyana AI · Knowledge System</div>
              <p className="wp">
                {mode==="ai"
                  ?"Your personal guru — friend, advisor, teacher, and companion."
                  :<>Upload documents and ask anything.<br/>Or say <span>"Hey Guru"</span> to activate live voice.</>}
              </p>
              <button className="guru-cta" onClick={()=>setGuruOpen(true)}>
                <ChakraSVG size={12} op=".65"/> Enter Guru Mode
              </button>
              {(mode==="ai"||readyDocs.length>0)&&(
                <div className="sug-grid">
                  {suggestions.map(s=>(
                    <button key={s.title} className="sug-card" onClick={()=>send(s.title)} disabled={loading}>
                      <span className="sug-t">{s.title}</span>
                      <span className="sug-d">{s.desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Messages */}
            {msgs.length>0&&(
              <div className="msgs">
                {msgs.map(msg=>msg.role==="user"?(
                  <div key={msg.id} className="turn">
                    <div className="h-row">
                      <div className="h-time">{msg.time}</div>
                      <div className="h-bub">{msg.text}</div>
                    </div>
                  </div>
                ):(
                  <div key={msg.id} className="turn">
                    <div className="a-row">
                      <div className="a-av"><ChakraSVG size={13} op=".9"/></div>
                      <div className="a-body">
                        <div className="a-meta"><span className="a-name">Gyana AI</span><span className="a-time">{msg.time}</span></div>
                        <div className={`a-text${msg.error?" a-err":""}`}>
                          {msg.text?<MD text={msg.text}/>:msg.streaming?<div className="typing"><span/><span/><span/></div>:null}
                          {msg.streaming&&msg.text&&<span className="cur"/>}
                        </div>
                        {!msg.streaming&&msg.sources?.length>0&&(
                          <div className="sources">
                            <span className="src-lbl">Sources —</span>
                            {msg.sources.map((s,i)=><span key={i} className="src-chip">{s}</span>)}
                          </div>
                        )}
                        {!msg.streaming&&!msg.error&&(
                          <div className="a-acts">
                            <button className="act-btn" onClick={()=>copyMsg(msg.id,msg.text)}>
                              {copied===msg.id?<><CheckSVG/> Copied</>:<><CopySVG/> Copy</>}
                            </button>
                            <button className="act-btn" onClick={()=>speakMsg(msg.id,msg.text)}
                              style={speaking===msg.id?{color:"var(--g2)",background:"rgba(184,146,46,.08)"}:{}}>
                              {speaking===msg.id?<><StopSVG/> Stop</>:<><SpeakSVG/> Listen</>}
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
                    {micOn?<span className="rec-row"><span className="rec-dot"/><span className="rec-t">{fmtMic(micSec)}</span></span>:<MicSVG/>}
                  </button>
                  {mode==="docs"&&<button className="tool-btn" onClick={()=>fileRef.current?.click()}><AttachSVG/></button>}
                  <button className="tool-btn" onClick={()=>setGuruOpen(true)} title="Guru Mode"><ChakraSVG size={13} op=".45"/></button>
                </div>
                <button className="send-btn" onClick={()=>send()} disabled={loading||!input.trim()||micOn}>
                  {loading?<span className="spin"/>:<SendSVG/>}
                </button>
              </div>
            </div>
            <p className="inp-hint">
              <span className="hw">say "hey guru"</span> to activate voice
              &nbsp;·&nbsp;<kbd>Enter</kbd> send&nbsp;·&nbsp;<kbd>Shift+Enter</kbd> new line
            </p>
          </div>
        </div>
      </div>

      {toast&&<div className={`toast toast-${toast.type}`}>{toast.type==="err"?"✕":toast.type==="info"?"◎":"✓"}&nbsp;{toast.msg}</div>}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}