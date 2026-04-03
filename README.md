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
- currently Docker-ready for Hugging Face Spaces, Koyeb, or Google Cloud Run
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
- `docu_rag_backend` can deploy to Hugging Face Spaces, Koyeb, or Google Cloud Run
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

## Google Cloud Run Deployment

Google Cloud Run is the best low-cost/free-tier backend host for this project if you want a more stable API runtime than a Hugging Face Space.

### What is already ready in this repo
- root [Dockerfile](/C:/Users/ayush/Desktop/FINAL%20YEAR%20chat%20bot/Dockerfile) supports the dynamic `PORT` Cloud Run injects
- root [.dockerignore](/C:/Users/ayush/Desktop/FINAL%20YEAR%20chat%20bot/.dockerignore) keeps the build context lean
- root [cloudbuild.yaml](/C:/Users/ayush/Desktop/FINAL%20YEAR%20chat%20bot/cloudbuild.yaml) builds the backend container image in Google Cloud
- backend health endpoint is available at `GET /health`
- Whisper fallback dependency `ffmpeg` is included in the container

### Environment variables to configure in Cloud Run
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_FALLBACK_MODELS`
- `HF_API_KEY`
- `HF_CHAT_MODEL`
- `HF_CODER_MODEL`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `WHISPER_MODEL`
- optional: `TAVILY_API_KEY`
- optional: `SERPER_API_KEY`

### Fastest deployment path
1. Create a Google Cloud project.
2. Enable:
   - Cloud Run
   - Cloud Build
   - Artifact Registry
3. Install and log into `gcloud`.
4. From the repo root, run:

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud builds submit --config cloudbuild.yaml
gcloud run deploy gyana-backend \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/gyana-ai/backend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

5. In the Cloud Run service settings, add the environment variables listed above.
6. Open:

```bash
https://YOUR_CLOUD_RUN_URL/health
```

and confirm it returns:

```json
{"status":"ok"}
```

7. In Vercel, update:

```bash
VITE_API_URL=https://YOUR_CLOUD_RUN_URL
```

8. Redeploy the frontend.

### Recommended cutover approach
- keep Hugging Face running during the move
- deploy Cloud Run first
- confirm `/health`, `/capabilities`, one coding prompt, one upload flow, and one voice flow
- switch Vercel only after the backend checks pass
- retire the old backend after Cloud Run is stable

## Koyeb Deployment

Koyeb is still a valid paid alternative if you want a simpler managed app host than Google Cloud Run.

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
