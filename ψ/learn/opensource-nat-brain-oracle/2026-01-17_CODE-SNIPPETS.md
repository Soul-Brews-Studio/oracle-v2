# Code Snippets

## Main Entry Point

### courses/build-your-oracle/starter-kit/oracle.py

```python
#!/usr/bin/env python3
"""
Build Your Oracle - CLI Tool
Day 1-2: Memory + Context-Finder
"""

import click
import sqlite3
import os
from pathlib import Path
from datetime import datetime

DB_PATH = "oracle.db"

def get_db():
    """Get database connection."""
    return sqlite3.connect(DB_PATH)

@click.group()
def cli():
    """Oracle - Your AI Knowledge System"""
    pass

@cli.command()
@click.argument('query')
def search(query):
    """Search your knowledge base."""
    conn = get_db()
    cursor = conn.execute("""
        SELECT o.id, o.content, o.source_file, o.created_at
        FROM observations_fts fts
        JOIN observations o ON fts.rowid = o.id
        WHERE observations_fts MATCH ?
        ORDER BY rank
        LIMIT 10
    """, [query])

    results = cursor.fetchall()
    if not results:
        print(f"No results for: {query}")
        return

    print(f"Found {len(results)} results:\n")
    for id, content, source, created in results:
        print(f"[{id}] {source or 'direct'} ({created[:10]})")
        preview = content[:200] + "..." if len(content) > 200 else content
        print(f"    {preview}\n")

if __name__ == "__main__":
    cli()
```

The main entry point is a Click-based CLI application that provides a command interface for the Oracle knowledge system. It includes commands for searching, adding, indexing, and analyzing observations.

## Core Implementations

### 1. Hybrid Search System

#### courses/build-your-oracle/starter-kit/oracle_smart.py

```python
@cli.command()
@click.argument('query')
def search(query):
    """Hybrid search: keywords + vectors."""
    print(f"Hybrid search for: {query}\n")

    # Phase 1: FTS5 keyword search
    conn = get_db()
    keyword_results = conn.execute("""
        SELECT o.id, o.content, o.source_file
        FROM observations_fts fts
        JOIN observations o ON fts.rowid = o.id
        WHERE observations_fts MATCH ?
        LIMIT 20
    """, [query]).fetchall()
    print(f"Keyword matches: {len(keyword_results)}")

    # Phase 2: Vector search (if available)
    collection = get_collection()
    if collection and collection.count() > 0:
        vector_results = collection.query(
            query_texts=[query],
            n_results=10
        )
        print(f"Semantic matches: {len(vector_results['ids'][0])}")
```

This implements a two-phase search: FTS5 for keyword matching and ChromaDB for semantic/vector search. It gracefully degrades if ChromaDB isn't available.

### 2. AI Consultation Command

#### courses/build-your-oracle/starter-kit/oracle_smart.py

```python
@cli.command()
@click.argument('question')
def consult(question):
    """Get advice based on your knowledge."""
    print(f"Consulting Oracle about: {question}\n")

    # Find relevant knowledge
    conn = get_db()
    results = conn.execute("""
        SELECT content FROM observations_fts
        WHERE observations_fts MATCH ?
        LIMIT 5
    """, [question]).fetchall()

    if not results:
        print("No relevant knowledge found.")
        return

    context = "\n---\n".join([r[0][:500] for r in results])

    if AI_AVAILABLE:
        # Use Claude to synthesize
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": f"""Based on this knowledge, advise on: {question}

Knowledge:
{context}

Provide concise, actionable advice."""
            }]
        )
        print("Oracle says:")
        print(response.content[0].text)
```

This command retrieves relevant knowledge and uses Claude Haiku to synthesize actionable advice. It demonstrates the pattern of using smaller models for synthesis.

### 3. Knowledge Supersession Pattern

#### courses/build-your-oracle/starter-kit/oracle_smart.py

```python
@cli.command()
@click.argument('old_id')
@click.argument('new_id')
@click.option('--reason', '-r', default='Updated understanding')
def supersede(old_id, new_id, reason):
    """Mark old knowledge as superseded by new.

    Philosophy: "Nothing is Deleted" - old stays, but marked outdated.
    """
    conn = get_db()

    try:
        conn.execute("""
            UPDATE observations
            SET superseded_by = ?, supersede_reason = ?
            WHERE id = ?
        """, [new_id, reason, old_id])
        conn.commit()
        print(f"Superseded: {old_id} -> {new_id}")
        print(f"Reason: {reason}")
```

Implements the "Nothing is Deleted" philosophy - marks old knowledge as superseded rather than deleting it, preserving the history of understanding evolution.

### 4. Database Schema with FTS5

#### courses/build-your-oracle/starter-kit/schema.sql

```sql
-- Main observations table
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'observation',
    source_file TEXT,
    concepts TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search index
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts
USING fts5(
    content,
    source_file,
    content=observations,
    content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, content, source_file)
    VALUES (new.id, new.content, new.source_file);
END;

-- Pattern discovery (co-occurring concepts):
-- SELECT c1.concept, c2.concept, COUNT(*) as co_occurrences
-- FROM concepts c1
-- JOIN concepts c2 ON c1.observation_id = c2.observation_id AND c1.concept < c2.concept
-- GROUP BY c1.concept, c2.concept
-- HAVING COUNT(*) > 2
-- ORDER BY co_occurrences DESC;
```

