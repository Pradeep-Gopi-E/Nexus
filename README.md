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
    *   **REST API / Web UI:** A high-performance `FastAPI` backend serving a custom, glassmorphic Vanilla JS frontend for isolated workspace management.
    *   **MCP Server:** Exposes the underlying tools dynamically to external clients (Claude Desktop, Cursor, VS Code) using `fastmcp`.

---

## ✨ Key Features & Capabilities

*   **Isolated Workspace Environments (Project Scoping):** Unlike standard linear chats, Nexus supports parallel, isolated project sessions. Each session maintains its own specific vector embeddings, chat history, and contextual core memory.
*   **Dynamic Context Filtering:** Users can toggle which ingested documents (`.pdf`, `.md`) should be actively included in the RAG retrieval phase per query, ensuring high-fidelity, targeted answers.
*   **Autonomous Memory Extraction:** Through a specialized LangGraph node, Nexus analyzes conversational exchanges on-the-fly to extract enduring facts and preferences natively, storing them as discrete "Core Memories" without requiring explicit user commands.
*   **Aesthetic & Frictionless UI:** A custom-built, lightweight web interface utilizing modern CSS design principles (blur backdrops, zero-prompt modal transitions, and dynamic SVG icons) designed for distraction-free analytical research.
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
*   **Frontend UI:** Vanilla JavaScript, HTML5, Vanilla CSS3 (Custom Design System)
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

When operating as an MCP Server, Nexus exposes the following cognitive APIs:

*   `ask_nexus(question, provider="gemini")`: Triggers the LangGraph reasoning loop. Retrieves context, evaluates it, and synthesizes an answer based on the global state.
*   `ingest_document(filepath)`: Parses a local document, chunks it, and embeds it into the ChromaDB vector store.
*   `store_fact(fact, source="user")`: Bypasses dynamic extraction to force-inject a core truth into the persistent SQLite state.
*   `memorize_preference(key, value)`: Modifies operational parameters directly in the database.
