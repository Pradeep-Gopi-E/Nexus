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

import fitz
import base64
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

@tool
def extract_images_from_pdf(project_id: str, filename: str, page_number: int) -> str:
    """
    Extracts and describes all images/diagrams from a specific page of an uploaded PDF document.
    Use this on-demand when the user asks about an image or diagram in a PDF.
    - project_id: The ID of the current active project.
    - filename: The exact name of the uploaded PDF file (e.g. 'architecture.pdf').
    - page_number: The 1-indexed page number to extract images from.
    """
    try:
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        pdf_path = os.path.join(project_root, "data", project_id, "documents", filename)
        
        if not os.path.exists(pdf_path):
            return f"Error: The file '{filename}' could not be found in the current project."
            
        doc = fitz.open(pdf_path)
        
        # Adjust for 0-indexed PyMuPDF
        page_idx = page_number - 1
        if page_idx < 0 or page_idx >= len(doc):
            return f"Error: Page {page_number} is out of bounds for '{filename}'."
            
        page = doc[page_idx]
        image_list = page.get_images(full=True)
        
        if not image_list:
            return f"No images or diagrams found on page {page_number} of '{filename}'."
            
        try:
            vision_llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=os.environ.get("GOOGLE_API_KEY"))
        except Exception as e:
            return f"Error initializing Vision API: {e}"
        
        prompt_content = [
            {"type": "text", "text": (
                "You are an expert technical data extractor. Look at the following diagrams/charts/photos from a document page. Convert the visual data into highly structured, factual text. "
                "CRITICAL REQUIREMENT: Do NOT use phrases like 'The image shows'. Describe the architecture, data, and literal facts directly."
            )}
        ]
        
        valid_images = 0
        for img_info in image_list:
            xref = img_info[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            image_ext = base_image["ext"]
            
            encoded_image = base64.b64encode(image_bytes).decode("utf-8")
            prompt_content.append({"type": "image_url", "image_url": {"url": f"data:image/{image_ext};base64,{encoded_image}"}})
            valid_images += 1
            
        if valid_images == 0:
            return "Failed to extract valid images from the page."
            
        message = HumanMessage(content=prompt_content)
        response = vision_llm.invoke([message])
        
        return f"[Visual Context for {filename} Page {page_number}]:\n" + response.content.strip()
        
    except Exception as e:
        return f"An error occurred while extracting images: {str(e)}"
