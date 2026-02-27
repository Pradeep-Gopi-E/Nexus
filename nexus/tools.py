from typing import Any
from langchain_core.tools import tool
from langchain_experimental.tools.python.tool import PythonAstREPLTool
from langchain_tavily import TavilySearch
import os

# Safe Python Sandbox Tool
# PythonAstREPLTool evaluates python commands using an AST evaluator and doesn't allow many dangerous builtins
python_repl_tool = PythonAstREPLTool()

# Live Web Search Tool using Tavily
# We instantiate this tool passing max_results
def get_search_tool(max_results: int = 3) -> TavilySearch:
    # Requires TAVILY_API_KEY environment variable to be set
    return TavilySearch(max_results=max_results)
