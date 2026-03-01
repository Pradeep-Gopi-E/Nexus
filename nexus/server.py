import os
import sys

# Auto-inject the project root into the path so FastMCP can find the 'nexus' module
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import contextlib
from mcp.server.fastmcp import FastMCP
from nexus.memory import MemoryStore
from nexus.knowledge import KnowledgeBase
from nexus.workflow import NexusWorkflow

# Core Components Initialized (Dependency Injection Pattern)
# CRITICAL FIX: ML libraries (like sentence-transformers) print loading logs to stdout.
# Because FastMCP uses stdio for JSON-RPC, any stray print corrupts the payload and crashes the IDE client.
# We strictly redirect all Python stdout to stderr during initialization.
with contextlib.redirect_stdout(sys.stderr):
    memory = MemoryStore()
    knowledge = KnowledgeBase()
    workflow = NexusWorkflow(memory, knowledge)

mcp = FastMCP("Nexus")

# The active project is persistently stored in SQLite so it survives process restarts
def _get_active_project(provided_id: str = None) -> str:
    return provided_id or memory.get_preference("mcp_active_project", "mcp_global")

import time
import random
import string

@mcp.tool()
def set_active_project(project_id: str, name: str = None) -> str:
    """
    Creates or sets the current active workspace/project that subsequent tool calls will default to.
    
    CRITICAL BEHAVIOR: 
    When you first start a new chat with the user, DO NOT instantly generate a new project. 
    You MUST first ask the user: "Do you have an existing Nexus Project ID you want to connect, or should I create a new one?"
    If they provide a `project_id`, you MUST pass that exact string to this tool.
    Only if they say "create a new one" should you generate a random string `proj_...` and pass it here.
    """
    if not project_id:
        timestamp = int(time.time() * 1000)
        random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
        project_id = f"proj_{timestamp}_{random_suffix}"

    # Look up the actual existing name to prevent the AI from echoing a generic fallback
    cursor = memory.conn.execute("SELECT name FROM projects WHERE id = ?", (project_id,))
    row = cursor.fetchone()
    
    if row:
        final_name = row['name']
    else:
        final_name = name if name else "Project Workspace"

    memory.ensure_project(project_id, final_name)
    memory.save_preference("mcp_active_project", project_id)
    return f"Active project set to '{final_name}' [ID: {project_id}]. Please note this ID for future calls."

@mcp.tool()
def ask_nexus(question: str, provider: str = "gemini", project_id: str = None) -> str:
    """
    Query Nexus on a research topic. This triggers a multi-step workflow.
    Valid providers: 'gemini', 'gpt-5.2', 'gpt-5.1', 'o3', 'gpt-5-mini'
    
    CRITICAL: If you do not yet know the user's active Project ID (because they haven't set one in this chat), 
    you MUST ask them for their Project ID BEFORE running this tool. Do not guess or generate one silently.
    """
    pid = _get_active_project(project_id)
    res = workflow.execute(pid, question, llm_provider=provider)
    
    # Run the background extraction loop to save cognitive facts from this chat into the Spiderweb Graph
    workflow.extract_memory_background(
        project_id=pid,
        question=question,
        answer=res["answer"],
        context=res.get("context", []),
        llm_provider=provider
    )
    
    return res["answer"]

@mcp.tool()
def memorize_preference(key: str, value: str) -> str:
    """
    Save user preferences into durable state (e.g. output format, preferred domains).
    """
    memory.save_preference(key, value)
    return f"Saved user preference: {key} = {value}"

@mcp.tool()
def store_fact(fact: str, source: str = "user", project_id: str = None) -> str:
    """
    Manually inject a core truth or instruction globally across sessions.
    """
    pid = _get_active_project(project_id)
    fact_id = memory.save_fact(pid, fact, source)
    return f"Fact confirmed and indexed. [ID: {fact_id}]"

