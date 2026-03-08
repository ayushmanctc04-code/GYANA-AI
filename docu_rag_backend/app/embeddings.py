from sentence_transformers import SentenceTransformer
import numpy as np

# Load embedding model once
model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


def embed_text(texts):
    """
    Takes list of texts
    Returns numpy array of embeddings (float32)
    """
    embeddings = model.encode(texts)
    return np.array(embeddings).astype("float32")