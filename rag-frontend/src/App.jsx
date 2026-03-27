import React, { useEffect, useMemo, useRef, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import {
  askOnce,
  clearDocuments,
  clearMemory,
  fetchCapabilities,
  fetchDocumentStats,
  streamAssistant,
  toErrorMessage,
  transcribeAudio,
  uploadDocument,
} from "./api";

const CHAT_STORAGE_KEY = "gyana.workspace.sessions";
const ACCEPTED_FILES = ".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg,.mp3,.wav,.m4a,.webm";

const QUICK_ACTIONS = [
  "Summarize my uploaded documents.",
  "Turn the current context into a study plan.",
  "Search the latest updates on this topic.",
  "Generate an image concept for my project.",
];

const FEATURE_TILES = [
  {
    title: "Deep Research",
    body: "General chat, current web queries, and structured answers in one flow.",
  },
  {
    title: "Document Brain",
    body: "Upload notes, decks, PDFs, and text files to build a searchable knowledge base.",
  },
  {
    title: "Voice Input",
    body: "Record a question and let the workspace transcribe and answer it instantly.",
  },
];

const MODE_META = {
  auto: {
    label: "Auto",
    tagline: "Best of both worlds",
    description: "Uses your documents when helpful, then falls back to the broader agent.",
  },
  docs: {
    label: "Docs",
    tagline: "RAG-first",
    description: "Prioritizes your uploaded knowledge base for grounded answers.",
  },
  general: {
    label: "General",
    tagline: "Open-world assistant",
    description: "Focuses on direct chat, tools, search, and generation without document context.",
  },
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

function createSession() {
  return {
    id: crypto.randomUUID(),
    title: "New workspace",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    mode: "auto",
  };
}

function formatTime(dateLike) {
  return new Date(dateLike).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateLike) {
  return new Date(dateLike).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) && parsed.length ? parsed : [createSession()];
  } catch {
    return [createSession()];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(sessions));
}

function fileLabel(name) {
  const ext = name?.split(".").pop()?.toLowerCase();
  if (["pdf"].includes(ext)) return "PDF";
  if (["docx"].includes(ext)) return "DOCX";
  if (["pptx"].includes(ext)) return "PPTX";
  if (["txt"].includes(ext)) return "TXT";
  if (["png", "jpg", "jpeg"].includes(ext)) return "IMG";
  if (["mp3", "wav", "m4a", "webm"].includes(ext)) return "AUDIO";
  return "FILE";
}

function renderInline(text) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${part}-${index}`} className="inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
}

function MessageContent({ text }) {
  const blocks = text.split(/```/);
  return (
    <div className="message-markdown">
      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const [maybeLang, ...rest] = block.split("\n");
          const code = rest.join("\n").trim();
          const language = maybeLang.trim() || "code";
          return (
            <div key={`code-${index}`} className="code-shell">
              <div className="code-shell-header">{language}</div>
              <pre>{code}</pre>
            </div>
          );
        }

        return block
          .split("\n")
          .filter((line, lineIndex, source) => !(lineIndex === source.length - 1 && !line.trim()))
          .map((line, lineIndex) => {
            const key = `line-${index}-${lineIndex}`;
            if (!line.trim()) {
              return <div key={key} className="message-gap" />;
            }
            if (line.startsWith("### ")) return <h4 key={key}>{line.slice(4)}</h4>;
            if (line.startsWith("## ")) return <h3 key={key}>{line.slice(3)}</h3>;
            if (line.startsWith("# ")) return <h2 key={key}>{line.slice(2)}</h2>;
            return <p key={key}>{renderInline(line)}</p>;
          });
      })}
    </div>
  );
}

