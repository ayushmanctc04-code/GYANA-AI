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
  fetchDocumentStats,
  streamAssistant,
  toErrorMessage,
  transcribeAudio,
  transcribeOnly,
  uploadDocument,
} from "./api";

const CHAT_STORAGE_KEY = "gyana.workspace.sessions";
const LANGUAGE_STORAGE_KEY = "gyana.workspace.language";
const ACCEPTED_FILES = ".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg,.mp3,.wav,.m4a,.webm";
const GURU_PROMPT_PREFIX =
  "Respond as Gyana in a warm spoken style. Be like a wise tutor, thoughtful therapist, and clear guide. Keep it natural, calm, comforting, and deeply helpful. Answer in the same language the user speaks unless they ask otherwise. No markdown unless code is essential.";

const MODE_META = {
  auto: "Auto",
  docs: "Docs",
  general: "General",
};

const SUGGESTIONS = [
  "Explain this topic like a brilliant teacher.",
  "Help me think through what I should do next.",
  "Turn my notes into a revision plan.",
  "Talk to me like a calm mentor.",
];

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "bn", label: "Bengali" },
  { value: "or", label: "Odia" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "pa", label: "Punjabi" },
  { value: "ur", label: "Urdu" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
];

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
    title: "New conversation",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    mode: "auto",
  };
}

function getSessionStorageKey(userId = "guest-workspace") {
  return `${CHAT_STORAGE_KEY}.${userId}`;
}

function loadSessions(userId = "guest-workspace") {
  try {
    const raw = localStorage.getItem(getSessionStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) && parsed.length ? parsed : [createSession()];
  } catch {
    return [createSession()];
  }
}

function saveSessions(sessions, userId = "guest-workspace") {
  localStorage.setItem(getSessionStorageKey(userId), JSON.stringify(sessions));
}

function loadPreferredLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved || "auto";
  } catch {
    return "auto";
  }
}

function normalizeLanguageTag(language) {
  if (!language) return "en-US";
  const value = String(language).replace("_", "-").trim();
  if (!value || value === "auto") {
    if (typeof navigator !== "undefined") {
      return navigator.languages?.[0] || navigator.language || "en-US";
    }
    return "en-US";
  }

  const lowered = value.toLowerCase();
  const mapping = {
    en: "en-US",
    hi: "hi-IN",
    bn: "bn-IN",
    or: "or-IN",
    ta: "ta-IN",
    te: "te-IN",
    mr: "mr-IN",
    gu: "gu-IN",
    pa: "pa-IN",
    ur: "ur-IN",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    ar: "ar-SA",
    zh: "zh-CN",
    ja: "ja-JP",
  };

  return mapping[lowered] || value;
}

function getLanguageLabel(language) {
  return LANGUAGE_OPTIONS.find((option) => option.value === language)?.label || "Auto";
}

function getUserInitial(user) {
  const label = user?.displayName || user?.email || "G";
  return label.trim().charAt(0).toUpperCase();
}

function stripMarkdownForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[_~]/g, "")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
}

function chunkSpeechText(text, maxLength = 220) {
  const clean = stripMarkdownForSpeech(text);
  if (!clean) return [];

  const sentences = clean
    .split(/(?<=[.!?।])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    if (`${current} ${sentence}`.length <= maxLength) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [clean];
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
          const language = maybeLang.trim() || "code";
          const code = rest.join("\n").trim();
          return <CodeBlock key={`code-${index}`} language={language} code={code} />;
        }

        return block
          .split("\n")
          .filter((line, lineIndex, source) => !(lineIndex === source.length - 1 && !line.trim()))
          .map((line, lineIndex) => {
            const key = `line-${index}-${lineIndex}`;
            if (!line.trim()) return <div key={key} className="message-gap" />;
            if (line.startsWith("### ")) return <h4 key={key}>{line.slice(4)}</h4>;
            if (line.startsWith("## ")) return <h3 key={key}>{line.slice(3)}</h3>;
            if (line.startsWith("# ")) return <h2 key={key}>{line.slice(2)}</h2>;
            return <p key={key}>{renderInline(line)}</p>;
          });
      })}
    </div>
  );
}

