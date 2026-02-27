from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class Fact(BaseModel):
    id: str
    content: str
    source: Optional[str] = None
    tier: str = 'Conversational'
    relevance_score: float = 0.5
    access_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed: datetime = Field(default_factory=datetime.utcnow)

class Edge(BaseModel):
    id: str
    source_node_id: str
    target_node_id: str
    relationship_type: str  # e.g., "ELABORATES_ON", "CONTRADICTS", "SYNTHESIZES"
    weight: float = 1.0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserPreference(BaseModel):
    key: str
    value: str

class DocumentMetadata(BaseModel):
    filename: str
    filetype: str
    chunk_index: int
