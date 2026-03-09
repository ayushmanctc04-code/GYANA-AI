FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY docu_rag_backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY docu_rag_backend/ .

# Create uploads directory
RUN mkdir -p uploads

# Hugging Face Spaces runs on port 7860
EXPOSE 7860

# Start the app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
