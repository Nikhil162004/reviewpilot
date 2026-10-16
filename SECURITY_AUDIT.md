# Security Audit — ReviewPilot

Date: 16 Oct 2026 · Scope: FastAPI backend, React frontend, repo history

## Findings and fixes

### Secrets
- **Git history scanned** (all commits, full diff): no real API keys, tokens, or private keys found. Sample credentials in demo code are fake fixtures used to test the secret detector.
- `.env` is gitignored; `.env.example` documents variable names only. `backend/data/` (SQLite with user hashes) is gitignored and untracked.
- GitHub tokens and user LLM keys are **sent per request from the browser and never stored or logged** on the server (`github_service.post_pr_comment`, `llm_review.deep_review`).

### Authentication and authorization
- Passwords: PBKDF2-HMAC-SHA256, 100k iterations, per-user salt, constant-time comparison (`auth_service.py`).
- Tokens: HMAC-SHA256 signed, 7-day expiry, verified on every protected call.
- **Admin route locked**: `GET /api/admin/analytics` returns 401 without a valid token (covered by tests). It previously was public.
- Reviews created while signed in are stamped with the account email; `?mine=1` filtering exists. A single review read (`GET /api/reviews/{id}`) stays public *by design* — that is the share-link feature; IDs are random, not sequential.

### Rate limiting (new, `app/security.py`)
- In-memory sliding window per IP: auth 10/min, LLM 20/min, GitHub comment 20/min, webhook 60/min, general API 600/min. Returns 429 with `Retry-After`. Single-process note: move to Redis if scaled horizontally.

### Headers, CORS, debug
- Security headers on every API response: `nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'none'`, HSTS, Referrer-Policy, Permissions-Policy, `Cache-Control: no-store`.
- CORS: only localhost preview origins + the sandbox preview domain; methods restricted to GET/POST; only Authorization/Content-Type/webhook headers allowed; credentials off.
- Debug off: `/docs` and `/openapi.json` return 404 unless `APP_DEBUG=true`.

### Input handling and XSS
- All SQL is parameterized. Display-bound fields (review title) are stripped of angle brackets and control characters; filenames reject `..` path segments (Pydantic validators, tested).
- React renders text escaped by default. The one `dangerouslySetInnerHTML` sink (syntax highlighter) escapes `& < >` in every token before inserting its own spans.
- Auth tokens live in `localStorage`. Accepted trade-off for this deployment shape (no cookie session infrastructure); documented so it can be revisited. Mitigations present: strict API CSP, no third-party scripts in the app shell besides the Monaco CDN loader.

### Webhooks
- If `WEBHOOK_SECRET` is set, `X-Hub-Signature-256` HMAC is verified before processing; unsigned deployments still work for local testing.

### Dependencies (re-audited)
- Frontend: `npm audit` = **0 vulnerabilities**. A DOMPurify advisory arrived transitively via `monaco-editor`; fixed with an npm `overrides` pin to a patched DOMPurify. Unused packages (`lucide-react`, `framer-motion`) and unused template assets were removed.
- Backend: upgraded FastAPI 0.115 → 0.143 (Starlette 0.41 had multiple PYSEC advisories). `pip-audit` = **no known vulnerabilities**. Requirements pinned to audited versions.

### Database
- SQLite file with user table + reviews; parameterized queries throughout; no string-built SQL anywhere in the codebase (verified by search). The database file is never committed.

## Test evidence
- Backend: `pytest` — 20 tests, including security tests for headers, admin auth, docs disabled, title sanitization, and path-traversal rejection.
- Live checks: headers present; admin 401 unauthenticated; docs 404; rate limiter returns 429 on the 11th auth attempt within a minute.

## Known residual risks (honest list)
- Rate limiting and token signing secret are per-process / env-based; set a strong `APP_SECRET` in any real deployment.
- Public share links are capability URLs: anyone with the link can read that one report. There is no per-review password.
- The deterministic engine can false-positive on secrets inside comments; findings are advisory, and the UI says a human review is still needed.