@mcp.tool()
def ingest_document(filepath: str, project_id: str = None) -> str:
    """
    Ingest a local '.pdf' or '.md' file into the Chromadb Vector store.
    """
    if not os.path.isabs(filepath):
        return "Error: Please provide a valid absolute filepath."
        
    pid = _get_active_project(project_id)
    try:
        chunks = knowledge.ingest_document(pid, filepath)
        return f"Successfully ingested '{os.path.basename(filepath)}'. Vectorized into {chunks} chunks."
    except Exception as e:
        return f"Pipeline failed during ingestion: {str(e)}"

@mcp.tool()
def ingest_and_extract_file(filepath: str, project_id: str = None) -> str:
    """
    Holistic Pipeline: Parses a file, chunks it into Vector DB, and triggers the Workflow Extractor
    to map high-level "Genesis" facts and relationship edges into the Spiderweb Graph database.
    """
    if not os.path.isabs(filepath):
        return "Error: Please provide a valid absolute filepath."
        
    pid = _get_active_project(project_id)
    try:
        # 1. Vectorize
        chunks = knowledge.ingest_document(pid, filepath)
        
        # 2. Extract Graph Facts using the AI background loop
        # We simulate a "question" to trigger extraction logic on the purely contextual document.
        workflow.extract_memory_background(
            project_id=pid,
            question=f"I am providing a new document named {os.path.basename(filepath)}. Please extract all critical cognitive facts and relationships from it.",
            answer=f"I have received the document {os.path.basename(filepath)} and will extract knowledge.",
            context=[filepath],
            llm_provider="gemini"
        )
        return f"Holistic ingestion complete. Vectorized {chunks} chunks and triggered Spiderweb Graph extraction for {os.path.basename(filepath)}."
    except Exception as e:
        import traceback
        return f"Pipeline failed during ingestion/extraction: {str(e)}\n{traceback.format_exc()}"

@mcp.tool()
def get_cognitive_metrics(project_id: str = None) -> str:
    """
    Returns a breakdown of how many memories exist within each Cognitive Tier for a project.
    """
    pid = _get_active_project(project_id)
    facts = memory.get_all_memories(project_id=pid)
    
    tiers = {"Research": 0, "Project": 0, "Personal": 0, "Conversational": 0}
    for fact in facts:
        t = fact.get("tier", "Conversational")
        if t in tiers:
            tiers[t] += 1
        else:
            tiers["Conversational"] += 1
            
    total = sum(tiers.values())
    metrics_str = f"Cognitive Metrics for Project {pid} (Total Facts: {total})\n"
    for t, count in tiers.items():
        metrics_str += f"- {t}: {count}\n"
    return metrics_str

@mcp.tool()
def search_and_export_memory(query: str = None, tier: str = None, limit: int = 10, project_id: str = None) -> str:
    """
    Allows external AI clients to selectively query the SQLite Memory database.
    Returns a formatted JSON payload of Facts to dynamically inject into context windows.
    """
    import json
    pid = _get_active_project(project_id)
    
    # First get facts sorted by activation to prioritize high-value memory
    # Use memory.get_facts because it returns Fact objects with activation sorting
    facts_objs = memory.get_facts(pid, limit=1000, sort_by="activation")
    
    # Filter
    filtered_facts = []
    for f in facts_objs:
        if tier and f.tier.lower() != tier.lower():
            continue
        if query and query.lower() not in f.content.lower():
            continue
        filtered_facts.append({
            "id": f.id,
            "content": f.content,
            "tier": f.tier,
            "relevance": round(f.relevance_score, 2),
            "source": f.source
        })
        if len(filtered_facts) >= limit:
            break
            
    if not filtered_facts:
        return "No memories found matching your criteria."
        
    return json.dumps({
        "project_id": pid,
        "exported_facts_count": len(filtered_facts),
        "facts": filtered_facts
    }, indent=2)

if __name__ == "__main__":
    mcp.run()
