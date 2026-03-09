// =============================================================================
//  Gyana AI  ·  App.jsx  —  with per-user document isolation
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

const API    = import.meta.env.VITE_API_URL || "https://gyana-ai.onrender.com";
const ACCEPT = ".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg,.mp3,.wav,.m4a,.webm";

const FILE_ICONS = {
  pdf:"📄", docx:"📝", pptx:"📊", txt:"📃",
  png:"🖼️", jpg:"🖼️", jpeg:"🖼️",
  mp3:"🎵", wav:"🎵", m4a:"🎵", webm:"🎤",
};

const SUGGESTIONS = [
  { title:"Summarise the main topics",   desc:"Get a clear overview of your document"      },
  { title:"List all key definitions",    desc:"Extract important terms and meanings"        },
  { title:"Create 5 quiz questions",     desc:"Test your understanding of the material"     },
  { title:"Explain the hardest concept", desc:"Break down complex ideas in simple language" },
];

const fileExt  = (n="") => n.split(".").pop()?.toLowerCase() ?? "";
const fileIcon = (n)    => FILE_ICONS[fileExt(n)] ?? "📁";
const fileSz   = (b)    => b < 1_048_576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1_048_576).toFixed(1)} MB`;
const timeNow  = ()     => new Date().toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
const uid      = ()     => crypto.randomUUID();

// ── Login Page ────────────────────────────────────────────────────────────────
function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const handleGoogle = async () => {
    setLoading(true); setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", height:"100vh", background:"#0a0a0a",
      color:"#fff", fontFamily:"system-ui, sans-serif" }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
        gap:"1rem", padding:"2.5rem", borderRadius:"16px",
        background:"#111", border:"1px solid #1f1f1f",
        boxShadow:"0 0 60px rgba(0,200,180,0.08)" }}>
        <div style={{ width:56, height:56, borderRadius:"50%",
          background:"linear-gradient(135deg,#0d9488,#0f766e)",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>🧠</div>
        <h1 style={{ margin:0, fontSize:"1.6rem", fontWeight:700, letterSpacing:"-0.5px" }}>Gyana AI</h1>
        <p style={{ margin:0, color:"#666", fontSize:"0.9rem" }}>Document Intelligence · Sign in to continue</p>
        <button onClick={handleGoogle} disabled={loading} style={{
          marginTop:"0.5rem", display:"flex", alignItems:"center", gap:"10px",
          background:"#fff", color:"#111", border:"none", padding:"11px 24px",
          borderRadius:"8px", fontSize:"0.95rem", fontWeight:600,
          cursor:loading?"not-allowed":"pointer", opacity:loading?0.7:1, transition:"opacity 0.2s" }}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          {loading ? "Signing in…" : "Continue with Google"}
        </button>
        {error && <p style={{ color:"#f87171", fontSize:"0.8rem", margin:0, maxWidth:260, textAlign:"center" }}>{error}</p>}
        <p style={{ color:"#333", fontSize:"0.75rem", margin:0, marginTop:"0.5rem" }}>Your documents stay private to your account</p>
      </div>
    </div>
  );
}

// ── Markdown ──────────────────────────────────────────────────────────────────
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

// =============================================================================
export default function App() {
  const [user,    setUser]    = useState(undefined);
  const [docs,    setDocs]    = useState([]);
  const [msgs,    setMsgs]    = useState([]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [drag,    setDrag]    = useState(false);
  const [micOn,   setMicOn]   = useState(false);
  const [micSec,  setMicSec]  = useState(0);
  const [toast,   setToast]   = useState(null);
  const [copied,  setCopied]  = useState(null);

  const fileRef   = useRef(null);
  const taRef     = useRef(null);
  const bottomRef = useRef(null);
  const recRef    = useRef(null);
  const micTmr    = useRef(null);
  const abortRef  = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u ?? null));
    return unsub;
  }, []);

  const readyDocs = docs.filter(d => d.status === "ready");

  // Helper to get auth headers with user ID
  const authHeaders = () => ({ "x-user-id": user?.uid || "default" });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs]);
  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  const notify = useCallback((msg, type="ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }, []);

  const pushMsg  = (m)       => setMsgs(p => [...p, { id: uid(), ...m }]);
  const patchMsg = (id, upd) => setMsgs(p =>
    p.map(m => m.id === id ? (typeof upd==="function" ? {...m,...upd(m)} : {...m,...upd}) : m)
  );

  const handleFiles = useCallback(async (files) => {
    for (const file of Array.from(files)) {
      const id = uid();
      setDocs(p => [...p, { id, name:file.name, size:fileSz(file.size), status:"uploading", progress:0, lang:null, chunks:0 }]);
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
    try {
      await axios.delete(`${API}/documents`, { headers: authHeaders() });
      setDocs([]); setMsgs([]); notify("Knowledge base cleared");
    } catch (e) { notify(e.response?.data?.detail || e.message, "err"); }
  };

  const send = useCallback(async (override) => {
    const q = (override ?? input).trim();
    if (!q || loading) return;
    if (!readyDocs.length) { notify("Upload a document first", "err"); return; }

    pushMsg({ role:"user", text:q, time:timeNow() });
    setInput(""); setLoading(true);

    const aiId = uid();
    pushMsg({ id:aiId, role:"ai", text:"", time:timeNow(), sources:[], streaming:true, error:false });

    const userId = user?.uid || "default";

    let gotStream = false;
    const fallback = setTimeout(async () => {
      if (gotStream) return;
      abortRef.current?.();
      try {
        const { data } = await axios.post(`${API}/ask`, { question: q, user_id: userId });
        patchMsg(aiId, { text:data.answer, sources:data.sources??[], streaming:false });
      } catch (e) {
        patchMsg(aiId, { text: e.response?.data?.detail||e.message, error:true, streaming:false });
        notify(e.response?.data?.detail||e.message, "err");
      } finally { setLoading(false); }
    }, 4000);

    let aborted = false; abortRef.current = () => { aborted = true; };
    try {
      const res = await fetch(`${API}/ask/stream`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ question: q, user_id: userId }),
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
          patchMsg(aiId, m => ({ text:(m.text??"")+token.replace(/\\n/g,"\n") }));
        }
      }
    } catch (_) {}
  }, [input, loading, readyDocs, notify, user]);

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
          const { data } = await axios.post(`${API}/speech-query`, form, { headers: authHeaders() });
          pushMsg({ role:"user", text:`🎤 ${data.transcribed_question}`, time:timeNow() });
          pushMsg({ role:"ai",   text:data.answer, time:timeNow(), sources:data.sources??[], streaming:false, error:false });
        } catch (e) { notify(e.response?.data?.detail||e.message,"err"); }
      };
      mr.start(200); setMicOn(true); setMicSec(0);
      micTmr.current = setInterval(()=>setMicSec(s=>s+1),1000);
    } catch (e) { notify(e.name==="NotAllowedError"?"Microphone access denied":e.message,"err"); }
  }, [notify, user]);

  const stopMic  = useCallback(()=>{ recRef.current?.state!=="inactive" && recRef.current?.stop(); },[]);
  const fmtMic   = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const copyMsg  = (id, text) => { navigator.clipboard.writeText(text).catch(()=>{}); setCopied(id); setTimeout(()=>setCopied(null),1800); };
  const handleSignOut = async () => { await signOut(auth); setDocs([]); setMsgs([]); };

  if (user === undefined) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:"#0a0a0a", color:"#555", fontSize:"0.9rem" }}>Loading…</div>
  );
  if (user === null) return <LoginPage />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sb-sheen"/>
        <div className="sb-brand">
          <div className="sb-icon"><BrainSvg/></div>
          <div>
            <div className="sb-name">Gyana AI</div>
            <div className="sb-tagline">Document Intelligence</div>
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:"8px",
          padding:"8px 12px", borderRadius:"8px", background:"#111",
          border:"1px solid #1a1a1a", margin:"0 0 10px 0" }}>
          {user.photoURL && <img src={user.photoURL} alt="" width={24} height={24} style={{borderRadius:"50%"}}/>}
          <span style={{ fontSize:"0.75rem", color:"#aaa", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {user.displayName || user.email}
          </span>
          <button onClick={handleSignOut} style={{ background:"none", border:"none", color:"#555",
            cursor:"pointer", fontSize:"0.7rem", padding:"2px 6px", borderRadius:"4px" }} title="Sign out">↩</button>
        </div>

        <button className="new-btn" onClick={()=>{setMsgs([]); setInput("");}}>
          <PlusSvg/> New conversation
        </button>

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

        <div className="sb-spacer"/>
        <div className="sb-foot">
          <div className="model-pill">
            <div className="model-led"/>
            <div><div className="model-name">llama3-70b-8192</div><div className="model-sub">Groq · Supabase · MiniLM-L6</div></div>
          </div>
          <p className="doc-count">{readyDocs.length===0?"No documents indexed":`${readyDocs.length} document${readyDocs.length>1?"s":""} in context`}</p>
        </div>
      </aside>

      <div className="main">
        <div className="glow g1"/><div className="glow g2"/>
        <div className="topbar">
          <div className="tb-left">
            <span className="tb-title">Query Interface</span>
            {readyDocs.length>0&&(
              <div className="ctx-pill"><span className="ctx-led"/><span className="ctx-txt">{readyDocs.slice(0,2).map(d=>d.name).join(" · ")}{readyDocs.length>2?` +${readyDocs.length-2} more`:""}</span></div>
            )}
          </div>
          {msgs.length>0&&<button className="top-btn" onClick={()=>{setMsgs([]);notify("Chat cleared");}}>Clear chat</button>}
        </div>

        <div className="feed">
          {msgs.length===0 ? (
            <div className="welcome">
              <div className="w-orb"><BrainSvg size={34}/></div>
              <h2 className="w-h">How can I help you today?</h2>
              <p className="w-p">Upload your documents and ask anything.<br/>Every answer comes strictly from your files.</p>
              {readyDocs.length>0&&(
                <div className="sug-grid">
                  {SUGGESTIONS.map(s=>(
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
                    <div className="a-av"><BrainSvg size={14}/></div>
                    <div className="a-body">
                      <div className="a-meta"><span className="a-name">Gyana AI</span><span className="a-time">{msg.time}</span></div>
                      <div className={`a-text${msg.error?" a-err":""}`}>
                        {msg.text ? <MD text={msg.text}/> : msg.streaming ? <div className="typing"><span/><span/><span/></div> : null}
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
            <textarea ref={taRef} value={input} rows={1}
              placeholder={micOn?"Recording — speak your question…":readyDocs.length===0?"Upload a document to start…":"Ask anything about your documents…"}
              disabled={loading||micOn}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
            />
            <div className="inp-bar">
              <div className="inp-tools">
                <button className={`tool-btn${micOn?" mic-on":""}`} onClick={micOn?stopMic:startMic}>
                  {micOn?<span className="rec-row"><span className="rec-dot"/><span className="rec-t">{fmtMic(micSec)}</span></span>:<MicSvg/>}
                </button>
                <button className="tool-btn" onClick={()=>fileRef.current?.click()}><AttachSvg/></button>
              </div>
              <button className="send-btn" onClick={()=>send()} disabled={loading||!input.trim()||micOn}>
                {loading?<span className="spin"/>:<UpSvg/>}
              </button>
            </div>
          </div>
          <p className="inp-hint">Gyana AI answers only from your uploaded documents &nbsp;·&nbsp;<kbd>Enter</kbd> to send &nbsp;·&nbsp;<kbd>Shift+Enter</kbd> new line</p>
        </div>
      </div>

      {toast&&<div className={`toast toast-${toast.type}`}>{toast.type==="err"?"✕":toast.type==="info"?"◎":"✓"}&nbsp;{toast.msg}</div>}
    </div>
  );
}

const BrainSvg   = ({size=18}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.07-3 2.5 2.5 0 0 1 .98-4.76V9a2.5 2.5 0 0 1 2.5-2.5zm5 0A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.07-3 2.5 2.5 0 0 0-.98-4.76V9a2.5 2.5 0 0 0-2.5-2.5z"/></svg>;
const PlusSvg    = ()          => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const MicSvg     = ()          => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8"/></svg>;
const AttachSvg  = ()          => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
const UpSvg      = ()          => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
const CopySvg    = ()          => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const CheckSvg   = ()          => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>;