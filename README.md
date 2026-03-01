<div align="center">
  <img src="web/static/logo.svg" alt="Nexus Logo" width="200"/>
  <h1>Nexus</h1>
  <p>Production-Ready Agentic Research Environment</p>

  <img src="placeholder_image_web_ui.png" alt="Nexus Web UI" width="800"/>
</div>

Nexus is a context-aware AI research assistant with durable long-term memory and workspace isolation. It functions as both a Model Context Protocol (MCP) server and a standalone web application for complex reasoning workflows.

## ✨ Features
- **Multi-Tier Memory Engine:** Automatically extracts and categorizes facts into Research, Project, Personal, and Conversational tiers.
- **Spiderweb Knowledge Graph:** Visualizes semantic relationships dynamically with D3.js.
- **Workspace Isolation:** Maintains separate vector embeddings and chat histories across different projects.
- **Multi-Provider Support:** Seamlessly integrates with Google Gemini and OpenAI models.

<div align="center">
  <video src="node_demo.mp4" width="800" autoplay loop muted playsinline></video>
</div>

## 🛠️ Tech Stack
- **Backend:** FastAPI, LangGraph, LangChain, Pydantic
- **Database:** ChromaDB (Vector), SQLite (Cognitive State)
- **Models:** Sentence-Transformers, Google Gemini, OpenAI GPT
- **Frontend:** Vanilla JS, Tailwind CSS, D3.js (Visuals)
- **Protocols:** MCP, FastMCP

## � Quickstart

### Installation
Ensure you have Python 3.9+ installed.

```bash
git clone <repository-url>
cd Nexus
python -m venv nexus
.\nexus\Scripts\Activate.ps1  # Windows
# source nexus/bin/activate   # Linux/Mac
pip install -r requirements.txt
```

### Configuration
Create a `.env` file in the project root:
```env
GOOGLE_API_KEY="your-gemini-key-here"
OPENAI_API_KEY="your-openai-key-here"
```

## 🎮 Deployment

### Web Application (Standalone)
Launch the full UI with visual memory management:
```bash
.\nexus\Scripts\python.exe -m uvicorn nexus.web:app --host 0.0.0.0 --port 8000
```
*Navigate to `http://localhost:8000`*

### MCP Server (Headless)
Expose Nexus directly to IDEs like Cursor, VS Code, or Claude Desktop.

**Client Configuration:**
- **Command:** `[Absolute Path]\nexus\Scripts\python.exe`
- **Args:** `[Absolute Path]\nexus\server.py`

<div align="center">
  <video src="MCP_demo.mp4" width="800" autoplay loop muted playsinline></video>
</div>
