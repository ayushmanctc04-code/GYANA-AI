import requests
from app.config import GROQ_API_KEY, MODEL_NAME

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def generate_answer(question, context):

    prompt = f"""
Answer using ONLY the context below.

Context:
{context}

Question:
{question}
"""

    response = requests.post(
        GROQ_URL,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.3,
        },
    )

    result = response.json()

    if "choices" not in result:
        return "Groq API error."

    return result["choices"][0]["message"]["content"]