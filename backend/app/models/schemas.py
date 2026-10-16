"""Pydantic schemas — the API contract between frontend and backend."""

from enum import Enum

import re

from pydantic import BaseModel, Field, field_validator

_SAFE_NAME = re.compile(r"^[^<>\x00-\x1f]{1,120}$")
_SAFE_FILE = re.compile(r"^[A-Za-z0-9_./ -]{1,160}$")


def _clean_text(value: str) -> str:
    # Strip angle brackets / control chars from display-bound text (XSS hygiene).
    cleaned = re.sub(r"[<>\x00-\x1f]", "", value).strip()
    return cleaned or "untitled"



class Severity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class Category(str, Enum):
    security = "security"
    bug = "bug"
    performance = "performance"
    style = "style"


class Issue(BaseModel):
    id: str
    rule_id: str
    file: str
    line: int
    severity: Severity
    category: Category
    title: str
    message: str
    code_snippet: str
    suggestion: str
    suggested_fix: str | None = None


class FileSummary(BaseModel):
    path: str
    language: str
    lines_added: int
    lines_removed: int = 0
    issue_count: int = 0


class CodeLine(BaseModel):
    number: int
    content: str
    kind: str = "context"  # context | added | removed


class FileContent(BaseModel):
    path: str
    language: str
    lines: list[CodeLine]


class ReviewResult(BaseModel):
    id: str
    title: str
    source: str  # paste | diff | github-pr | sample
    created_at: str
    score: int
    grade: str
    summary: str
    files: list[FileSummary]
    file_contents: list[FileContent]
    issues: list[Issue]
    stats: dict[str, int]
    category_scores: dict[str, int] = {}
    metrics: dict[str, float] = {}


class CodeReviewRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200_000)
    filename: str = "main.py"
    title: str = "Pasted code review"

    @field_validator("filename")
    @classmethod
    def _safe_filename(cls, v: str) -> str:
        v = v.replace("\\", "/")
        if ".." in v.split("/") or not _SAFE_FILE.match(v):
            raise ValueError("Invalid filename")
        return v

    @field_validator("title")
    @classmethod
    def _safe_title(cls, v: str) -> str:
        return _clean_text(v)[:120]


class DiffReviewRequest(BaseModel):
    diff: str = Field(min_length=1, max_length=500_000)
    title: str = "Pull request diff review"

    @field_validator("title")
    @classmethod
    def _safe_title(cls, v: str) -> str:
        return _clean_text(v)[:120]


class GitHubPRRequest(BaseModel):
    url: str = Field(min_length=10, max_length=500)


class FixRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200_000)
    filename: str = "main.py"


class AppliedFixOut(BaseModel):
    rule_id: str
    description: str
    line: int


class FixResult(BaseModel):
    fixed_code: str
    applied: list[AppliedFixOut]


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class AuthResult(BaseModel):
    id: str
    email: str
    token: str


class GitHubCommentRequest(BaseModel):
    token: str = Field(min_length=10, max_length=300)
    pr_url: str = Field(min_length=10, max_length=500)
    review_id: str = Field(min_length=4, max_length=50)


class TestGenRequest(BaseModel):
    code: str = Field(min_length=1, max_length=200_000)
    filename: str = "main.py"


class TestGenResult(BaseModel):
    test_code: str
    test_filename: str


class LLMReviewRequest(BaseModel):
    code: str = Field(min_length=1, max_length=60_000)
    filename: str = "main.py"
    api_key: str = Field(min_length=10, max_length=300)
    provider: str = "groq"
