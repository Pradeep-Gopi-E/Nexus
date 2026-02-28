import sqlite3
import os
import uuid
from typing import List, Optional
from nexus.models import Fact, Edge, UserPreference

class MemoryStore:
    """Persistent state mechanism for Nexus."""
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            db_path = os.path.join(project_root, "data", "nexus_memory.db")
            
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        # Using check_same_thread=False allows sharing the connection across MCP request threads safely
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()
        self._upgrade_db()

    def _init_db(self):
        with self.conn:
            self.conn.execute('''
                CREATE TABLE IF NOT EXISTS facts (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source TEXT,
                    tier TEXT DEFAULT 'Conversational',
                    relevance_score REAL DEFAULT 0.5,
                    access_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            self.conn.execute('''
                CREATE TABLE IF NOT EXISTS preferences (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            ''')
            self.conn.execute('''
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            self.conn.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            self.conn.execute('''
                CREATE TABLE IF NOT EXISTS edges (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    source_node_id TEXT NOT NULL,
                    target_node_id TEXT NOT NULL,
                    relationship_type TEXT NOT NULL,
                    weight REAL DEFAULT 1.0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(source_node_id) REFERENCES facts(id),
                    FOREIGN KEY(target_node_id) REFERENCES facts(id)
                )
            ''')

    def _upgrade_db(self):
        """Safely applies schema migrations to existing databases without data loss."""
        with self.conn:
            cursor = self.conn.execute("PRAGMA table_info(facts)")
            columns = [col[1] for col in cursor.fetchall()]
            
            if "tier" not in columns:
                self.conn.execute("ALTER TABLE facts ADD COLUMN tier TEXT DEFAULT 'Conversational'")
            if "relevance_score" not in columns:
                self.conn.execute("ALTER TABLE facts ADD COLUMN relevance_score REAL DEFAULT 0.5")
            if "access_count" not in columns:
                self.conn.execute("ALTER TABLE facts ADD COLUMN access_count INTEGER DEFAULT 0")
            if "created_at" not in columns:
                self.conn.execute("ALTER TABLE facts RENAME COLUMN timestamp TO created_at")
            if "last_accessed" not in columns:
                self.conn.execute("ALTER TABLE facts ADD COLUMN last_accessed DATETIME DEFAULT '2020-01-01 00:00:00'")
                self.conn.execute("UPDATE facts SET last_accessed = created_at")

    def ensure_project(self, project_id: str, name: str):
        """Ensures a project exists in the database. Updates its timestamp if it does."""
        with self.conn:
             self.conn.execute(
                 "INSERT INTO projects (id, name, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP",
                 (project_id, name)
             )

    def save_fact(self, project_id: str, content: str, source: Optional[str] = None, tier: str = 'Conversational', relevance_score: float = 0.5) -> str:
        """Saves an extracted piece of knowledge to long-term memory for a specific project."""
        fact_id = str(uuid.uuid4())
        with self.conn:
            self.conn.execute(
                "INSERT INTO facts (id, project_id, content, source, tier, relevance_score) VALUES (?, ?, ?, ?, ?, ?)",
                (fact_id, project_id, content, source, tier, relevance_score)
            )
        return fact_id

    def get_facts(self, project_id: str, limit: int = 100, sort_by: str = 'chronological') -> List[Fact]:
        """Retrieves facts learned by the agent for a specific project, with cognitive sorting."""
        
        # We fetch all (or up to a high limit) so we can sort in Python if we want to use math modules or custom decay logic
        cursor = self.conn.execute("SELECT * FROM facts WHERE project_id = ?", (project_id,))
        rows = cursor.fetchall()
        
        facts = [Fact(**dict(row)) for row in rows]
        
        if not facts:
            return []

        if sort_by == 'chronological':
            facts.sort(key=lambda x: x.created_at, reverse=True)
            
        elif sort_by == 'activation':
            import math
            from datetime import datetime, timezone
            
            # Simple exponential decay + relevance scoring
            now = datetime.now(timezone.utc).replace(tzinfo=None) # Assume naive UTC from SQLite
            
            tier_multipliers = {
                'Research': 1.5,
                'Project': 1.2,
                'Personal': 1.0,
                'Conversational': 0.8
            }
            
            for fact in facts:
                # 1. Base Relevance
                base_score = fact.relevance_score
                
                # 2. Tier Weight
                tier_weight = tier_multipliers.get(fact.tier, 1.0)
                
                # 3. Access Frequency
                freq_bonus = math.log1p(fact.access_count) * 0.15 
                
                # 4. Time Decay (Half-life based on tier)
                days_old = (now - fact.last_accessed).days
                if days_old < 0: days_old = 0
                
                # Different decay rates based on cognitive importance 
                decay_rate = 0.05 if fact.tier in ['Research', 'Personal'] else 0.2
                time_decay = math.exp(-decay_rate * days_old)
                
                # Final Activation Score (store it temporarily on the object for sorting)
                fact_activation = (base_score * 0.4 * tier_weight) + freq_bonus + (time_decay * 0.3)
                # Hack to store score for sorting mapping
                setattr(fact, '_activation_score', fact_activation)
                
            facts.sort(key=lambda x: getattr(x, '_activation_score', 0), reverse=True)
            
        elif sort_by == 'tier':
            priority = {'Research': 1, 'Project': 2, 'Personal': 3, 'Conversational': 4}
            facts.sort(key=lambda x: (priority.get(x.tier, 5), -x.created_at.timestamp()))

        return facts[:limit]

    def get_all_memories(self, project_id: Optional[str] = None) -> List[dict]:
        """Retrieves facts, optionally filtered by project, structured for a Knowledge Base or Mind Map."""
        query = '''
            SELECT f.id, f.project_id, f.content, f.source, f.tier, f.relevance_score, f.created_at, f.last_accessed, p.name as project_name
            FROM facts f
            LEFT JOIN projects p ON f.project_id = p.id
        '''
        params = []
        if project_id:
            query += " WHERE f.project_id = ?"
            params.append(project_id)
            
        query += " ORDER BY f.created_at DESC"
        
        cursor = self.conn.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def update_memory(self, fact_id: str, content: Optional[str] = None, tier: Optional[str] = None) -> bool:
        """Updates an existing fact's content or tier manually."""
        updates = []
        params = []
        
        if content is not None:
            updates.append("content = ?")
            params.append(content)
        if tier is not None:
            updates.append("tier = ?")
            params.append(tier)
            
        if not updates:
            return False
            
        params.append(fact_id)
        query = f"UPDATE facts SET {', '.join(updates)} WHERE id = ?"
        
        with self.conn:
            cursor = self.conn.execute(query, tuple(params))
            return cursor.rowcount > 0


    def update_access(self, fact_ids: List[str]):
        """Increments the access count and updates the last_accessed timestamp for active memories."""
        if not fact_ids:
            return
        
        placeholders = ', '.join(['?'] * len(fact_ids))
        with self.conn:
            self.conn.execute(
                f"UPDATE facts SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
                fact_ids
            )

    def save_preference(self, key: str, value: str):
        """Saves a user preference."""
        with self.conn:
            self.conn.execute(
                "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)",
                (key, value)
            )

    def get_preference(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Retrieves a user preference."""
        cursor = self.conn.execute("SELECT value FROM preferences WHERE key = ?", (key,))
        row = cursor.fetchone()
        return row['value'] if row else default

    def add_message(self, project_id: str, role: str, content: str):
        """Records session history."""
        with self.conn:
            self.conn.execute(
                "INSERT INTO messages (project_id, role, content) VALUES (?, ?, ?)",
                (project_id, role, content)
            )

    def get_history(self, project_id: str, limit: int = 20) -> List[dict]:
        """Retrieves recent conversation history for a specific project."""
        cursor = self.conn.execute("SELECT role, content FROM messages WHERE project_id = ? ORDER BY id DESC LIMIT ?", (project_id, limit))
        # Return in chronological order
        return [dict(row) for row in reversed(cursor.fetchall())]
        
    def get_projects(self) -> List[dict]:
        """Returns a list of all active projects."""
        cursor = self.conn.execute("SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC")
        return [dict(row) for row in cursor.fetchall()]

    def delete_fact(self, fact_id: str):
        """Deletes a specific fact from memory and triggers self-healing graph updates."""
        with self.conn:
            # First, delete the fact
            self.conn.execute("DELETE FROM facts WHERE id = ?", (fact_id,))
            
            # Identify edge connections (either as source or target)
            cursor = self.conn.execute("SELECT id FROM edges WHERE source_node_id = ? OR target_node_id = ?", (fact_id, fact_id))
            edges_to_delete = [row['id'] for row in cursor.fetchall()]
            
            # Delete connected edges (preventing orphans)
            if edges_to_delete:
                placeholders = ','.join('?' * len(edges_to_delete))
                self.conn.execute(f"DELETE FROM edges WHERE id IN ({placeholders})", edges_to_delete)

    def add_edge(self, project_id: str, source_node_id: str, target_node_id: str, relationship_type: str, weight: float = 1.0) -> str:
        """Create a directed edge between two memory nodes in the graph."""
        edge_id = str(uuid.uuid4())
        with self.conn:
            self.conn.execute(
                "INSERT INTO edges (id, project_id, source_node_id, target_node_id, relationship_type, weight) VALUES (?, ?, ?, ?, ?, ?)",
                (edge_id, project_id, source_node_id, target_node_id, relationship_type, weight)
            )
        return edge_id

    def get_edges(self, project_id: Optional[str] = None) -> List[dict]:
        """Retrieve the topological structure of the memory graph."""
        if project_id:
            cursor = self.conn.execute(
                "SELECT id, source_node_id, target_node_id, relationship_type, weight, created_at FROM edges WHERE project_id = ?",
                (project_id,)
            )
        else:
            cursor = self.conn.execute(
                "SELECT id, source_node_id, target_node_id, relationship_type, weight, created_at FROM edges"
            )
            
        return [dict(row) for row in cursor.fetchall()]

    def reset(self, project_id: Optional[str] = None):
        """Wipes memory and history. If project_id provided, wipes only that project."""
        with self.conn:
            if project_id:
                self.conn.execute("DELETE FROM facts WHERE project_id = ?", (project_id,))
                self.conn.execute("DELETE FROM messages WHERE project_id = ?", (project_id,))
                self.conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            else:
                self.conn.execute("DROP TABLE IF EXISTS facts")
                self.conn.execute("DROP TABLE IF EXISTS edges")
                self.conn.execute("DROP TABLE IF EXISTS preferences")
                self.conn.execute("DROP TABLE IF EXISTS messages")
                self.conn.execute("DROP TABLE IF EXISTS projects")
                self._init_db()
