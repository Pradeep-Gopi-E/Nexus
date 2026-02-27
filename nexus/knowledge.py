import os
import chromadb
import fitz  # PyMuPDF
from typing import List
from sentence_transformers import SentenceTransformer
from markitdown import MarkItDown

class KnowledgeBase:
    """Vector Database and Document Ingestion Pipeline."""
    
    def __init__(self, persist_dir: str = "data/chroma_db"):
        os.makedirs(persist_dir, exist_ok=True)
        # Using ChromaDB for robust local persistence of embeddings
        self.client = chromadb.PersistentClient(path=persist_dir)
        self.collection = self.client.get_or_create_collection("nexus_docs")
        
        # Local, lightweight, fast embedding model via HuggingFace
        self.encoder = SentenceTransformer("all-MiniLM-L6-v2")

    def ingest_document(self, project_id: str, filepath: str) -> int:
        """Extracts text from PDF/MD, chunks it, and saves to ChromaDB under a project."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

        filename = os.path.basename(filepath)
        chunks = []
        metadatas = []
        ids = []

        if filepath.lower().endswith('.pdf'):
            doc = fitz.open(filepath)
            # Extracted by page; ideally mapped to a RecursiveCharacterTextSplitter for precision
            for page_num in range(len(doc)):
                text = doc[page_num].get_text("text")
                if text.strip():
                    chunks.append(text)
                    metadatas.append({"filename": filename, "page": page_num, "project_id": project_id})
                    ids.append(f"{project_id}_{filename}_page_{page_num}")
        elif filepath.lower().endswith('.md'):
            with open(filepath, 'r', encoding='utf-8') as f:
                text = f.read()
                # Basic chunking by paragraph limit for MD
                paragraphs = text.split('\\n\\n')
                for i, para in enumerate(paragraphs):
                    if para.strip():
                        chunks.append(para)
                        metadatas.append({"filename": filename, "chunk": i, "project_id": project_id})
                        ids.append(f"{project_id}_{filename}_chunk_{i}")
        elif filepath.lower().endswith(('.xlsx', '.csv', '.ppt', '.pptx', '.doc', '.docx')):
            # General file handler via MarkItDown
            md = MarkItDown()
            result = md.convert(filepath)
            text = result.text_content
            # Basic chunking by paragraph
            paragraphs = text.split('\n\n')
            for i, para in enumerate(paragraphs):
                if para.strip():
                    chunks.append(para)
                    metadatas.append({"filename": filename, "chunk": i, "project_id": project_id})
                    ids.append(f"{project_id}_{filename}_chunk_{i}")
        else:
            raise ValueError("Unsupported file format. App supports .pdf, .md, .xlsx, .csv, and office formatting.")

        if chunks:
            # Batch encoding for speed
            embeddings = self.encoder.encode(chunks).tolist()
            self.collection.add(
                documents=chunks,
                embeddings=embeddings,
                metadatas=metadatas,
                ids=ids
            )
            
        return len(chunks)

    def search(self, project_id: str, query: str, top_k: int = 3, filter_filenames: List[str] = None) -> List[str]:
        """Retrieves the most relevant document chunks based on semantic similarity for a project."""
        query_embedding = self.encoder.encode([query]).tolist()
        
        where_clause = {"project_id": project_id}
        if filter_filenames:
            # ChromaDB advanced syntax for filtering by specific filenames
            where_clause = {
                "$and": [
                    {"project_id": project_id},
                    {"filename": {"$in": filter_filenames}}
                ]
            }

        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=top_k,
            where=where_clause
        )
        
        if not results["documents"]:
            return []
        return results["documents"][0]

    def get_documents(self, project_id: str) -> List[str]:
        """Returns a list of unique filenames currently stored for a project."""
        # Note: ChromaDB get() where clauses require specific format
        data = self.collection.get(where={"project_id": project_id}, include=["metadatas"])
        filenames = set()
        if data and "metadatas" in data and data["metadatas"]:
            for meta in data["metadatas"]:
                if meta and "filename" in meta:
                    filenames.add(meta["filename"])
        return sorted(list(filenames))

    def delete_document(self, project_id: str, filename: str):
        """Deletes all chunks associated with a specific filename in a project."""
        self.collection.delete(where={"$and": [{"filename": filename}, {"project_id": project_id}]})

    def reset(self, project_id: str = None):
        """Wipes the entire vector database collection, or just one project."""
        if project_id:
            self.collection.delete(where={"project_id": project_id})
        else:
            self.client.delete_collection("nexus_docs")
            self.collection = self.client.create_collection("nexus_docs")
