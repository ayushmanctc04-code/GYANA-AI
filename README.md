---
title: Gyana AI
emoji: 🧠
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
---

# Gyana AI Workspace

Gyana AI Workspace is an all-in-one AI product that combines:

- conversational AI
- document-grounded RAG
- voice-to-answer workflows
- web-aware agentic responses
- code and file generation
- image generation
- persistent auth and memory infrastructure

The goal is simple: one interface that feels like a premium blend of the best modern AI assistants, while staying under your control across Vercel, Hugging Face, Firebase, and Supabase.

## Architecture

### Frontend
- React + Vite
- Hosted on Vercel
- Firebase authentication
- Streaming workspace UI with chat modes, uploads, and voice entry

### Backend
- FastAPI
- currently Docker-ready for Hugging Face Spaces or Koyeb
- Groq-powered generation and transcription with Hugging Face fallback
- Agentic routing for general chat, docs, search, image, and code workflows

### Data and identity
- Firebase for identity
- Supabase pgvector for RAG storage and retrieval
- Local session persistence in the browser for workspace continuity

## Core Product Features

- `Auto`, `Docs`, and `General` chat modes
- Document upload and indexing
- Streaming responses
- Speech query flow
- Web-search-aware agent behavior
- Image generation hooks
- Code execution and downloadable file results
- Workspace sessions with reusable history

## Repository Structure

```text
rag-frontend/           React + Vite frontend
docu_rag_backend/       FastAPI backend and AI orchestration
Dockerfile              Hugging Face Space container entry
README.md               Product and deployment guide
```

## Deployment Topology

### Production setup
- `rag-frontend` deploys to Vercel
- `docu_rag_backend` can deploy to Hugging Face Spaces or Koyeb
- Firebase handles auth and frontend identity
- Supabase stores vectorized document chunks

### Runtime flow
1. User authenticates through Firebase
2. Frontend sends requests to the backend host
3. Backend selects the right AI workflow
4. Document context is pulled from Supabase when relevant
5. Streaming results are rendered back in the workspace UI

## Environment Variables

### Frontend

Create Vercel environment variables for:

```bash
VITE_API_URL=https://your-huggingface-space-url
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Backend

Use the variables documented in `docu_rag_backend/.env.example`:

```bash
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile
SUPABASE_URL=...
SUPABASE_KEY=...
HF_API_KEY=...
TAVILY_API_KEY=...
SERPER_API_KEY=...
```

## Koyeb Deployment

Koyeb is the better backend host if you want Gyana to behave more like a stable product API and less like a demo runtime.

### Why Koyeb fits this backend
- better for long-lived API services than a Space-style demo container
- cleaner FastAPI hosting with automatic `PORT`
- easier scaling and more predictable request handling for chat, uploads, and voice

### What is already ready in this repo
- root [Dockerfile](/C:/Users/ayush/Desktop/FINAL%20YEAR%20chat%20bot/Dockerfile) now works with dynamic `PORT`
- Whisper fallback runtime dependency `ffmpeg` is included
- root [.dockerignore](/C:/Users/ayush/Desktop/FINAL%20YEAR%20chat%20bot/.dockerignore) trims the deploy context
- backend health endpoint is available at `GET /health`

### Koyeb service settings
- Service type: `Web Service`
- Deployment method: `GitHub`
- Repository root: this repo
- Dockerfile path: `Dockerfile`
- Exposed HTTP port: leave default and let Koyeb provide `PORT`

### Environment variables to add in Koyeb
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_FALLBACK_MODELS`
- `HF_API_KEY`
- `HF_CHAT_MODEL`
- `HF_CODER_MODEL`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `WHISPER_MODEL`
- `TAVILY_API_KEY` if you use Tavily search
- `SERPER_API_KEY` if you use Serper search

### Frontend changes after backend move
- update Vercel `VITE_API_URL` to the new Koyeb backend URL
- redeploy the frontend

### Transfer checklist from Hugging Face to Koyeb
1. Push the latest repo to GitHub.
2. In Koyeb, create a new Web Service from this repository.
3. Point Koyeb at the root `Dockerfile`.
4. Add the backend environment variables listed above.
5. Deploy and wait for the service URL.
6. Open `https://your-koyeb-service/health` and confirm it returns `{\"status\":\"ok\"}`.
7. In Vercel, change `VITE_API_URL` to the Koyeb URL.
8. Redeploy the frontend.
9. Test chat, uploads, voice, and coding requests.

### Recommended cutover approach
- keep Hugging Face running during the move
- bring Koyeb up first
- switch Vercel only after `/health`, `/capabilities`, and one real chat request work
- then retire the old backend if everything is stable

## Local Development

### Frontend

```bash
cd rag-frontend
npm install
npm run dev
```

### Backend

```bash
cd docu_rag_backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Full local stack

```bash
cd rag-frontend
npm install
npm run start
```

## API Overview

### Main endpoints
- `GET /health`
- `GET /capabilities`
- `GET /documents/stats`
- `POST /ask`
- `POST /ask/stream`
- `POST /ask-general`
- `POST /ask-general/stream`
- `POST /upload`
- `DELETE /documents`
- `POST /clear-memory`
- `POST /transcribe`
- `POST /speech-query`

## Product Direction

This project is designed to evolve into a multi-provider AI operating layer, where one product can orchestrate the strongest model or tool for each task:

- deep reasoning
- coding assistance
- document analysis
- research
- multimodal input
- generation workflows

That means the right long-term path is not just “one model with a UI”, but a unified intelligence layer with:

- provider abstraction
- tool routing
- answer synthesis
- model fallback and resilience
- workspace memory

## Verification

Latest local verification completed for this repo:

- frontend production build passed with `npm run build`
- backend syntax compilation passed for the upgraded FastAPI service files

## Next Recommended Step

Open the live frontend link on Vercel and validate:

1. sign-in flow
2. chat mode switching
3. document upload and retrieval
4. streaming answer quality
5. voice query behavior
6. backend connectivity from Vercel to the selected backend host

## Maintainer

Built and evolving under Ayushman Pati's Gyana AI vision.
