from app.document_loader import load_document
from docu_rag_backend.app.services.rag_service import add_documents_to_vectorstore

def process_file(file_path):
    try:
        documents = load_document(file_path)
        add_documents_to_vectorstore(documents)
        print(f"{file_path} processed successfully.")
    except Exception as e:
        print(f"Error processing {file_path}: {str(e)}")