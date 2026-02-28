# Nexus AI: Production-Ready Agentic Research Environment

Nexus is an advanced, context-aware AI research assistant designed with a focus on **agentic autonomy, durable long-term memory, and workspace isolation**. It serves dual purposes: as a stateful, agentic backend for LLM clients via the **Model Context Protocol (MCP)**, and as a fully-featured standalone web application for deep reasoning workflows.

Built with modularity and production readiness in mind, Nexus orchestrates complex reasoning loops, intelligently managing retrieved context, core memories, and specific session states.

---

## 🧠 Core Architecture

Nexus is built upon a robust, multi-layered architecture:

1. **The Orchestration Engine (Workflows):** Powered by `LangGraph`, this stateful, cyclic reasoning engine manages the agent's flow. It autonomously handles routing between retrieval, evaluation, synthesis, and memory extraction nodes, supporting multiple LLM providers (Google Gemini, OpenAI GPT-4o).
2. **The Knowledge Graph (Vector DB):** A Retrieval-Augmented Generation (RAG) pipeline utilizing `ChromaDB` and local `SentenceTransformers` (`all-MiniLM-L6-v2`) to dynamically ingest, chunk, and embed local PDFs and Markdown files.
3. **The Cognitive State (Persistence):** A durable `SQLite` datastore structured with strict `Pydantic` schemas. It manages user preferences and autonomously extracts and stores "Core Memories" across different isolated projects.
4. **The Interfaces:** 
    *   **REST API / Web UI:** A high-performance `FastAPI` backend serving a custom, glassmorphic Vanilla JS frontend built with Tailwind CSS. Included are dedicated REST endpoints for the Knowledge Base (`GET /api/knowledge`, `GET /api/edges`) enabling dynamic graph visualization across isolated workspaces.
    *   **MCP Server:** Exposes the underlying tools dynamically to external clients (Claude Desktop, Cursor, VS Code) using `fastmcp`.

---

## ✨ Key Features & Capabilities (Nexus 2.0)

*   **Multi-Tier Cognitive Memory Engine:** Nexus doesn't just store flat text. The background extraction agent evaluates the depth of thought and assigns specific Cognitive Tiers (Research, Project, Personal, Conversational). A multi-dimensional engine calculates organic time decay and logarithmic access frequency to rank memories by true relevance.
*   **Spiderweb Graph Database:** Powered by the backend `SQLite` edges table and the frontend `D3.js` force-directed physics engine, Nexus evaluates semantic similarity to automatically draw "Branching" and "Convergence" connections between facts, mapping complex relationship topologies.
*   **Knowledge Base Dashboard:** A premium, Stitch-generated glassmorphic UI integrated alongside the Reasoning Engine. Features real-time search filtering, dynamic project scoping, and inline fact editing directly bridged to the persistent graph store.
*   **Nebula Visual Data Mapping:** The interactive Mind Map features a stunning deep-space animated Nebula CSS background with dynamic, degree-centrality sized interactive SVG nodes, curved flowing Bezier link paths, and typography-rich HTML labels.
*   **Isolated Workspace Environments (Project Scoping):** Unlike standard linear chats, Nexus supports parallel, isolated project sessions. Each session maintains its own specific vector embeddings, chat history, and contextual core memory.
*   **Dynamic Context Filtering:** Users can toggle which ingested documents (`.pdf`, `.md`) should be actively included in the RAG retrieval phase per query, ensuring high-fidelity, targeted answers.
*   **Autonomous Memory Extraction:** Through a specialized LangGraph node, Nexus analyzes conversational exchanges on-the-fly to extract enduring facts and preferences natively, storing them as discrete "Core Memories" without requiring explicit user commands.
*   **Multi-Provider LLM Support:** Seamlessly switch between Google Gemini (`gemini-1.5-pro`, `gemini-1.5-flash`) and OpenAI (`gpt-4o`) mid-conversation depending on the required cognitive load.

---

## 🛠️ Technology Stack

