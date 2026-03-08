const API_BASE = "http://127.0.0.1:8000";

export const askQuestion = async (question) => {
  const formData = new FormData();
  formData.append("question", question);

  const res = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    body: formData,
  });

  return res.json();
};


export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });

  return res.json();
};


export const speechQuery = async (audio) => {
  const formData = new FormData();
  formData.append("file", audio);

  const res = await fetch(`${API_BASE}/speech-query`, {
    method: "POST",
    body: formData,
  });

  return res.json();
};