"""Pydantic schemas — the API contract between frontend and backend."""

from enum import Enum

from pydantic import BaseModel, Field


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


class DiffReviewRequest(BaseModel):
    diff: str = Field(min_length=1, max_length=500_000)
    title: str = "Pull request diff review"


class GitHubPRRequest(BaseModel):
    url: str = Field(min_length=10, max_length=500)
