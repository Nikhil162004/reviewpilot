# ReviewPilot — Installation & Setup Guide

An AI-assisted code review tool: paste code, a git diff, or a GitHub pull request
and get scored, explainable findings with auto-fix. FastAPI backend + React frontend.

- **Live demo:** https://reviewpilot-web-qxjw.onrender.com
- **Repository:** https://github.com/Nikhil162004/reviewpilot

---

## 1. What you need

| Tool | Version | Check |
| --- | --- | --- |
| Python | 3.11 or newer | `python3 --version` |
| Node.js | 18 or newer (npm included) | `node --version` |
| Git | any recent | `git --version` |

Nothing else. The database is SQLite (built into Python), and the editor,
charts and icons are bundled by npm — no API key is required to run the app.

## 2. Get the code

```bash
unzip ReviewPilot.zip
cd ai-code-review-assistant
```

(or `git clone https://github.com/Nikhil162004/reviewpilot.git`)

## 3. Start the backend (terminal 1)

```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Check it: open http://127.0.0.1:8000/api/health → `{"status":"ok",...}`

## 4. Start the frontend (terminal 2)

```bash
cd frontend
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in your browser. Click **Start a review** —
the workspace opens and automatically reviews the sample file.
The frontend proxies `/api` calls to the backend on port 8000 automatically.

> `npm install` sometimes prints peer-dependency warnings — that is expected;
> the repo ships an `.npmrc` that handles it. Do not delete `.npmrc`.

## 5. Production-style run (optional)

```bash
cd frontend
npm run build
npx vite preview --host 0.0.0.0 --port 5173
```

## 6. Run the tests

```bash
cd backend
python3 -m pytest -q        # 21 tests, all should pass
```

## 7. Optional configuration

Copy `.env.example` to `.env` in the project root only if you need these:

| Variable | Needed for | Default behaviour if unset |
| --- | --- | --- |
| `APP_SECRET` | Signing login tokens | Uses a built-in dev secret (fine locally, **set it in production**) |
| `GROQ_API_KEY` | Server-side AI fallback | Not needed — Deep AI review asks each user for their own free key in Settings |
| `WEBHOOK_SECRET` | Verifying GitHub webhooks | Webhook accepts unsigned calls (local testing only) |
| `DATABASE_PATH` | Custom SQLite location | `backend/data/reviews.db` is created automatically |

User-supplied keys (Groq/Gemini, GitHub tokens) are entered in the browser,
sent per-request, and never stored on the server.

## 8. Deploy it live (free)

The repo includes a Render blueprint (`render.yaml`). Full click-by-click
instructions are in **DEPLOY.md** — roughly: push to GitHub → Render →
New → Blueprint → select the repo → Apply. Both the static site and the
API run on the free tier.

## 9. Docker (optional alternative)

```bash
docker compose up --build
```

Backend on :8000, frontend on :5173, same as the manual steps.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Frontend opens but reviews fail / "engine" errors | Backend is not running — start step 3 first, and keep that terminal open |
| `npm install` fails with ERESOLVE / notarget | Make sure `frontend/.npmrc` exists (it ships with the project); it enables `legacy-peer-deps` |
| Port 5173 or 8000 already in use | Stop the other process, or run uvicorn with `--port 8001` and update the proxy in `frontend/vite.config.ts` |
| Page is blank after `npm run build` | Use `npx vite preview` (step 5) — opening `dist/index.html` as a file does not work because the app calls `/api` |
| First review on the live site is slow | Free-tier API sleeps after ~15 min idle; it wakes in about a minute |

## Project layout

```
backend/    FastAPI app: app/main.py (routes), app/services/ (19-rule + AST
            engine, auto-fix, GitHub, auth, test generation), tests/
frontend/   React + Vite: src/App.tsx, src/components/ (Monaco editor,
            walkthrough, charts, command palette), src/lib/ (API client)
render.yaml Render blueprint used for the live deployment
DEPLOY.md   Step-by-step hosting guide
SECURITY_AUDIT.md  Security review of the codebase
```
