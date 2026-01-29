---
title: ## Oracle v2 Dashboard URLs and Ports (Updated Jan 2026)
tags: [oracle-v2, ports, dashboard, frontend, backend, api, 47778, 3000, graph]
created: 2026-01-29
source: Port configuration update - Jan 29, 2026
---

# ## Oracle v2 Dashboard URLs and Ports (Updated Jan 2026)

## Oracle v2 Dashboard URLs and Ports (Updated Jan 2026)

**Frontend (Vite Dev):** http://localhost:3000
- Overview: /
- Feed: /feed
- Search: /search
- Consult: /consult
- Graph: /graph
- Handoff: /handoff
- Activity: /activity
- Decisions: /decisions

**Backend API:** http://localhost:47778
- Health: /health, /api/health
- Stats: /api/stats
- Search: /api/search?q=...
- Graph: /api/graph
- All API endpoints prefixed with /api/

**Production (single process):**
- Backend serves both API and built frontend on :47778
- Graph accessible at: http://localhost:47778/graph

**Key Change:** Port migrated from 37778 → 47778 on Jan 14, 2026

**Development mode:**
```bash
# Terminal 1: Backend
bun run server              # http://localhost:47778

# Terminal 2: Frontend  
cd frontend && bun run dev  # http://localhost:3000
```

---
*Added via Oracle Learn*
