"""FastAPI application - PR Review Assistant API."""

import hashlib
import hmac
import json
import os

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.models.schemas import (
    AuthRequest,
    AuthResult,
    CodeReviewRequest,
    DiffReviewRequest,
    FixRequest,
    FixResult,
    GitHubCommentRequest,
    GitHubPRRequest,
    LLMReviewRequest,
    ReviewResult,
    TestGenRequest,
    TestGenResult,
)
from app.services import auth_service, github_service, llm_service, store
from app.services.analyzer import analyze_code, analyze_diff
from app.services.autofix import apply_fixes
from app.services.diff_parser import parse_unified_diff
from app.services.llm_review import deep_review, review_markdown
from app.services.testgen import generate_tests

_DEBUG = os.environ.get("APP_DEBUG", "").lower() == "true"
app = FastAPI(
    title="PR Review Assistant", version="2.0.0",
    docs_url="/docs" if _DEBUG else None,
    redoc_url=None,
    openapi_url="/openapi.json" if _DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://.*\.e2b\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Hub-Signature-256", "X-GitHub-Event"],
    allow_credentials=False,
    max_age=600,
)

from app.security import SecurityMiddleware  # noqa: E402

app.add_middleware(SecurityMiddleware)


def _finalize(result: ReviewResult, user: dict | None = None) -> ReviewResult:
    if llm_service.llm_enabled() and result.issues:
        result.summary = llm_service.enrich_summary(
            result.summary, json.dumps([i.model_dump() for i in result.issues[:10]])
        )
    payload = result.model_dump()
    if user:
        payload["user_email"] = user["email"]
    store.save_review(payload)
    return result


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "llm_enrichment": llm_service.llm_enabled(), "version": "2.0.0"}


# ---------- Auth ----------
@app.post("/api/auth/register", response_model=AuthResult)
def register(payload: AuthRequest) -> AuthResult:
    try:
        return AuthResult(**auth_service.register(payload.email, payload.password))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/auth/login", response_model=AuthResult)
def do_login(payload: AuthRequest) -> AuthResult:
    try:
        return AuthResult(**auth_service.login(payload.email, payload.password))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.get("/api/auth/me")
def me(authorization: str | None = Header(default=None)) -> dict:
    user = auth_service.verify_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


# ---------- Reviews ----------
@app.post("/api/review/code", response_model=ReviewResult)
def review_code(payload: CodeReviewRequest, authorization: str | None = Header(default=None)) -> ReviewResult:
    user = auth_service.verify_token(authorization)
    return _finalize(analyze_code(payload.code, payload.filename, payload.title), user)


@app.post("/api/review/diff", response_model=ReviewResult)
def review_diff(payload: DiffReviewRequest, authorization: str | None = Header(default=None)) -> ReviewResult:
    files = parse_unified_diff(payload.diff)
    if not files:
        raise HTTPException(status_code=422, detail="No files found in that diff. Paste a git unified diff.")
    user = auth_service.verify_token(authorization)
    return _finalize(analyze_diff(files, payload.title), user)


@app.post("/api/review/github-pr", response_model=ReviewResult)
def review_github_pr(payload: GitHubPRRequest, authorization: str | None = Header(default=None)) -> ReviewResult:
    try:
        title, diff_text = github_service.fetch_pr_diff(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    files = parse_unified_diff(diff_text)
    if not files:
        raise HTTPException(status_code=422, detail="That PR has no parseable file changes.")
    user = auth_service.verify_token(authorization)
    return _finalize(analyze_diff(files, title), user)


@app.post("/api/fix", response_model=FixResult)
def fix_code(payload: FixRequest) -> FixResult:
    fixed, applied = apply_fixes(payload.code, payload.filename)
    return FixResult(
        fixed_code=fixed,
        applied=[{"rule_id": f.rule_id, "description": f.description, "line": f.line} for f in applied],
    )


# ---------- GitHub ----------
@app.get("/api/github/prs")
def github_prs(repo: str) -> list[dict]:
    try:
        return github_service.list_open_prs(repo)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/github/comment")
def github_comment(payload: GitHubCommentRequest) -> dict:
    review = store.get_review(payload.review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found — run the review first.")
    try:
        url = github_service.post_pr_comment(payload.token, payload.pr_url, review_markdown(review))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"comment_url": url}


@app.post("/api/webhooks/github")
async def github_webhook(request: Request) -> dict:
    """GitHub webhook: auto-review pull requests as they open/update.

    Configure in repo Settings → Webhooks with this URL, content type
    application/json, and the 'Pull requests' event. Reviews land in
    history like any other; set GROQ/API posting if you extend it to
    comment back automatically.
    """
    raw = await request.body()
    webhook_secret = os.environ.get("WEBHOOK_SECRET")
    if webhook_secret:
        signature = request.headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(webhook_secret.encode(), raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")
    try:
        payload = json.loads(raw or b"{}")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    action = payload.get("action")
    pr = payload.get("pull_request") or {}
    if action not in ("opened", "reopened", "synchronize") or not pr.get("html_url"):
        return {"status": "ignored", "action": action}
    try:
        title, diff_text = github_service.fetch_pr_diff(pr["html_url"])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    files = parse_unified_diff(diff_text)
    if not files:
        return {"status": "no-changes"}
    result = analyze_diff(files, f"[webhook] {title}")
    store.save_review(result.model_dump())
    return {"status": "reviewed", "review_id": result.id, "score": result.score}


# ---------- AI / tools ----------
@app.post("/api/llm/review")
async def llm_review(payload: LLMReviewRequest) -> dict:
    try:
        text = await deep_review(payload.code, payload.filename, payload.api_key, payload.provider)
    except Exception as exc:  # provider errors surface as a clean message
        raise HTTPException(status_code=422, detail=f"LLM call failed — check the API key/provider. ({type(exc).__name__})") from exc
    return {"provider": payload.provider, "review": text}


@app.post("/api/tests/generate", response_model=TestGenResult)
def tests_generate(payload: TestGenRequest) -> TestGenResult:
    test_code, test_filename = generate_tests(payload.code, payload.filename)
    return TestGenResult(test_code=test_code, test_filename=test_filename)


@app.get("/api/admin/analytics")
def admin_analytics(authorization: str | None = Header(default=None)) -> dict:
    # Admin data is aggregate platform usage: signed-in users only.
    if not auth_service.verify_token(authorization):
        raise HTTPException(status_code=401, detail="Sign in required for admin analytics")
    return store.admin_analytics()


# ---------- History / sharing ----------
@app.get("/api/reviews")
def reviews(authorization: str | None = Header(default=None), mine: int = 0) -> list[dict]:
    all_reviews = store.list_reviews()
    user = auth_service.verify_token(authorization)
    if mine and user:
        return [r for r in all_reviews if r.get("user_email") == user["email"]]
    return all_reviews


@app.get("/api/reviews/{review_id}")
def review_by_id(review_id: str) -> dict:
    found = store.get_review(review_id)
    if not found:
        raise HTTPException(status_code=404, detail="Review not found")
    return found


@app.get("/api/stats")
def stats() -> dict:
    return store.dashboard_stats()