function CodeBlock({ language, code }) {
  const [showPreview, setShowPreview] = useState(false);
  const isPreviewable = ["html", "css", "javascript", "js", "jsx"].includes(
    language.toLowerCase()
  );

  function buildPreview() {
    const lang = language.toLowerCase();
    if (lang === "html") return code;
    if (lang === "css") {
      return `<style>${code}</style><div style="padding:24px;font-family:sans-serif;background:#fff;color:#111">CSS Preview</div>`;
    }
    if (lang === "js" || lang === "javascript") {
      return `<div style="padding:24px;font-family:sans-serif">JavaScript Preview Console</div><script>${code}</script>`;
    }
    if (lang === "jsx") {
      return `
        <div id="root"></div>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <script type="text/babel">${code}</script>
      `;
    }
    return code;
  }

  return (
    <div className="code-shell">
      <div className="code-shell-header-row">
        <div className="code-shell-header">{language}</div>
        <div className="code-shell-actions">
          {isPreviewable ? (
            <button className="text-button small" onClick={() => setShowPreview((value) => !value)}>
              {showPreview ? "Hide preview" : "Preview"}
            </button>
          ) : null}
          <button className="text-button small" onClick={() => navigator.clipboard.writeText(code)}>
            Copy
          </button>
        </div>
      </div>
      <pre>{code}</pre>
      {showPreview ? (
        <div className="code-preview-shell">
          <div className="code-preview-label">Live preview</div>
          <iframe title="code preview" className="code-preview-frame" srcDoc={buildPreview()} sandbox="allow-scripts" />
        </div>
      ) : null}
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
        <div className="auth-mark">Gyana</div>
        <h1>Meet your Guru.</h1>
        <p>
          A calm AI companion for study, clarity, conversation, and guidance.
        </p>
        <button className="primary-btn" onClick={handleSignIn} disabled={busy}>
          {busy ? "Opening Google..." : "Continue with Google"}
        </button>
      </div>
    </main>
  );
}

function GuruMode({ isOpen, onClose, onSubmitVoice, busy, language }) {
  const [supported, setSupported] = useState(false);
  const [wakeText, setWakeText] = useState("Say hey guru or tap to speak");
  const [listeningWake, setListeningWake] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setSupported(false);
      setWakeText("Tap to speak");
      return undefined;
    }

    setSupported(true);
    const recognition = new Recognition();
    recognition.lang = normalizeLanguageTag(language);
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListeningWake(true);
      setWakeText("Listening for hey guru");
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .toLowerCase();

      if (transcript.includes("hey guru")) {
        setWakeText("Guru awakened");
        recognition.stop();
        onSubmitVoice?.();
      }
    };

    recognition.onend = () => {
      setListeningWake(false);
    };

    try {
      recognition.start();
    } catch {
      setWakeText("Tap to speak");
    }

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, [isOpen, language, onSubmitVoice]);

  if (!isOpen) return null;

  return (
    <div className="guru-overlay">
      <button className="guru-close" onClick={onClose}>
        Close
      </button>
      <div className="guru-center">
        <div className="guru-orb-wrap">
          <div className={`guru-orb ${busy ? "is-busy" : ""}`} onClick={onSubmitVoice}>
            <div className="guru-orb-core" />
          </div>
        </div>
        <div className="guru-label">Guru Mode</div>
        <h2>Hey Guru</h2>
        <p>
          Speak naturally. Gyana listens like a tutor, thinks like a guide, and
          answers like someone who is with you.
        </p>
        <div className="guru-status">
          {busy ? "Thinking..." : supported ? wakeText : "Voice wake phrase not supported here"}
        </div>
        <button className="guru-action" onClick={onSubmitVoice}>
          {busy ? "Working..." : listeningWake ? "Speak now" : "Tap to talk"}
        </button>
      </div>
    </div>
  );
}

