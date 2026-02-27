import os
import sys

# Auto-inject the project root into the path so FastMCP can find the 'nexus' module
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from mcp.server.fastmcp import FastMCP
from nexus.memory import MemoryStore
from nexus.knowledge import KnowledgeBase
from nexus.workflow import NexusWorkflow

# Core Components Initialized (Dependency Injection Pattern)
memory = MemoryStore()
knowledge = KnowledgeBase()
workflow = NexusWorkflow(memory, knowledge)

# FastMCP Initialization - Exposing the interface
mcp = FastMCP("Nexus")

@mcp.tool()
def ask_nexus(question: str, provider: str = "gemini") -> str:
    """
    Query Nexus on a research topic. This triggers a multi-step workflow:
    Context retrieval -> Relevancy Evaluation -> Artifact Synthesis.
    The 'provider' can be 'gemini' or 'openai'. Default is gemini.
    """
    res = workflow.execute("mcp_global", question, llm_provider=provider)
    return res["answer"]

@mcp.tool()
def memorize_preference(key: str, value: str) -> str:
    """
    Save user preferences into durable state (e.g. output format, preferred domains).
    """
    memory.save_preference(key, value)
    return f"Saved user preference: {key} = {value}"

@mcp.tool()
def store_fact(fact: str, source: str = "user") -> str:
    """
    Manually inject a core truth or instruction globally across sessions.
    """
    fact_id = memory.save_fact("mcp_global", fact, source)
    return f"Fact confirmed and indexed. [ID: {fact_id}]"

@mcp.tool()
def ingest_document(filepath: str) -> str:
    """
    Ingest a local '.pdf' or '.md' file into the Chromadb Vector store.
    Provides document context for future queries. Include the absolute path.
    """
    if not os.path.isabs(filepath):
        return "Error: Please provide a valid absolute filepath."
        
    try:
        chunks = knowledge.ingest_document("mcp_global", filepath)
        return f"Successfully ingested '{os.path.basename(filepath)}'. Vectorized into {chunks} chunks."
    except Exception as e:
        return f"Pipeline failed during ingestion: {str(e)}"

# The entrypoint for the MCP Server via stdio
if __name__ == "__main__":
    mcp.run()
