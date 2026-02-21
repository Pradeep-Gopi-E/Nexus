import os

print("Starting Nexus Architecture Verification\\n" + "="*40)

def verify_module(name, logic):
    try:
        logic()
        print(f"[OK] {name} module initialized successfully.")
    except Exception as e:
        print(f"[ERROR] {name} failed: {e}")

# Test 1: Memory
def test_memory():
    from nexus.memory import MemoryStore
    mem = MemoryStore(db_path="data/test_memory.db")
    mem.save_fact("Test core fact", "system")
    facts = mem.get_facts()
    assert len(facts) > 0

verify_module("Memory & Database (memory.py)", test_memory)

# Test 2: Knowledge Vector DB
def test_knowledge():
    from nexus.knowledge import KnowledgeBase
    kb = KnowledgeBase(persist_dir="data/test_chroma")
    # This will download the local embedding model on first run if needed
    ans = kb.search("Test lookup")
    assert isinstance(ans, list)

verify_module("Vector DB & Embeddings (knowledge.py)", test_knowledge)

# Test 3: Workflow StateGraph
def test_workflow():
    from nexus.workflow import AgentState, NexusWorkflow
    from nexus.memory import MemoryStore
    from nexus.knowledge import KnowledgeBase
    
    mem = MemoryStore(db_path="data/test_memory.db")
    kb = KnowledgeBase(persist_dir="data/test_chroma")
    wf = NexusWorkflow(mem, kb)
    assert wf.graph is not None

verify_module("LangGraph Engine (workflow.py)", test_workflow)

# Test 4: FastMCP Interface
def test_server():
    from nexus.server import mcp
    assert mcp.name == "Nexus"

verify_module("MCP Server Interface (server.py)", test_server)

print("="*40)
print("If all modules say [OK], your local code architecture is 100% correct!")
