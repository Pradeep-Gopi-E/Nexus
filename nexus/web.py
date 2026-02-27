import os
import sys

# Auto-inject the project root into the path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional, List

# Internal Nexus imports
from nexus.memory import MemoryStore
from nexus.knowledge import KnowledgeBase
from nexus.workflow import NexusWorkflow

# Initialize Core Services
memory = MemoryStore()
knowledge = KnowledgeBase()
workflow = NexusWorkflow(memory, knowledge)

app = FastAPI(title="Nexus Web UI")

# Mount Static Files and Templates
static_dir = os.path.join(project_root, "web", "static")
templates_dir = os.path.join(project_root, "web", "templates")

# Ensure directories exist
os.makedirs(static_dir, exist_ok=True)
os.makedirs(os.path.join(static_dir, "css"), exist_ok=True)
os.makedirs(os.path.join(static_dir, "js"), exist_ok=True)
os.makedirs(templates_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

# Data Models
class ChatRequest(BaseModel):
    project_id: str
    project_name: str
    question: str
    provider: str = "gemini"
    selected_documents: list[str] = []
    images: list[str] = []

class FactRequest(BaseModel):
    project_id: str
    fact: str
    source: str = "user"

class FactUpdateRequest(BaseModel):
    content: str = None
    tier: str = None


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/projects")
async def get_projects():
    projects = memory.get_projects()
    return {"projects": projects}

@app.post("/api/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    try:
        # Save or touch the project naming in SQL on first interaction
        memory.ensure_project(request.project_id, request.project_name)
        
        # Trigger the LangGraph Reasoning Loop
        response = workflow.execute(
            request.project_id, 
            request.question, 
            llm_provider=request.provider,
            selected_documents=request.selected_documents,
            images=request.images
        )
        
        # Trigger background memory extraction to speed up UI response
        if response and response.get("answer"):
            background_tasks.add_task(
                workflow.extract_memory_background,
                request.project_id,
                request.question,
                response["answer"],
                response.get("context", []),
                request.provider,
                request.images
            )
            
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload")
async def upload_file(project_id: str = Form(...), file: UploadFile = File(...)):
    if not file.filename.endswith((".pdf", ".md", ".xlsx", ".csv", ".doc", ".docx", ".ppt", ".pptx")):
        raise HTTPException(status_code=400, detail="Unsupported file format.")
    
    # Save temp file
    temp_path = os.path.join(project_root, "data", "temp_uploads")
    os.makedirs(temp_path, exist_ok=True)
    file_path = os.path.join(temp_path, file.filename)
    
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    try:
        # Ingest to ChromaDB under the specific project
        chunks = knowledge.ingest_document(project_id, file_path)
        # Clean up
        os.remove(file_path)
        return {"message": f"Successfully ingested {file.filename} into {chunks} logical chunks."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/memory")
async def get_memory(project_id: str, sort_by: str = "chronological"):
    facts = memory.get_facts(project_id, sort_by=sort_by)
    return {"facts": [dict(fact) for fact in facts]}

@app.post("/api/memory")
async def add_memory(request: FactRequest):
    memory.save_fact(request.project_id, request.fact, request.source)
    return {"message": "Fact saved successfully."}

@app.put("/api/memory/{fact_id}")
async def update_memory(fact_id: str, request: FactUpdateRequest):
    success = memory.update_memory(fact_id, content=request.content, tier=request.tier)
    if not success:
        raise HTTPException(status_code=404, detail="Fact not found or no updates provided.")
    return {"message": "Fact updated successfully."}

@app.delete("/api/memory/{fact_id}")
async def delete_memory(fact_id: str):
    memory.delete_fact(fact_id)
    return {"message": "Fact deleted successfully."}

@app.get("/api/knowledge")
async def get_knowledge_base(project_id: Optional[str] = None):
    """Returns a full structured snapshot of memories optionally scoped to a project."""
    all_facts = memory.get_all_memories(project_id=project_id)
    return {"knowledge": all_facts}

@app.get("/api/edges")
async def get_knowledge_edges(project_id: Optional[str] = None):
    """Returns the topological edge relationships for the memory graph."""
    edges = memory.get_edges(project_id=project_id)
    return {"edges": edges}

class EdgeRequest(BaseModel):
    project_id: str
    source_node_id: str
    target_node_id: str
    relationship_type: str
    weight: float = 1.0

@app.post("/api/edges")
async def add_knowledge_edge(request: EdgeRequest):
    edge_id = memory.add_edge(
        request.project_id, 
        request.source_node_id, 
        request.target_node_id, 
        request.relationship_type, 
        request.weight
    )
    return {"message": "Edge created successfully.", "id": edge_id}


@app.get("/api/documents")
async def get_documents(project_id: str):
    docs = knowledge.get_documents(project_id)
    return {"documents": docs}

@app.get("/api/history")
async def get_history(project_id: str):
    history = memory.get_history(project_id, limit=20) # Return last 20 messages for the chat UI
    return {"history": history}

@app.delete("/api/documents/{project_id}/{filename}")
async def delete_document(project_id: str, filename: str):
    try:
        knowledge.delete_document(project_id, filename)
        return {"message": f"Document {filename} deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ResetRequest(BaseModel):
    project_id: str = None

@app.post("/api/reset")
async def reset_project(request: ResetRequest):
    try:
        memory.reset(request.project_id)
        knowledge.reset(request.project_id)
        return {"message": "Project state cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("nexus.web:app", host="0.0.0.0", port=8000, reload=True)
