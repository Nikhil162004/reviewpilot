"""FastAPI application — PR Review Assistant API."""

import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models.schemas import (
    CodeReviewRequest,
    DiffReviewRequest,
    FixRequest,
    FixResult,
    GitHubPRRequest,
    ReviewResult,
)
from app.services import github_service, llm_service, store
from app.services.analyzer import analyze_code, analyze_diff
from app.services.autofix import apply_fixes
from app.services.diff_parser import parse_unified_diff

app = FastAPI(title="PR Review Assistant", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https://.*\.e2b\.app",
    allow_methods=["*"],
    allow_headers=["*"],
)


def _finalize(result: ReviewResult) -> ReviewResult:
    if llm_service.llm_enabled() and result.issues:
        result.summary = llm_service.enrich_summary(
            result.summary, json.dumps([i.model_dump() for i in result.issues[:10]])
        )
    store.save_review(result.model_dump())
    return result


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "llm_enrichment": llm_service.llm_enabled()}


@app.post("/api/review/code", response_model=ReviewResult)
def review_code(payload: CodeReviewRequest) -> ReviewResult:
    return _finalize(analyze_code(payload.code, payload.filename, payload.title))


@app.post("/api/review/diff", response_model=ReviewResult)
def review_diff(payload: DiffReviewRequest) -> ReviewResult:
    files = parse_unified_diff(payload.diff)
    if not files:
        raise HTTPException(status_code=422, detail="No files found in that diff. Paste a git unified diff.")
    return _finalize(analyze_diff(files, payload.title))


@app.post("/api/review/github-pr", response_model=ReviewResult)
def review_github_pr(payload: GitHubPRRequest) -> ReviewResult:
    try:
        title, diff_text = github_service.fetch_pr_diff(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    files = parse_unified_diff(diff_text)
    if not files:
        raise HTTPException(status_code=422, detail="That PR has no parseable file changes.")
    return _finalize(analyze_diff(files, title))


@app.post("/api/fix", response_model=FixResult)
def fix_code(payload: FixRequest) -> FixResult:
    fixed, applied = apply_fixes(payload.code, payload.filename)
    return FixResult(
        fixed_code=fixed,
        applied=[{"rule_id": f.rule_id, "description": f.description, "line": f.line} for f in applied],
    )


@app.get("/api/github/prs")
def github_prs(repo: str) -> list[dict]:
    try:
        return github_service.list_open_prs(repo)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/reviews")
def reviews() -> list[dict]:
    return store.list_reviews()


@app.get("/api/reviews/{review_id}")
def review_by_id(review_id: str) -> dict:
    found = store.get_review(review_id)
    if not found:
        raise HTTPException(status_code=404, detail="Review not found")
    return found


@app.get("/api/stats")
def stats() -> dict:
    return store.dashboard_stats()