Uses SQLite FTS5 for full-text search with automatic triggers to keep the index synchronized. Includes a concept table for pattern recognition and co-occurrence analysis.

### 5. Prompt Organization Script

#### scripts/organize_prompts.py

```python
def slugify(text):
    """Convert title to URL-safe slug"""
    slug = text.lower().strip()
    slug = re.sub(r'[^a-z0-9\s\-]', '', slug)
    slug = re.sub(r'\s+', '-', slug)
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug

def extract_consolidated(file_path, start_num, end_num):
    """Extract prompts from consolidated markdown file"""
    if not os.path.exists(file_path):
        return {}

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    prompts = {}

    for num in range(start_num, end_num + 1):
        patterns = [
            rf'^##\s+Prompt\s+{num}:\s+([^#\n]+)',
            rf'^##\s+{num}:\s+["\']?([^#"\'\n]+)["\']?',
        ]

        match = None
        for pattern in patterns:
            match = re.search(pattern, content, re.MULTILINE)
            if match:
                break

        if not match:
            continue

        title = match.group(1).strip().rstrip(':').strip()
        # Extract section content...
        slug = slugify(title)
        prompts[num] = {
            'title': title,
            'slug': slug,
            'full_content': section_content
        }

    return prompts
```

Flexible prompt extraction from multiple markdown formats (consolidated files, individual files with frontmatter). Uses regex pattern matching with fallbacks to handle various source formats.

## Interesting Patterns

### 1. Optional Dependencies Pattern

The `oracle_smart.py` demonstrates graceful degradation:

```python
try:
    import chromadb
    VECTORS_AVAILABLE = True
except ImportError:
    VECTORS_AVAILABLE = False
    print("ChromaDB not installed. Run: pip install chromadb")

try:
    import anthropic
    AI_AVAILABLE = True
except ImportError:
    AI_AVAILABLE = False
```

Commands check these flags and provide reduced functionality when dependencies are missing, rather than failing completely.

### 2. Three-Phase Search Architecture

The context-finder pattern demonstrates a multi-tier search strategy:

```python
@cli.command()
@click.argument('query')
def smart_search(query):
    """Search with context-finder pattern (Day 2)."""
    print("Context-finder search:")
    print("1. FTS5 finds candidates...")

    # Phase 1: FTS5
    candidates = conn.execute("""...""").fetchall()
    print(f"   Found {len(candidates)} candidates")

    # Phase 2: Would use Haiku here
    print("2. Haiku would summarize candidates...")

    # Phase 3: Would use Opus here
    print("3. Opus would analyze top results...")
```

This shows the philosophy: fast keyword filtering → small model summary → large model analysis, optimizing cost and speed.

### 3. Append-Only Philosophy with Metadata

Rather than deleting knowledge:

```python
UPDATE observations
SET superseded_by = ?, supersede_reason = ?
WHERE id = ?
```

Knowledge is marked as superseded with reasons recorded. This creates an audit trail of understanding evolution and prevents information loss.

### 4. Trigger-Based Index Synchronization

SQLite triggers automatically keep FTS5 index in sync:

```sql
CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
    INSERT INTO observations_fts(rowid, content, source_file)
    VALUES (new.id, new.content, new.source_file);
END;

CREATE TRIGGER observations_au AFTER UPDATE ON observations BEGIN
    INSERT INTO observations_fts(observations_fts, rowid, content, source_file)
    VALUES('delete', old.id, old.content, old.source_file);
    INSERT INTO observations_fts(rowid, content, source_file)
    VALUES (new.id, new.content, new.source_file);
END;
```

This ensures search results always reflect current data without manual refresh.

### 5. Resilient Multi-Format Parser

The `organize_prompts.py` handles multiple inconsistent source formats:

```python
CONSOLIDATED_SOURCES = [
    ('oracle-philosophy', f"{SLIDES_DIR}/results/visual-prompts-301-310.md", 301, 310),
    ('psi-pillars', f"{SLIDES_DIR}/results/prompts-311-320.md", 311, 320),
]

INDIVIDUAL_DIR_SOURCES = [
    ('maw-patterns', f"{SLIDES_DIR}/prompts", '3[2-3]', 321, 330),
]

CONSOLIDATED_FILE_SOURCES = [
    ('energy-rhythm', f"{SLIDES_DIR}/prompts/361-370.md", 361, 370),
]

OTHER_SOURCES = [
    ('teaching-prompts', f"{SLIDES_DIR}/391-metaphor-over-technical.md", 391, 400),
]
```

Gracefully handles consolidated markdown files, individual files with frontmatter, and directory patterns - demonstrating real-world robustness.

---

**Summary**: This is an AI knowledge management system built on SQLite FTS5 with optional vector search. The architecture emphasizes graceful degradation, append-only philosophy, and progressive intelligence tiers (keyword → semantic → AI synthesis). It's designed as a "brain for AI," capturing patterns and supporting reflection through standardized commands.