*   **Backend framework:** `FastAPI`, `uvicorn`
*   **Agentic Routing:** `langgraph`, `langchain-core`
*   **LLM Integration:** `langchain-google-genai`, `langchain-openai`
*   **Vector Database:** `chromadb` (Local Persistence)
*   **Embedding Model:** `sentence-transformers`
*   **Document Parsing:** `PyMuPDF` (fitz)
*   **Data Validation:** `pydantic`
*   **Frontend Data Science UI:** Vanilla JavaScript, HTML5, Tailwind CSS
*   **Graph Visualizations:** `D3.js` (Force-Directed Physics Engine)
*   **Protocol Standards:** `mcp`, `fastmcp` (v3.0+)

---

## 🚀 Setup & Installation

### 1. Initialize the Environment
Ensure you have Python 3.9+ installed.

```bash
# Clone the repository
git clone <repository-url>
cd Nexus

# Create a virtual environment
python -m venv nexus

# Activate the environment (Windows PowerShell)
.\nexus\Scripts\Activate.ps1
# (Or on Linux/Mac: source nexus/bin/activate)

# Install strict dependencies
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Nexus routes intelligently based on your configured providers. Create a `.env` file in the root directory:

```env
GOOGLE_API_KEY="your-gemini-key-here"
OPENAI_API_KEY="your-openai-key-here"
```

---

## 🎮 Deployment Methods

Nexus operates through two primary modalities depending on the required use case.

### Modality A: The Advanced Web Application (Recommended)
Launch the standalone server to access the full suite of UI features, workspace isolation, and visual memory management.

```bash
# Ensure your virtual environment is active
.\nexus\Scripts\python.exe -m uvicorn nexus.web:app --host 0.0.0.0 --port 8000
```
*Navigate to `http://localhost:8000` in your browser.*

### Modality B: Headless MCP Server Integration
Expose Nexus tools directly to a parent AI coding assistant (like Cursor or VS Code's Roo Code).

**VS Code Configuration (Roo Code / Cline):**
1. Open the MCP Settings panel.
2. Click **Add New Server** and configure:
   * **Name**: Nexus
   * **Type**: `stdio`
   * **Command**: `[Absolute Path to Repo]\nexus\Scripts\python.exe`
   * **Arguments**: `[Absolute Path to Repo]\nexus\server.py`

**Claude Desktop Configuration:**
Add the following to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "nexus_ai": {
      "command": "C:\\Absolute\\Path\\To\\Nexus\\nexus\\Scripts\\python.exe",
      "args": ["C:\\Absolute\\Path\\To\\Nexus\\nexus\\server.py"]
    }
  }
}
```

---

## 🧩 MCP Tool Exposure

When operating as an MCP Server, Nexus exposes the following cognitive APIs natively to your IDE:

*   `set_active_project(project_id, name)`: Creates or sets the active workspace context. All subsequent tools execute exclusively within this project scope.
*   `ask_nexus(question, provider="gemini")`: Triggers the LangGraph reasoning loop. Retrieves context, evaluates it, and synthesizes answers natively from the active workspace.
*   `ingest_and_extract_file(filepath)`: The holistic ingestion pipeline. Parses `.pdf`, `.md`, or images, chunks to ChromaDB, and triggers the `NexusWorkflow` background reasoning agent to physically extract "Genesis" facts and relationship edges into the Spiderweb Graph database.
*   `get_cognitive_metrics()`: Queries the graph density to see exactly how many facts currently exist in the Research, Project, Personal, or Conversational dimension for the active workspace.
*   `search_and_export_memory(query, tier, limit)`: A surgical memory exporter. Intelligently pulls selectively filtered JSON payloads (e.g., `tier="Research"` or `limit=10`) from the SQLite database straight into the IDE's context window, preventing generalized token overflow while granting it deep architectural knowledge.

---
## 🕸️ Knowledge Graph Endpoints (REST)
When accessing Nexus via its local web application interface, the following backend endpoints power the visual Mind Map D3.js engine:
*   `GET /api/knowledge?project_id={id}`: Retrieves all cognitive facts parsed by the LLM natively associated with the specified scoping token. Returns relevance_score, cognitive tier, and time-decay metadata.
*   `GET /api/edges?project_id={id}`: Retrieves the Spiderweb semantic topology mapping nodes to each other via relationship_types (e.g. `ELABORATES_ON`, `SYNTHESIZES`).
*   `PUT /api/memory/{project_id}/{memory_id}`: Overwrites cognitive facts and their assigned tiers manually.
