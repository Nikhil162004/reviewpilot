# PR Review Assistant — Automated Code Review

An automated code-review system that analyzes pasted code, git diffs, and public GitHub pull requests, then produces a scored, severity-ranked report with inline findings and suggested fixes.

Built as a final-year CSE project designed to be **defensible in technical interviews**: the analysis core is deterministic (rules + AST), not an LLM wrapper, so every finding is reproducible and explainable.

## Features

- **Three input modes** — paste code, paste a unified git diff, or link a public GitHub PR
- **19 analysis rules** across Security, Bug, Performance, and Style
  - Hardcoded secrets & AWS keys, SQL injection, `eval`/`exec`, unsafe deserialization (pickle), shell injection, weak hashing, disabled TLS verification, XSS sinks
  - Mutable default arguments, bare `except`, empty handlers, debug statements
  - N+1 query patterns, nested-loop (O(n²)) detection, string concatenation in loops
- **Python AST checks** — syntax errors, over-long functions, nested loops
- **Diff-aware line mapping** — findings map to new-file line numbers, the same way GitHub places inline PR comments
- **Health score (0–100) & grade**, severity filtering, click-to-locate from issue → code line
- **Copy-paste suggested fixes**, Markdown report export, persistent review history (SQLite)
- **Optional LLM summary enrichment** (Groq) — polishes wording only; never invents findings

## Tech Stack

| Layer | Technology | Why |
| :--- | :--- | :--- |
| Frontend | React + TypeScript (Vite) | Component UI, type-safe API contract |
| Styling | Hand-written CSS design tokens | No template/framework look; full control |
| Backend | Python FastAPI + Pydantic | Python analysis ecosystem + validated schemas |
| Storage | SQLite (stdlib) | Zero-config; isolated store layer, swappable to PostgreSQL |
| Tests | pytest (backend) | Analyzer and diff parser are unit-tested |

## Quick Start

### Backend (terminal 1)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend (terminal 2)
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

Open the app, go to **New review → Paste code → Load sample vulnerable code → Run review**.

### Run tests
```bash
cd backend && python -m pytest -q
cd frontend && npm run build
```

### Optional: LLM summary enrichment
```bash
export GROQ_API_KEY=your_key   # reviews work fully without it
```

### Optional: Docker
```bash
docker compose up --build      # API on :8000, web on :5173
```

## Architecture

```
Paste code / Git diff / GitHub PR URL
              │
   ┌──────────┴──────────┐
   │  FastAPI (app.main) │  Pydantic-validated API contract
   └──────────┬──────────┘
   diff_parser.py ──► analyzer.py ──► (optional) llm_service.py
   unified diff       rules + AST      summary polish only
   line mapping       scoring 0–100
              │
        store.py (SQLite) ──► React UI (dashboard · report · history)
```

See `docs/ARCHITECTURE.md` for design decisions, limitations, and the interview defence notes.

## Project Structure

```
ai-code-review-assistant/
├── backend/
│   ├── app/
│   │   ├── main.py            # API routes
│   │   ├── models/schemas.py  # Pydantic contract
│   │   └── services/
│   │       ├── analyzer.py    # rules + AST engine, scoring
│   │       ├── diff_parser.py # unified diff → line-mapped files
│   │       ├── github_service.py
│   │       ├── llm_service.py # optional enrichment
│   │       └── store.py       # SQLite history
│   ├── tests/                 # pytest: analyzer + diff parser
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/        # CodeViewer, IssuePanel, ScoreRing
│       ├── lib/               # types, api client, samples
│       └── App.tsx
├── docs/ARCHITECTURE.md
└── docker-compose.yml
```

## Roadmap (honest)

- GitHub OAuth + webhooks for private repos and automatic PR comments
- Full-repository context (analyze unchanged files a diff depends on)
- Semgrep/Bandit tool integration alongside built-in rules
- Team dashboard: per-author and per-repo trend analytics

## Limitations

- Regex-based rules can false-positive on comments/string literals; AST checks mitigate this for Python
- Diff mode analyzes added lines; deep cross-file analysis needs full-repo context (roadmap)

<!-- Badges: replace YOUR-USERNAME and the demo URL after you deploy -->
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![Tests](https://img.shields.io/badge/tests-15%20passed-brightgreen)](#)
[![Live Demo](https://img.shields.io/badge/live%20demo-ReviewPilot-blue)](https://your-demo-url.example.com)
[![Stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20React%20%2B%20Monaco-2dd4bf)](#)