function AppInner() {
  const [user, setUser] = useState(
    hasFirebaseConfig
      ? undefined
      : {
          uid: "guest-workspace",
          displayName: "Guest",
          email: "local@workspace",
        }
  );
  const [documentStats, setDocumentStats] = useState({
    total_chunks: 0,
    total_documents: 0,
    documents: [],
  });
  const [uploads, setUploads] = useState([]);
  const [sessions, setSessions] = useState(() => [createSession()]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [mode, setMode] = useState("auto");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [toast, setToast] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [guruOpen, setGuruOpen] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState(() => loadPreferredLanguage());
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [voiceSupport, setVoiceSupport] = useState({
    input: false,
    wake: false,
    output: false,
  });
  const [speakingId, setSpeakingId] = useState(null);

  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const messageEndRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const authBootstrappedRef = useRef(false);
  const voicesRef = useRef([]);
  const speechQueueRef = useRef([]);
  const speechCancelledRef = useRef(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const storageUserId = user?.uid || "guest-workspace";

  useEffect(() => {
    if (firebaseAuth && user === undefined && !authBootstrappedRef.current) return;
    const loaded = loadSessions(storageUserId);
    setSessions(loaded);
    setActiveSessionId((current) => current || loaded[0]?.id || "");
  }, [storageUserId, user]);

  useEffect(() => {
    if (firebaseAuth && user === undefined && !authBootstrappedRef.current) return;
    saveSessions(sessions, storageUserId);
  }, [sessions, storageUserId, user]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, preferredLanguage);
  }, [preferredLanguage]);

  useEffect(() => {
    if (!activeSession) return;
    setMode(activeSession.mode || "auto");
  }, [activeSession]);

  useEffect(() => {
    if (!sessions.length) {
      const next = createSession();
      setSessions([next]);
      setActiveSessionId(next.id);
      return;
    }

    if (!sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, uploads]);

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
    const hasInput =
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== "undefined";
    const hasWake = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const hasOutput =
      typeof window.speechSynthesis !== "undefined" &&
      typeof window.SpeechSynthesisUtterance !== "undefined";

    setVoiceSupport({
      input: hasInput,
      wake: hasWake,
      output: hasOutput,
    });

    if (!hasOutput) return undefined;

    const synth = window.speechSynthesis;
    if (!synth || typeof synth.getVoices !== "function") return undefined;

    const loadVoices = () => {
      try {
        voicesRef.current = synth.getVoices();
      } catch {
        voicesRef.current = [];
      }
    };

    loadVoices();
    try {
      synth.onvoiceschanged = loadVoices;
    } catch {
      // ignore browsers with restricted assignment behavior
    }

    return () => {
      try {
        synth.onvoiceschanged = null;
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    if (!toast?.message) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function refreshDocumentStats(userId) {
    const stats = await fetchDocumentStats(userId);
    setDocumentStats(stats);
  }

  function notify(message, type = "info") {
    setToast({ message, type });
  }

  function pickBestVoice(languageHint = preferredLanguage) {
    const voices = voicesRef.current || [];
    if (!voices.length) return null;

    const normalized = normalizeLanguageTag(languageHint).toLowerCase();
    const baseLanguage = normalized.split("-")[0];
    const matchingVoices = voices.filter((voice) =>
      voice.lang?.toLowerCase().startsWith(baseLanguage)
    );
    const pool = matchingVoices.length ? matchingVoices : voices;

    const scoredVoices = pool
      .map((voice) => {
        let score = 0;
        if (/google|microsoft|apple/i.test(voice.name)) score += 4;
        if (/aria|zira|samantha|ava|serena|allison|moira|neural/i.test(voice.name)) score += 5;
        if (/enhanced|premium|natural/i.test(voice.name)) score += 3;
        if (!/compact|espeak|robot/i.test(voice.name)) score += 1;
        return { voice, score };
      })
      .sort((a, b) => b.score - a.score);

    return scoredVoices[0]?.voice || pool[0] || voices[0];
  }

  function speakText(text, messageId = "guru", languageHint = preferredLanguage) {
    if (!speechEnabled || !voiceSupport.output || !text?.trim()) return;

    try {
      const synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;
      speechCancelledRef.current = false;
      synth.cancel();
      const normalizedLanguage = normalizeLanguageTag(languageHint);
      const chunks = chunkSpeechText(text);
      const voice = pickBestVoice(normalizedLanguage);
      speechQueueRef.current = chunks.slice();

      const runNext = () => {
        if (speechCancelledRef.current) {
          setSpeakingId(null);
          speechQueueRef.current = [];
          return;
        }

        const nextChunk = speechQueueRef.current.shift();
        if (!nextChunk) {
          setSpeakingId(null);
          return;
        }

        const utterance = new SpeechSynthesisUtterance(nextChunk);
        if (voice) utterance.voice = voice;
        utterance.lang = normalizedLanguage;
        utterance.rate = /^en/i.test(normalizedLanguage) ? 0.96 : 0.92;
        utterance.pitch = /^en/i.test(normalizedLanguage) ? 1 : 0.98;
        utterance.volume = 1;
        utterance.onstart = () => setSpeakingId(messageId);
        utterance.onend = () => runNext();
        utterance.onerror = () => runNext();
        synth.speak(utterance);
      };

      runNext();
    } catch {
      setSpeakingId(null);
    }
  }

  function stopSpeaking() {
    if (!voiceSupport.output) return;
    try {
      speechCancelledRef.current = true;
      speechQueueRef.current = [];
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    setSpeakingId(null);
  }

  function copyText(text) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
      }
    } catch {
      // ignore clipboard failures
    }
  }

  function updateSessions(mutator) {
    setSessions((current) => mutator(current));
  }

  function updateActiveSession(mutator) {
    updateSessions((current) =>
      current.map((session) => {
        if (session.id !== activeSessionId) return session;
        const next = mutator(session);
        return { ...next, updatedAt: new Date().toISOString() };
      })
    );
  }

  function pushMessage(message) {
    updateActiveSession((session) => {
      const nextMessages = [...session.messages, message];
      const nextTitle =
        session.title === "New conversation" && message.role === "user"
          ? message.text.slice(0, 54) || session.title
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

  function createAssistantMessage() {
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      createdAt: new Date().toISOString(),
      streaming: true,
      sources: [],
      images: [],
      files: [],
      codeResults: [],
      language: preferredLanguage,
    };
  }

  async function handleClearDocuments() {
    if (!user?.uid) return;
    try {
      await clearDocuments(user.uid);
      setUploads([]);
      setDocumentStats({ total_chunks: 0, total_documents: 0, documents: [] });
      notify("Document knowledge cleared.", "success");
    } catch (error) {
      notify(toErrorMessage(error, "Could not clear documents."), "error");
    }
  }

  async function handleClearMemory() {
    if (!user?.uid) return;
    try {
      await clearMemory(user.uid);
      notify("Conversation memory cleared.", "success");
    } catch (error) {
      notify(toErrorMessage(error, "Could not clear memory."), "error");
    }
  }

  function handleNewConversation() {
    const next = createSession();
    next.mode = mode;
    setSessions((current) => [next, ...current]);
    setActiveSessionId(next.id);
    setDraft("");
  }

  function handleDeleteConversation(sessionId) {
    setSessions((current) => {
      const remaining = current.filter((session) => session.id !== sessionId);
      if (!remaining.length) {
        const replacement = createSession();
        setActiveSessionId(replacement.id);
        notify("Conversation deleted.", "success");
        return [replacement];
      }

      if (sessionId === activeSessionId) {
        setActiveSessionId(remaining[0].id);
      }
      notify("Conversation deleted.", "success");
      return remaining;
    });
  }

  async function handleFiles(fileList) {
    if (!user?.uid) return;
    const files = Array.from(fileList || []);
    if (!files.length) return;

    for (const file of files) {
      const uploadId = crypto.randomUUID();
      setUploads((current) => [
        {
          id: uploadId,
          name: file.name,
          status: "uploading",
          progress: 0,
          size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        },
        ...current,
      ]);

      try {
        const result = await uploadDocument(file, user.uid, (progress) => {
          setUploads((current) =>
            current.map((item) => (item.id === uploadId ? { ...item, progress } : item))
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
      } catch (error) {
        setUploads((current) =>
          current.map((item) => (item.id === uploadId ? { ...item, status: "error" } : item))
        );
        notify(toErrorMessage(error, `Could not upload ${file.name}.`), "error");
      }
    }

    refreshDocumentStats(user.uid);
  }

  async function runStream(question, chosenMode = mode) {
    if (!question.trim() || busy || !user?.uid) return;

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: question,
      createdAt: new Date().toISOString(),
    };
    const assistant = createAssistantMessage();

    pushMessage(userMessage);
    pushMessage(assistant);
    setBusy(true);
    setStatus("Thinking");
    setDraft("");
    let collectedText = "";
    let responseLanguage = preferredLanguage;

    try {
      await streamAssistant({
        question,
        userId: user.uid,
        mode: chosenMode,
        language: preferredLanguage,
        onEvent: (event) => {
          if (event.type === "status") {
            setStatus(event.value);
            return;
          }
          if (event.type === "language") {
            responseLanguage = event.value || preferredLanguage;
            patchMessage(assistant.id, { language: responseLanguage });
            return;
          }
          if (event.type === "text") {
            collectedText += event.value;
            appendMessageText(assistant.id, event.value);
            return;
          }
          if (event.type === "sources") {
            patchMessage(assistant.id, { sources: event.value || [] });
            return;
          }
          if (event.type === "image" && event.value) {
            appendMessageCollection(assistant.id, "images", event.value);
            return;
          }
          if (event.type === "file" && event.value) {
            appendMessageCollection(assistant.id, "files", event.value);
            return;
          }
          if (event.type === "codeResult" && event.value) {
            appendMessageCollection(assistant.id, "codeResults", event.value);
            return;
          }
          if (event.type === "error") {
            patchMessage(assistant.id, {
              text: event.value,
              error: true,
              streaming: false,
            });
            notify(event.value, "error");
            return;
          }
          if (event.type === "done") {
            patchMessage(assistant.id, { streaming: false });
            setStatus("Ready");
            if (collectedText.trim()) {
              setTimeout(() => speakText(collectedText, assistant.id, responseLanguage), 120);
            }
          }
        },
      });
    } catch (error) {
      const fallbackMessage = toErrorMessage(error, "Streaming failed.");
      try {
        const data = await askOnce({
          question,
          userId: user.uid,
          mode: chosenMode,
          language: preferredLanguage,
        });
        patchMessage(assistant.id, {
          text: data.answer || fallbackMessage,
          sources: data.sources || [],
          streaming: false,
          language: data.language || responseLanguage,
        });
        if (data.answer) {
          setTimeout(() => speakText(data.answer, assistant.id, data.language || responseLanguage), 120);
        }
      } catch {
        patchMessage(assistant.id, {
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

  async function handleGuruVoice() {
    if (!user?.uid || busy) return;

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

        try {
          const blob = new Blob(chunks, { type: mimeType });
          const transcription = await transcribeOnly(blob, user.uid);
          const spokenText = transcription.text || transcription.transcription || "";
          if (!spokenText.trim()) {
            notify("I could not catch that voice input.", "error");
            return;
          }
          setGuruOpen(false);
          await runStream(`${GURU_PROMPT_PREFIX}\n\nUser said: ${spokenText}`, "general");
        } catch (error) {
          notify(toErrorMessage(error, "Guru mode could not process voice."), "error");
        }
      };

      recorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = window.setInterval(
        () => setRecordingTime((current) => current + 1),
        1000
      );
      setTimeout(() => {
        try {
          if (recorder.state !== "inactive") recorder.stop();
        } catch {
          // ignore
        }
      }, 7000);
    } catch (error) {
      notify(toErrorMessage(error, "Microphone access was denied."), "error");
    }
  }

  async function handleStandardVoice() {
    if (!user?.uid || busy || !voiceSupport.input) {
      if (!voiceSupport.input) notify("Voice input is not supported in this browser.", "error");
      return;
    }

    if (isRecording) {
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
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

        try {
          const blob = new Blob(chunks, { type: mimeType });
          const data = await transcribeAudio(blob, user.uid);
          const question = data.transcribed_question || "";
          if (!question.trim()) {
            notify("I could not catch that voice input.", "error");
            return;
          }
          await runStream(question, mode);
        } catch (error) {
          notify(toErrorMessage(error, "Could not transcribe audio."), "error");
        }
      };

      recorder.start(200);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = window.setInterval(
        () => setRecordingTime((current) => current + 1),
        1000
      );
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
        <div className="loading-panel">Awakening Gyana...</div>
      </main>
    );
  }

  if (firebaseAuth && user === null) {
    return <LoginScreen />;
  }

  const messages = activeSession?.messages || [];

  return (
    <>
      <GuruMode
        isOpen={guruOpen}
        onClose={() => setGuruOpen(false)}
        onSubmitVoice={handleGuruVoice}
        busy={busy || isRecording}
        language={preferredLanguage}
      />

      <div className="app-shell">
        <div className="scene-backdrop" aria-hidden="true">
          <div className="scene-aurora scene-aurora-a" />
          <div className="scene-aurora scene-aurora-b" />
          <div className="scene-grid" />
          <div className="scene-rings">
            <span />
            <span />
            <span />
          </div>
          <div className="scene-monolith scene-monolith-a" />
          <div className="scene-monolith scene-monolith-b" />
          <div className="scene-orbital scene-orbital-a" />
          <div className="scene-orbital scene-orbital-b" />
        </div>

        <aside className="side-rail">
          <button className="brand-button" onClick={handleNewConversation}>
            <span className="brand-mark" />
            <div>
              <strong>Gyana</strong>
              <span>your guru</span>
            </div>
          </button>

          <div className="account-card">
            {user?.photoURL ? (
              <img className="account-avatar image" src={user.photoURL} alt={user.displayName || "User"} />
            ) : (
              <div className="account-avatar">{getUserInitial(user)}</div>
            )}
            <div className="account-copy">
              <strong>{user?.displayName || "Guest"}</strong>
              <span>{user?.email || "local workspace mode"}</span>
            </div>
          </div>

          <button className="soft-button" onClick={() => setGuruOpen(true)}>
            Guru Mode
          </button>

          <div className="mode-switch">
            {Object.entries(MODE_META).map(([key, label]) => (
              <button
                key={key}
                className={`mode-pill ${mode === key ? "active" : ""}`}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <button className="upload-button" onClick={() => fileInputRef.current?.click()}>
            <span>Add to knowledge</span>
            <small>{documentStats.total_documents} documents</small>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={ACCEPTED_FILES}
            onChange={(event) => handleFiles(event.target.files)}
          />

          <div className="upload-stack">
            {uploads.slice(0, 4).map((upload) => (
              <div key={upload.id} className={`upload-item ${upload.status}`}>
                <span>{fileLabel(upload.name)}</span>
                <div>
                  <strong>{upload.name}</strong>
                  <small>
                    {upload.status === "uploading" ? `${upload.progress}%` : upload.status}
                  </small>
                </div>
              </div>
            ))}
          </div>

          <div className="history-list">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`history-item ${session.id === activeSessionId ? "active" : ""}`}
              >
                <button
                  className="history-item-main"
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <strong>{session.title}</strong>
                  <span>{formatDate(session.updatedAt)}</span>
                </button>
                <button
                  className="history-delete"
                  onClick={() => handleDeleteConversation(session.id)}
                  aria-label={`Delete ${session.title}`}
                  title="Delete conversation"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <div className="side-actions">
            <button className="text-button" onClick={handleClearDocuments}>
              Clear docs
            </button>
            <button className="text-button" onClick={handleClearMemory}>
              Clear memory
            </button>
            {firebaseAuth ? (
              <button className="text-button" onClick={handleSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </aside>

        <main className="chat-stage">
          <header className="chat-header">
            <div>
              <div className="chat-title">Gyana</div>
              <p>
                Tutor when you need clarity. Guide when you feel lost. Companion when
                you need someone to think with.
              </p>
            </div>
            <div className="header-actions">
              <label className="language-picker">
                <span>Language</span>
                <select
                  value={preferredLanguage}
                  onChange={(event) => setPreferredLanguage(event.target.value)}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className={`text-button ${speechEnabled ? "active-voice" : ""}`}
                onClick={() => {
                  if (speechEnabled) stopSpeaking();
                  setSpeechEnabled((value) => !value);
                }}
              >
                {speechEnabled ? "Voice on" : "Voice off"}
              </button>
              <button className="guru-header-btn" onClick={() => setGuruOpen(true)}>
                {voiceSupport.wake ? "Say “Hey Guru”" : "Open Guru"}
              </button>
            </div>
          </header>

          <section className="conversation-root">
            {messages.length === 0 ? (
              <div className="welcome-shell">
                <div className="welcome-meta">
                  <span>Adaptive tutor</span>
                  <span>Human voice flow</span>
                  <span>Deep study companion</span>
                </div>
                <div className="welcome-orb" onClick={() => setGuruOpen(true)}>
                  <div className="welcome-orb-core" />
                </div>
                <h1>Hey Guru</h1>
                <p>
                  Ask anything. Upload your notes. Speak if you want. Keep it simple.
                </p>
                <div className="welcome-stat-row">
                  <div className="welcome-stat">
                    <strong>{documentStats.total_documents}</strong>
                    <span>Knowledge files</span>
                  </div>
                  <div className="welcome-stat">
                    <strong>{sessions.length}</strong>
                    <span>Conversations</span>
                  </div>
                  <div className="welcome-stat">
                    <strong>{getLanguageLabel(preferredLanguage)}</strong>
                    <span>Voice language</span>
                  </div>
                </div>
                <div className="suggestion-row">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      className="suggestion-chip"
                      onClick={() => runStream(suggestion, mode)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="message-flow">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-turn ${message.role === "user" ? "user" : "assistant"}`}
                  >
                    <div className="message-label">
                      <span>{message.role === "user" ? "You" : "Gyana"}</span>
                      <span>
                        {message.role === "assistant" && message.language
                          ? `${getLanguageLabel(message.language)} • ${formatTime(message.createdAt)}`
                          : formatTime(message.createdAt)}
                      </span>
                    </div>
                    <div className={`message-content ${message.error ? "error" : ""}`}>
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
                    {message.sources?.length ? (
                      <div className="source-row">
                        {message.sources.map((source, index) => (
                          <span key={`${message.id}-${index}`} className="source-chip">
                            {source.title || source}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {message.role === "assistant" && message.text ? (
                      <div className="message-tools">
                        <button
                          className="text-button small"
                          onClick={() =>
                            speakingId === message.id
                              ? stopSpeaking()
                              : speakText(message.text, message.id, message.language || preferredLanguage)
                          }
                        >
                          {speakingId === message.id ? "Stop voice" : "Listen"}
                        </button>
                        <button
                          className="text-button small"
                          onClick={() => copyText(message.text)}
                        >
                          Copy
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
                <div ref={messageEndRef} />
              </div>
            )}
          </section>

          <footer className="composer-wrap">
            <div className="composer-shell">
              <textarea
                ref={composerRef}
                value={draft}
                rows={1}
                placeholder="Talk to Gyana..."
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    runStream(draft, mode);
                  }
                }}
                disabled={busy}
              />
              <div className="composer-actions">
                <span className="voice-compat">
                  {voiceSupport.input
                    ? voiceSupport.wake
                      ? "Voice ready"
                      : "Tap voice ready"
                    : "Voice limited"}
                  {` • ${getLanguageLabel(preferredLanguage)}`}
                </span>
                <button className="text-button" onClick={() => fileInputRef.current?.click()}>
                  Attach
                </button>
                <button className="text-button" onClick={handleStandardVoice}>
                  {isRecording
                    ? `Stop ${String(Math.floor(recordingTime / 60)).padStart(2, "0")}:${String(
                        recordingTime % 60
                      ).padStart(2, "0")}`
                    : "Voice"}
                </button>
                <button
                  className="primary-btn send-btn"
                  onClick={() => runStream(draft, mode)}
                  disabled={busy || !draft.trim()}
                >
                  {busy ? status : "Send"}
                </button>
              </div>
            </div>
          </footer>
        </main>
      </div>

      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}
    </>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Gyana UI error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="loading-shell">
          <div className="loading-panel">
            <div className="auth-mark">Gyana</div>
            <h1>Something went wrong.</h1>
            <p>{this.state.error.message}</p>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
