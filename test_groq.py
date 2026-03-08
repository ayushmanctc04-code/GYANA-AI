from langchain_groq import ChatGroq
import os

llm = ChatGroq(
    model="openai/gpt-oss-20b",
    temperature=0,
    groq_api_key=os.getenv("GROQ_API_KEY")
)

response = llm.invoke("Explain Artificial Intelligence in simple words.")
print(response.content)