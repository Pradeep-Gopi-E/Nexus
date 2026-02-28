from typing import TypedDict, Annotated, List, Dict, Any
import operator
import os
import json
import traceback

from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_core.messages import SystemMessage, HumanMessage, AnyMessage, AIMessage
from dotenv import load_dotenv

from nexus.memory import MemoryStore
from nexus.knowledge import KnowledgeBase
from nexus.tools import python_repl_tool, get_search_tool, extract_images_from_pdf

# Load all environment variables from .env file immediately
load_dotenv()

# Define the highly-typed semantic state of our agentic workflow
class AgentState(TypedDict):
    project_id: str
    question: str
    llm_provider: str
    selected_documents: List[str]
    context: List[str]
    facts: List[str]
    new_facts: List[str]
    images: List[str]
    messages: Annotated[list[AnyMessage], operator.add]
    reasoning: str
    answer: str
    status: str

class NexusWorkflow:
    """Graph-based workflow engine handling multi-step agentic reasoning with tools."""
    
    def __init__(self, memory: MemoryStore, knowledge: KnowledgeBase):
        self.memory = memory
        self.knowledge = knowledge
        
        # Initialize our Tool Belt (Python AST Sandbox & Live Web Search & Image Extraction)
        self.tools = [python_repl_tool, get_search_tool(max_results=3), extract_images_from_pdf]
        self.graph = self._build_graph()

    def _get_llm(self, provider: str, bind_tools: bool = True):
        """Retrieve the correct LLM model dynamically."""
        if provider.lower() == "gemini":
            from langchain_google_genai import ChatGoogleGenerativeAI
            # Requires GOOGLE_API_KEY in environment
            llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.2)
        else:
            from langchain_openai import ChatOpenAI
            # Requires OPENAI_API_KEY in environment
            model_name = provider.lower()
            if model_name == "openai" or model_name not in ["gpt-5.2", "gpt-5.1", "o3", "gpt-5-mini", "o4-mini", "gpt-4o"]:
                model_name = "gpt-5.2"  # Default to 5.2 if generic "openai" or unknown
            
            # o1, o3, etc., may not support temperature parameter in the same way, but Langchain 
            # usually handles the mapping gracefully. We'll set temperature where safe.
            if model_name.startswith("o"):
                llm = ChatOpenAI(model=model_name)
            else:
                llm = ChatOpenAI(model=model_name, temperature=0.2)
            
        if bind_tools:
            return llm.bind_tools(self.tools)
        return llm

    def _retrieve_node(self, state: AgentState) -> Dict[str, Any]:
        """Retrieve relevant context from the vector DB and structured facts from memory."""
        project_id = state["project_id"]
        question = state["question"]
        doc_filters = state.get("selected_documents", [])
        
        docs = self.knowledge.search(project_id, question, filter_filenames=doc_filters)
        
        # Sort by activation score to get the most cognitively relevant facts
        raw_facts = self.memory.get_facts(project_id, limit=5, sort_by="activation")
        
        # Update access frequency metrics for the selected facts
        if raw_facts:
            self.memory.update_access([f.id for f in raw_facts])
            
        facts = [f.content for f in raw_facts]
        
        return {"context": docs, "facts": facts, "status": "retrieved"}

    def _evaluate_node(self, state: AgentState) -> Dict[str, Any]:
        """Evaluate if context is sufficient. (Ready for LLM-Judge integration)"""
        return {"status": "context_ok"}

    def _synthesize_node(self, state: AgentState) -> Dict[str, Any]:
        """Synthesize the final answer or decide to use tools."""
        context_str = "\n".join(state.get("context", []))
        facts_str = "\n".join(state.get("facts", []))
        
        system_prompt = (
            "You are Nexus, a highly intelligent multimodal research assistant.\n"
            "You can execute Python scripts, Search the live web, and extract images directly from uploaded PDFs on-demand.\n"
            "CRITICAL: If the user explicitly asks to SEE, EXPLAIN, OR DESCRIBE an image, diagram, or chart from a PDF, you MUST use the `extract_images_from_pdf` tool. "
            f"Pass their active project_id ('{state['project_id']}'), the filename (found in context), and the requested page number.\n\n"
            f"**Vector Document Context:**\n{context_str}\n\n"
            f"**Global Memory Facts (Core Memories):**\n{facts_str}"
        )
        
        # We place the SystemMessage dynamically at the front before calling LLM
        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        
        provider = state.get("llm_provider", "openai")
        llm = self._get_llm(provider, bind_tools=True)
        response = llm.invoke(messages)
        
        # Return the AI message to be appended to the messages array
        return {"messages": [response], "status": "synthesis_step"}

    def _extract_memory_node(self, state: AgentState) -> Dict[str, Any]:
        """Automatically format the final response and add it to the chat history."""
        # Get the final AI text response (handle multimodal dict lists)
        raw_content = state["messages"][-1].content if state["messages"] else ""
        answer = ""
        
        if isinstance(raw_content, list):
            # Vision models often return [{"type": "text", "text": "actual string"}, ...]
            answer_parts = []
            for item in raw_content:
                if isinstance(item, dict) and item.get("type") == "text":
                    answer_parts.append(item.get("text", ""))
                elif isinstance(item, str):
                    answer_parts.append(item)
            answer = "".join(answer_parts)
        else:
            answer = str(raw_content)
        
        if answer:
            self.memory.add_message(state["project_id"], "assistant", str(answer))
            
        return {"answer": str(answer), "status": "complete"}

    def _build_graph(self):
        """Constructs the state machine for Nexus routines implementing ReAct."""
        workflow = StateGraph(AgentState)
        
        # Add workflow nodes
        workflow.add_node("retrieve", self._retrieve_node)
        workflow.add_node("evaluate", self._evaluate_node)
        workflow.add_node("synthesize", self._synthesize_node)
        workflow.add_node("tools", ToolNode(self.tools))
        workflow.add_node("extract_memory", self._extract_memory_node)
        
        # Define the reasoning flow edges
        workflow.set_entry_point("retrieve")
        workflow.add_edge("retrieve", "evaluate")
        
        workflow.add_conditional_edges(
            "evaluate",
            lambda x: "synthesize" if x["status"] == "context_ok" else END,
            {
                "synthesize": "synthesize",
                END: END
            }
        )
        
        # After synthesize, if the model returned tool calls, go to "tools", else "extract_memory"
        workflow.add_conditional_edges(
            "synthesize",
            tools_condition,
            {
                "tools": "tools",
                END: "extract_memory"
            }
        )
        
        # Tools always route back to synthesize to evaluate their outputs
        workflow.add_edge("tools", "synthesize")
        workflow.add_edge("extract_memory", END)
        
        return workflow.compile()

    def execute(self, project_id: str, question: str, llm_provider: str = "openai", selected_documents: List[str] = None, images: List[str] = None) -> dict:
        """Trigger the execution of the computational graph."""
        
        # Save image to history UI by appending an img tag 
        history_question = question
        if images and len(images) > 0:
            for img in images:
                if not img.startswith("data:image"):
                    img = f"data:image/jpeg;base64,{img}"
                history_question += f'<br><img src="{img}" style="max-width: 250px; border-radius: 8px; margin-top: 10px;" />'
                
        self.memory.add_message(project_id, "user", history_question)
        
        # 1. Fetch historical conversation context from SQLite
        # We limit to the last 10 messages (5 turns) to prevent context window bloat, 
        # excluding the message we literally just added above.
        raw_history = self.memory.get_history(project_id, limit=11)[:-1] 
        
        history_msgs = []
        import re
        for msg in raw_history:
            # Strip base64 HTML img tags from context history to prevent massive token dumps
            clean_content = re.sub(r'<img[^>]+>', '', msg["content"]).strip()
            
            if msg["role"] == "user":
                if clean_content: history_msgs.append(HumanMessage(content=clean_content))
            elif msg["role"] == "assistant":
                if clean_content: history_msgs.append(AIMessage(content=clean_content))

        # 2. Handle Multimodal injection (Vision) for the *current* question
        if images and len(images) > 0:
            content = [{"type": "text", "text": question}]
            for img in images:
                # Add data URI scheme if absent
                if not img.startswith("data:image"):
                    img = f"data:image/jpeg;base64,{img}"
                content.append({"type": "image_url", "image_url": {"url": img}})
            first_msg = HumanMessage(content=content)
        else:
            first_msg = HumanMessage(content=question)
            
        # Stitch history + current message
        messages = history_msgs + [first_msg]
            
        initial_state = {
            "project_id": project_id,
            "question": question,
            "llm_provider": llm_provider,
            "selected_documents": selected_documents or [],
            "images": images or [],
            "context": [], 
            "facts": [],
            "new_facts": [],
            "messages": messages,
            "reasoning": "", 
            "answer": "", 
            "status": "started"
        }
        
        # Invoke LangGraph engine
        final_state = self.graph.invoke(initial_state)
        
        if final_state.get("status") == "insufficient_context":
            return {
                "answer": "I lack the context in my database and memory to answer this question accurately.",
                "context": [],
                "facts": [],
                "new_facts": []
            }
        
        return {
            "answer": final_state.get("answer", "No answer generated."),
            "context": final_state.get("context", []),
            "facts": final_state.get("facts", []),
            "new_facts": final_state.get("new_facts", [])
        }

    def extract_memory_background(self, project_id: str, question: str, answer: str, context: List[str], llm_provider: str, images: List[str] = None):
        """Asynchronously extract standalone facts from the conversation to store in long-term memory."""
        if not answer:
            return
            
        # Fetch existing context for evaluation
        existing_nodes = self.memory.get_facts(project_id, limit=30, sort_by='activation')
        existing_context = "\n".join([f"Node [{node.id}]: {node.content} ({node.tier})" for node in existing_nodes])

        system_prompt = f"""You are an AI Memory Extraction and Graph Routing agent. Your job is to analyze the preceding user question, assistant answer, and any provided document or image passages.
Identify any new, standalone, and objectively true facts stated by the User about themselves.
ALSO identify significant real-world facts, deep technical insights, or research findings that were explicitly discussed and verified by the Assistant in this turn.

You must categorize each fact into one of these cognitive tiers:
- 'Research': Deep technical analysis, architecture decisions, verified world facts, facts extracted from research papers.
- 'Project': Active tasks, open questions, implementation state.
- 'Personal': User preferences, habits, long-term user context.
- 'Conversational': Short-term doubts, temporary clarifications.

Assign a relevance_score (0.0 to 1.0) indicating how critical this memory is for long-term context.

GRAPH LOGIC (Branching, Convergence, Genesis):
You are also provided with the existing Memory Graph context below.
For each new fact you extract, evaluate if it:
1. "ELABORATES_ON" an existing node.
2. "CONTRADICTS" an existing node.
3. "SYNTHESIZES" multiple existing nodes.
4. Or if it is a completely disjoint "Genesis" fact with no edges.

CRITICAL RULE FOR EDGES: You must NEVER invent or hallucinate a UUID! If you create an edge, the source_node_id and target_node_id MUST exactly match an ID from the "Existing Graph Context" below OR the temporary "new_" IDs you create in this turn's "facts" array. Any edge with a hallucinated UUID will corrupt the system.

Existing Graph Context:
{existing_context if existing_context else "No existing nodes in the graph."}

Return a JSON object with two arrays: "facts" and "edges". 
For new facts, use a temporary string ID like "new_1", "new_2" which you can reference in your "edges".
CRITICAL: For each new fact, determine its "source" logically:
- If the fact came from a provided "Document Context", specify the document's name.
- If the query involved searching the web or retrieved external links, use "Web Search".
- If it represents an explicit preference stated by the user about themselves, use "User Preference".
- Default to "Conversation" if it came purely from the chat block.
  "facts": [
    {{"id": "new_1", "source": "Conversation", "content": "User prefers Next.js", "tier": "Personal", "relevance_score": 0.85}},
    {{"id": "new_2", "source": "paper_v2.pdf", "content": "The study found X reduces Y by 20%", "tier": "Research", "relevance_score": 0.95}}
  ],
  "edges": [
    {{"source_node_id": "existing-uuid-abc", "target_node_id": "new_1", "relationship_type": "ELABORATES_ON", "weight": 1.0}},
    {{"source_node_id": "existing-uuid-def", "target_node_id": "new_2", "relationship_type": "SYNTHESIZES", "weight": 1.2}}
  ]
}}"""
        
        context_str = "\n".join(context) if context else "No document context."
        
        # Format the question with images if present
        if images and len(images) > 0:
            msg_content = [{"type": "text", "text": f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\n================\nDocument Context:\n{context_str}\n\nUser Question:\n{question}\n\nAssistant Answer:\n{answer}"}]
            for img in images:
                if not img.startswith("data:image"):
                    img = f"data:image/jpeg;base64,{img}"
                msg_content.append({"type": "image_url", "image_url": {"url": img}})
            human_msg = HumanMessage(content=msg_content)
        else:
            human_msg = HumanMessage(content=f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\n================\nDocument Context:\n{context_str}\n\nUser Question:\n{question}\n\nAssistant Answer:\n{answer}")
            
        messages = [human_msg]
        
        llm = self._get_llm("o4-mini", bind_tools=False)
        try:
            import re
            response = llm.invoke(messages)
            content = response.content.strip()
            
            # Smart JSON extraction for chatty reasoning models
            json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
            if json_match:
                content = json_match.group(1).strip()
            else:
                start_idx = content.find('{')
                end_idx = content.rfind('}')
                if start_idx != -1 and end_idx != -1:
                    content = content[start_idx:end_idx+1]
            
            try:
                data = json.loads(content)
                facts = data.get("facts", [])
                edges = data.get("edges", [])
            except:
                import ast
                fallback = ast.literal_eval(content)
                if isinstance(fallback, dict):
                    facts = fallback.get("facts", [])
                    edges = fallback.get("edges", [])
                elif isinstance(fallback, list):
                    facts = fallback
                    edges = []
                else:
                    facts = []
                    edges = []

            if isinstance(facts, list):
                print(f"DEBUG Extracted bg facts output: {facts}")
                id_mapping = {}
                for fact_obj in facts:
                    if isinstance(fact_obj, dict):
                        temp_id = fact_obj.get("id")
                        content_str = fact_obj.get("content")
                        tier = fact_obj.get("tier", "Conversational")
                        source = fact_obj.get("source", "Conversation")
                        
                        # Validate tier
                        valid_tiers = ["Research", "Project", "Personal", "Conversational"]
                        if tier not in valid_tiers: tier = "Conversational"
                            
                        relevance = float(fact_obj.get("relevance_score", 0.5))
                        
                        if isinstance(content_str, str) and len(content_str) > 5:
                            real_id = self.memory.save_fact(
                                project_id, 
                                content_str, 
                                source=source, 
                                tier=tier, 
                                relevance_score=relevance
                            )
                            if temp_id:
                                id_mapping[temp_id] = real_id
                    elif isinstance(fact_obj, str) and len(fact_obj) > 5:
                        # Fallback for old agent format
                        self.memory.save_fact(project_id, fact_obj, source="auto_extract")
                
                # Build a set of all valid UUIDs to filter out LLM hallucinations
                valid_ids_set = {n.id for n in existing_nodes}
                for real_id in id_mapping.values():
                    valid_ids_set.add(real_id)

                # Write newly discovered Edges
                for edge_obj in edges:
                    if isinstance(edge_obj, dict):
                        src_id = edge_obj.get("source_node_id")
                        tgt_id = edge_obj.get("target_node_id")
                        rel_type = edge_obj.get("relationship_type", "RELATED_TO")
                        weight = float(edge_obj.get("weight", 1.0))

                        # Resolve temp IDs to real node UUIDs assigned by SQLite
                        real_src = id_mapping.get(src_id, src_id)
                        real_tgt = id_mapping.get(tgt_id, tgt_id)

                        # Prevent database corruption by silently dropping hallucinated edge IDs
                        if real_src and real_tgt and (real_src in valid_ids_set) and (real_tgt in valid_ids_set):
                            print(f"DEBUG Connecting Edge: {real_src} -> {real_tgt} ({rel_type})")
                            self.memory.add_edge(project_id, real_src, real_tgt, rel_type, weight)
                        else:
                            print(f"DEBUG Rejected Hallucinated Edge src: {src_id} or tgt: {tgt_id}")
            else:
                print(f"DEBUG bg facts was not an array/dict: {facts}")
                        
        except Exception as e:
            print(f"Background memory extraction failed: {e}")
            import traceback, os
            with open(os.path.join(os.path.dirname(__file__), "..", "bg_error.txt"), "w") as f:
                f.write(f"Error: {str(e)}\n\n")
                f.write(traceback.format_exc())
            traceback.print_exc()
