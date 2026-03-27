import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function getHeaders(userId) {
  return userId ? { "x-user-id": userId } : {};
}

function getErrorMessage(error, fallback = "Something went wrong.") {
  return error?.response?.data?.detail || error?.message || fallback;
}

export async function fetchCapabilities() {
  try {
    const { data } = await axios.get(`${API_BASE}/capabilities`);
    return data;
  } catch {
    return {
      product_name: "Gyana AI Workspace",
      version: "offline",
      chat_modes: ["auto", "general", "docs"],
      features: ["streaming_chat", "document_rag", "voice_transcription"],
      providers: {
        llm: "Unavailable",
        voice: "Unavailable",
        vector_store: "Unavailable",
      },
    };
  }
}

export async function fetchDocumentStats(userId) {
  try {
    const { data } = await axios.get(`${API_BASE}/documents/stats`, {
      headers: getHeaders(userId),
    });
    return data;
  } catch {
    return { total_chunks: 0, total_documents: 0, documents: [] };
  }
}

export async function clearDocuments(userId) {
  const { data } = await axios.delete(`${API_BASE}/documents`, {
    headers: getHeaders(userId),
  });
  return data;
}

export async function clearMemory(userId) {
  const { data } = await axios.post(`${API_BASE}/clear-memory`, {
    user_id: userId,
  });
  return data;
}

export async function uploadDocument(file, userId, onProgress) {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await axios.post(`${API_BASE}/upload`, formData, {
    headers: getHeaders(userId),
    onUploadProgress: (event) => {
      if (!event.total || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });

  return data;
}

export async function transcribeAudio(blob, userId) {
  const formData = new FormData();
  formData.append("file", blob, "voice.webm");

  const { data } = await axios.post(`${API_BASE}/speech-query`, formData, {
    headers: getHeaders(userId),
  });

  return data;
}

export async function transcribeOnly(blob, userId) {
  const formData = new FormData();
  formData.append("file", blob, "voice.webm");

  const { data } = await axios.post(`${API_BASE}/transcribe`, formData, {
    headers: getHeaders(userId),
  });

  return data;
}

export async function askOnce({
  question,
  userId,
  mode = "auto",
  language = "auto",
  focus = "adaptive",
  responseStyle = "balanced",
}) {
  try {
    const { data } = await axios.post(`${API_BASE}/ask`, {
      question,
      user_id: userId,
      mode,
      language,
      focus,
      response_style: responseStyle,
    });
    return data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Request failed."));
  }
}

export async function streamAssistant({
  question,
  userId,
  mode = "auto",
  language = "auto",
  focus = "adaptive",
  responseStyle = "balanced",
  onEvent,
}) {
  const response = await fetch(`${API_BASE}/ask/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getHeaders(userId),
    },
    body: JSON.stringify({
      question,
      user_id: userId,
      mode,
      language,
      focus,
      response_style: responseStyle,
    }),
  });

  if (!response.ok || !response.body) {
    let detail = "Streaming failed.";
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      // ignore malformed error payload
    }
    throw new Error(detail);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const emitData = (payload) => {
    if (!payload) return;

    if (payload.startsWith("[STATUS]")) {
      onEvent?.({ type: "status", value: payload.slice(8).trim() });
      return;
    }
    if (payload.startsWith("[ERROR]")) {
      onEvent?.({ type: "error", value: payload.slice(7).trim() });
      return;
    }
    if (payload.startsWith("[SOURCES]")) {
      try {
        onEvent?.({
          type: "sources",
          value: JSON.parse(payload.slice(9)),
        });
      } catch {
        onEvent?.({ type: "sources", value: [] });
      }
      return;
    }
    if (payload.startsWith("[LANGUAGE]")) {
      onEvent?.({ type: "language", value: payload.slice(10).trim() || "auto" });
      return;
    }
    if (payload.startsWith("[IMAGE]")) {
      onEvent?.({ type: "image", value: payload.slice(7) });
      return;
    }
    if (payload.startsWith("[CODE_RESULT]")) {
      try {
        onEvent?.({
          type: "codeResult",
          value: JSON.parse(payload.slice(13)),
        });
      } catch {
        onEvent?.({ type: "codeResult", value: null });
      }
      return;
    }
    if (payload.startsWith("[FILE]")) {
      try {
        onEvent?.({
          type: "file",
          value: JSON.parse(payload.slice(6)),
        });
      } catch {
        onEvent?.({ type: "file", value: null });
      }
      return;
    }
    if (payload === "[DONE]") {
      onEvent?.({ type: "done" });
      return;
    }

    onEvent?.({ type: "text", value: payload });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const segments = buffer.split("\n\n");
    buffer = segments.pop() || "";

    for (const segment of segments) {
      const lines = segment
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => (line.startsWith("data: ") ? line.slice(6) : line.slice(5)));

      for (const line of lines) {
        emitData(line);
      }
    }
  }
}

export function toErrorMessage(error, fallback) {
  return getErrorMessage(error, fallback);
}