function LoginScreen() {
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    if (!firebaseAuth) return;
    setBusy(true);
    try {
      await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-panel">
        <div className="badge">Gyana AI Workspace</div>
        <h1>One AI for docs, chat, code, search, and voice.</h1>
        <p>
          Sign in to save your workspace and keep your document intelligence attached
          to your account.
        </p>
        <button className="primary-btn" onClick={handleSignIn} disabled={busy}>
          {busy ? "Opening Google..." : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const [initialSessions] = useState(() => loadSessions());
  const [user, setUser] = useState(hasFirebaseConfig ? undefined : {
    uid: "guest-workspace",
    displayName: "Guest",
    email: "local@workspace",
  });
  const [capabilities, setCapabilities] = useState(null);
  const [documentStats, setDocumentStats] = useState({
    total_chunks: 0,
    total_documents: 0,
    documents: [],
  });
  const [uploads, setUploads] = useState([]);
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState(initialSessions[0]?.id || "");
  const [mode, setMode] = useState("auto");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [toast, setToast] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const messageEndRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const authBootstrappedRef = useRef(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    if (!activeSession) return;
    setMode(activeSession.mode || "auto");
  }, [activeSession]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, uploads]);

  useEffect(() => {
    fetchCapabilities().then(setCapabilities);
  }, []);

  useEffect(() => {
    if (!firebaseAuth) return undefined;
    const unsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      authBootstrappedRef.current = true;
      setUser(nextUser ?? null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    refreshDocumentStats(user.uid);
  }, [user?.uid]);

  useEffect(() => {
    if (toast?.message) {
      const timer = window.setTimeout(() => setToast(null), 2600);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [toast]);

  async function refreshDocumentStats(userId) {
    const stats = await fetchDocumentStats(userId);
    setDocumentStats(stats);
  }

  function notify(message, type = "info") {
    setToast({ message, type });
  }

  function updateSessions(mutator) {
    setSessions((current) => mutator(current));
  }

  function updateActiveSession(mutator) {
    updateSessions((current) =>
      current.map((session) => {
        if (session.id !== activeSessionId) return session;
        const nextSession = mutator(session);
        return {
          ...nextSession,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }

  function pushMessage(message) {
    updateActiveSession((session) => {
      const nextMessages = [...session.messages, message];
      const nextTitle =
        session.title === "New workspace" && message.role === "user"
          ? message.text.slice(0, 48) || session.title
          : session.title;

      return {
        ...session,
        title: nextTitle,
        messages: nextMessages,
        mode,
      };
    });
  }

  function patchMessage(messageId, patch) {
    updateActiveSession((session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === messageId ? { ...message, ...patch } : message
      ),
      mode,
    }));
  }

  function appendMessageText(messageId, chunk) {
    updateActiveSession((session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === messageId
          ? { ...message, text: `${message.text}${chunk}` }
          : message
      ),
      mode,
    }));
  }

  function appendMessageCollection(messageId, key, item) {
    updateActiveSession((session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === messageId
          ? { ...message, [key]: [...(message[key] || []), item] }
          : message
      ),
      mode,
    }));
  }

  function handleNewWorkspace() {
    const session = createSession();
    session.mode = mode;
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setDraft("");
    setStatus("Fresh workspace ready");
  }

  function handleSelectSession(sessionId) {
    setActiveSessionId(sessionId);
  }

  function handleDeleteSession(sessionId) {
    setSessions((current) => {
      const filtered = current.filter((session) => session.id !== sessionId);
      if (!filtered.length) {
        const next = createSession();
        setActiveSessionId(next.id);
        return [next];
      }
      if (sessionId === activeSessionId) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    updateActiveSession((session) => ({ ...session, mode: nextMode }));
  }

  async function handleClearMemory() {
    if (!user?.uid) return;
    try {
      await clearMemory(user.uid);
      notify("Conversation memory cleared.", "success");
      setStatus("Memory cleared");
    } catch (error) {
      notify(toErrorMessage(error, "Could not clear memory."), "error");
    }
  }

  async function handleClearDocuments() {
    if (!user?.uid) return;
    try {
      await clearDocuments(user.uid);
      setDocumentStats({ total_chunks: 0, total_documents: 0, documents: [] });
      setUploads([]);
      notify("Knowledge base reset.", "success");
      setStatus("Document store cleared");
    } catch (error) {
      notify(toErrorMessage(error, "Could not clear documents."), "error");
    }
  }

  async function handleFiles(fileList) {
    if (!user?.uid) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;

    for (const file of files) {
      const uploadId = crypto.randomUUID();
      const nextUpload = {
        id: uploadId,
        name: file.name,
        status: "uploading",
        progress: 0,
        size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      };

      setUploads((current) => [nextUpload, ...current]);
      setStatus(`Indexing ${file.name}`);

      try {
        const result = await uploadDocument(file, user.uid, (progress) => {
          setUploads((current) =>
            current.map((item) =>
              item.id === uploadId ? { ...item, progress } : item
            )
          );
        });

        setUploads((current) =>
          current.map((item) =>
            item.id === uploadId
              ? {
                  ...item,
                  status: "ready",
                  progress: 100,
                  chunks: result.chunks_created,
                  language: result.detected_language,
                }
              : item
          )
        );
        setDocumentStats(result.stats || documentStats);
        notify(`${file.name} indexed successfully.`, "success");
      } catch (error) {
        setUploads((current) =>
          current.map((item) =>
            item.id === uploadId ? { ...item, status: "error" } : item
          )
        );
        notify(toErrorMessage(error, `Could not upload ${file.name}.`), "error");
      }
    }

    refreshDocumentStats(user.uid);
    setStatus("Knowledge base updated");
  }

  async function handleSend(prefilledQuestion) {
    const question = (prefilledQuestion ?? draft).trim();
    if (!question || busy || !user?.uid) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: question,
      createdAt: new Date().toISOString(),
    };
    const assistantId = crypto.randomUUID();

    pushMessage(userMessage);
    pushMessage({
      id: assistantId,
      role: "assistant",
      text: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      sources: [],
      images: [],
      files: [],
      codeResults: [],
    });

    setDraft("");
    setBusy(true);
    setStatus(`Thinking in ${MODE_META[mode].label} mode`);

    try {
      await streamAssistant({
        question,
        userId: user.uid,
        mode,
        onEvent: (event) => {
          if (event.type === "status") {
            setStatus(event.value);
            return;
          }
          if (event.type === "text") {
            appendMessageText(assistantId, event.value);
            return;
          }
          if (event.type === "sources") {
            patchMessage(assistantId, { sources: event.value || [] });
            return;
          }
          if (event.type === "image" && event.value) {
            appendMessageCollection(assistantId, "images", event.value);
            return;
          }
          if (event.type === "file" && event.value) {
            appendMessageCollection(assistantId, "files", event.value);
            return;
          }
          if (event.type === "codeResult" && event.value) {
            appendMessageCollection(assistantId, "codeResults", event.value);
            return;
          }
          if (event.type === "error") {
            patchMessage(assistantId, {
              text: event.value,
              error: true,
              streaming: false,
            });
            notify(event.value, "error");
            return;
          }
          if (event.type === "done") {
            patchMessage(assistantId, { streaming: false });
            setStatus("Response ready");
          }
        },
      });
    } catch (error) {
      const fallbackMessage = toErrorMessage(error, "Streaming failed.");
      try {
        const data = await askOnce({ question, userId: user.uid, mode });
        patchMessage(assistantId, {
          text: data.answer || fallbackMessage,
          sources: data.sources || [],
          streaming: false,
        });
      } catch {
        patchMessage(assistantId, {
          text: fallbackMessage,
          error: true,
          streaming: false,
        });
        notify(fallbackMessage, "error");
      }
    } finally {
      setBusy(false);
      composerRef.current?.focus();
    }
  }

  async function toggleRecording() {
    if (!user?.uid) return;

    if (isRecording) {
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        window.clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingTime(0);
        setStatus("Transcribing voice question");

        try {
          const blob = new Blob(chunks, { type: mimeType });
          const data = await transcribeAudio(blob, user.uid);
          setDraft(data.transcribed_question || "");
          notify("Voice question transcribed.", "success");
          await handleSend(data.transcribed_question || "");
        } catch (error) {
          notify(toErrorMessage(error, "Could not transcribe audio."), "error");
          setStatus("Voice input failed");
        }
      };

      recorder.start(200);
      recordingTimerRef.current = window.setInterval(
        () => setRecordingTime((current) => current + 1),
        1000
      );
      setIsRecording(true);
      setStatus("Listening...");
    } catch (error) {
      notify(toErrorMessage(error, "Microphone access was denied."), "error");
    }
  }

  async function handleSignOut() {
    if (!firebaseAuth) return;
    await signOut(firebaseAuth);
  }

  if (firebaseAuth && user === undefined && !authBootstrappedRef.current) {
    return (
      <main className="loading-shell">
        <div className="loading-panel">Loading workspace...</div>
      </main>
    );
  }

  if (firebaseAuth && user === null) {
    return <LoginScreen />;
  }

  const messages = activeSession?.messages || [];
  const readyUploads = uploads.filter((item) => item.status === "ready");
  const providerSummary = capabilities?.providers || {};

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-kicker">Gyana AI</div>
          <h1>All-in-one intelligence workspace</h1>
          <p>
            A single place for research, retrieval, code-aware answers, voice
            queries, and project context.
          </p>
        </div>

        <button className="primary-btn full-width" onClick={handleNewWorkspace}>
          New workspace
        </button>

        <section className="panel">
          <div className="panel-label">Modes</div>
          <div className="mode-stack">
            {Object.entries(MODE_META).map(([key, meta]) => (
              <button
                key={key}
                className={`mode-card ${mode === key ? "active" : ""}`}
                onClick={() => handleModeChange(key)}
              >
                <div>
                  <strong>{meta.label}</strong>
                  <span>{meta.tagline}</span>
                </div>
                <p>{meta.description}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-label">Knowledge Base</div>
          <button className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
            <span>Upload documents, images, or audio</span>
            <small>{documentStats.total_documents} docs indexed</small>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={ACCEPTED_FILES}
            onChange={(event) => handleFiles(event.target.files)}
          />
          <div className="stat-grid">
            <div className="stat-card">
              <span>Documents</span>
              <strong>{documentStats.total_documents}</strong>
            </div>
            <div className="stat-card">
              <span>Chunks</span>
              <strong>{documentStats.total_chunks}</strong>
            </div>
          </div>
          <div className="upload-list">
            {uploads.length === 0 ? (
              <div className="muted-box">No uploads yet. Start with a PDF, deck, or notes.</div>
            ) : (
              uploads.map((upload) => (
                <div key={upload.id} className={`upload-row ${upload.status}`}>
                  <div className="upload-pill">{fileLabel(upload.name)}</div>
                  <div className="upload-copy">
                    <strong>{upload.name}</strong>
                    <span>
                      {upload.size}
                      {upload.chunks ? ` • ${upload.chunks} chunks` : ""}
                      {upload.language ? ` • ${upload.language}` : ""}
                    </span>
                  </div>
                  <div className="upload-progress">
                    {upload.status === "uploading" ? `${upload.progress}%` : upload.status}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="panel-actions">
            <button className="ghost-btn" onClick={handleClearDocuments}>
              Clear docs
            </button>
            <button className="ghost-btn" onClick={handleClearMemory}>
              Clear memory
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-label">Workspaces</div>
          <div className="session-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`session-row ${session.id === activeSessionId ? "active" : ""}`}
              >
                <button className="session-main" onClick={() => handleSelectSession(session.id)}>
                  <strong>{session.title}</strong>
                  <span>
                    {formatDate(session.updatedAt)} • {session.messages.length} messages
                  </span>
                </button>
                <button className="session-delete" onClick={() => handleDeleteSession(session.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div>
            <div className="eyebrow">Powered AI Workspace</div>
            <h2>{capabilities?.product_name || "Gyana AI Workspace"}</h2>
          </div>
          <div className="topbar-right">
            <div className="provider-strip">
              <span>{providerSummary.llm || "LLM"}</span>
              <span>{providerSummary.voice || "Voice"}</span>
              <span>{providerSummary.vector_store || "Vector store"}</span>
            </div>
            <div className="user-chip">
              <strong>{user?.displayName || "Guest"}</strong>
              <span>{user?.email || "Local mode"}</span>
            </div>
            {firebaseAuth ? (
              <button className="ghost-btn" onClick={handleSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </header>

        <section className="hero-grid">
          <div className="hero-card">
            <div className="hero-kicker">Status</div>
            <h3>Build, ask, upload, and explore from one interface.</h3>
            <p>
              {MODE_META[mode].description} Right now the workspace is tracking{" "}
              {documentStats.total_documents} indexed documents and {messages.length} chat messages.
            </p>
            <div className="hero-status-row">
              <div className="signal-pill">
                <span className="signal-dot" />
                {status}
              </div>
              <div className="signal-pill muted">{readyUploads.length} ready uploads</div>
            </div>
          </div>

          <div className="feature-grid">
            {FEATURE_TILES.map((tile) => (
              <article key={tile.title} className="feature-card">
                <h4>{tile.title}</h4>
                <p>{tile.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="quick-actions">
          {QUICK_ACTIONS.map((prompt) => (
            <button key={prompt} className="quick-btn" onClick={() => handleSend(prompt)}>
              {prompt}
            </button>
          ))}
        </section>

        <section className="conversation-panel">
          <div className="conversation-feed">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-copy">
                  <div className="eyebrow">Start Here</div>
                  <h3>Turn this into the most powerful AI desk in your project.</h3>
                  <p>
                    Ask for research, upload your notes, brainstorm with the model, or
                    record a voice query. The workspace will adapt to the mode you choose.
                  </p>
                </div>
                <div className="empty-points">
                  <div className="muted-box">Use `Docs` mode for grounded Q&A over your files.</div>
                  <div className="muted-box">Use `General` for broad help, search, code, and creation.</div>
                  <div className="muted-box">Use `Auto` when you want the system to decide.</div>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`message-card ${message.role === "user" ? "user" : "assistant"}`}
                >
                  <div className="message-meta">
                    <span>{message.role === "user" ? "You" : "Gyana"}</span>
                    <span>{formatTime(message.createdAt)}</span>
                  </div>

                  <div className={`message-body ${message.error ? "error" : ""}`}>
                    {message.text ? (
                      <MessageContent text={message.text} />
                    ) : message.streaming ? (
                      <div className="typing-row">
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : null}
                  </div>

                  {message.images?.length ? (
                    <div className="image-grid">
                      {message.images.map((image, index) => (
                        <img
                          key={`${message.id}-image-${index}`}
                          src={`data:image/png;base64,${image}`}
                          alt="Generated result"
                        />
                      ))}
                    </div>
                  ) : null}

                  {message.codeResults?.length ? (
                    <div className="tool-result-list">
                      {message.codeResults.map((result, index) => (
                        <div key={`${message.id}-code-${index}`} className="tool-result">
                          <strong>Code Output</strong>
                          <pre>{result.output || result.error || "No output"}</pre>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {message.files?.length ? (
                    <div className="tool-result-list">
                      {message.files.map((file, index) => (
                        <div key={`${message.id}-file-${index}`} className="tool-result">
                          <strong>{file.filename}</strong>
                          <pre>{file.content}</pre>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {message.sources?.length ? (
                    <div className="source-row">
                      {message.sources.map((source, index) => (
                        <span key={`${message.id}-source-${index}`} className="source-chip">
                          {source.title || source}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            )}
            <div ref={messageEndRef} />
          </div>

          <div className="composer-shell">
            <textarea
              ref={composerRef}
              value={draft}
              rows={1}
              placeholder="Ask anything, request a workflow, summarize your docs, or search the latest updates..."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              disabled={busy}
            />
            <div className="composer-footer">
              <div className="composer-left">
                <button className="ghost-btn" onClick={() => fileInputRef.current?.click()}>
                  Attach files
                </button>
                <button
                  className={`ghost-btn ${isRecording ? "danger" : ""}`}
                  onClick={toggleRecording}
                >
                  {isRecording
                    ? `Stop (${String(Math.floor(recordingTime / 60)).padStart(2, "0")}:${String(
                        recordingTime % 60
                      ).padStart(2, "0")})`
                    : "Voice"}
                </button>
              </div>
              <button className="primary-btn" onClick={() => handleSend()} disabled={busy || !draft.trim()}>
                {busy ? "Working..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </main>

      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}
    </div>
  );
}
