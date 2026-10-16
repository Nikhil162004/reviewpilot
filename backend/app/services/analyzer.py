"""Deterministic code-review engine.

Design decision (documented for interviews): the core engine is rule/AST
based — not an LLM call. It is fast, free, reproducible, and every finding
can be explained. An optional LLM layer (see llm_service.py) can enrich
summaries when an API key is configured, but reviews never depend on it.
"""

from dataclasses import dataclass
import ast
import re
import uuid

from app.models.schemas import (
    Category,
    CodeLine,
    FileContent,
    FileSummary,
    Issue,
    ReviewResult,
    Severity,
)
from app.services.diff_parser import DiffFile

EXTENSION_LANGUAGE = {
    ".py": "python", ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".java": "java",
    ".go": "go", ".rb": "ruby", ".php": "php", ".sql": "sql",
}

SEVERITY_PENALTY = {Severity.critical: 15, Severity.high: 10, Severity.medium: 5, Severity.low: 2}


@dataclass(frozen=True)
class Rule:
    rule_id: str
    severity: Severity
    category: Category
    title: str
    pattern: re.Pattern[str]
    message: str
    suggestion: str
    suggested_fix: str | None = None
    languages: tuple[str, ...] | None = None  # None = all languages


def _rule(rule_id, severity, category, title, pattern, message, suggestion, fix=None, languages=None):
    return Rule(rule_id, severity, category, title, re.compile(pattern), message, suggestion, fix, languages)


RULES: list[Rule] = [
    _rule("SEC-001", Severity.critical, Category.security, "Hardcoded secret",
          r"(?i)(api[_-]?key|secret|passwd|password|token)\s*=\s*['\"][^'\"]{6,}['\"]",
          "A credential appears to be hardcoded in source code. Anything committed to git should be treated as leaked.",
          "Load secrets from environment variables or a secrets manager, and rotate this credential.",
          'import os\napi_key = [SECURITY_DATA]"API_KEY")'),
    _rule("SEC-002", Severity.critical, Category.security, "Cloud access key committed",
          r"AKIA[0-9A-Z]{16}",
          "This looks like an AWS access key ID committed in code.",
          "Revoke the key immediately and use IAM roles / environment variables instead."),
    _rule("SEC-003", Severity.critical, Category.security, "Possible SQL injection",
          r"(?i)(execute|query)\s*\(\s*f['\"]|(select|insert|update|delete)\b[^'\"]*['\"]\s*\+|%s.*%\(|format\(.*(select|where)",
          "SQL appears to be built with string formatting/concatenation, which allows SQL injection.",
          "Use parameterized queries with placeholders so user input is never parsed as SQL.",
          "cursor.execute(\"SELECT * FROM users WHERE id = %s\", (user_id,))"),
    _rule("SEC-004", Severity.high, Category.security, "Use of eval / exec",
          r"\b(eval|exec)\s*\(",
          "eval/exec executes arbitrary code. If any part of the input is user-controlled, this is remote code execution.",
          "Replace with explicit parsing (e.g. ast.literal_eval for literals) or a dispatch table.",
          "value = ast.literal_eval(user_input)  # safe for literals only", ("python",)),
    _rule("SEC-005", Severity.high, Category.security, "Unsafe deserialization",
          r"pickle\.loads?\(|yaml\.load\((?!.*Loader\s*=\s*yaml\.SafeLoader)",
          "Deserializing untrusted data with pickle / unsafe yaml.load can execute arbitrary code.",
          "Use json or yaml.safe_load for untrusted input.", None, ("python",)),
    _rule("SEC-006", Severity.high, Category.security, "Shell command injection risk",
          r"os\.system\(|subprocess\.(call|run|Popen)\([^)]*shell\s*=\s*True",
          "Running shell commands built from strings allows command injection.",
          "Pass arguments as a list with shell=False.",
          "subprocess.run([\"ls\", user_path], check=True)"),
    _rule("SEC-007", Severity.medium, Category.security, "Weak hash algorithm",
          r"hashlib\.(md5|sha1)\(|createHash\(['\"](md5|sha1)['\"]\)",
          "MD5/SHA-1 are broken for security use and too fast for passwords.",
          "Use SHA-256+ for integrity; use bcrypt/argon2 for passwords."),
    _rule("SEC-008", Severity.high, Category.security, "TLS verification disabled",
          r"verify\s*=\s*False|rejectUnauthorized\s*:\s*false",
          "Disabling TLS verification exposes traffic to man-in-the-middle attacks.",
          "Keep verification enabled; fix the certificate chain instead."),
    _rule("SEC-009", Severity.high, Category.security, "Unsafe HTML injection",
          r"dangerouslySetInnerHTML|innerHTML\s*=|v-html\s*=",
          "Injecting raw HTML can lead to cross-site scripting (XSS) if content is user-controlled.",
          "Render text safely; if HTML is required, sanitize with DOMPurify first.", None,
          ("javascript", "typescript")),
    _rule("BUG-001", Severity.medium, Category.bug, "Bare except clause",
          r"^\s*except\s*:",
          "A bare except swallows every error, including KeyboardInterrupt and real bugs, making failures silent.",
          "Catch specific exceptions and log or handle them.",
          "except ValueError as exc:\n    logger.warning(\"bad value: %s\", exc)", ("python",)),
    _rule("BUG-002", Severity.medium, Category.bug, "Mutable default argument",
          r"def\s+\w+\([^)]*=\s*(\[\]|\{\})",
          "Mutable defaults are shared across calls in Python, causing state to leak between invocations.",
          "Default to None and create the object inside the function.",
          "def add(item, items=None):\n    items = [] if items is None else items", ("python",)),
    _rule("BUG-003", Severity.low, Category.bug, "Comparison to None with ==",
          r"==\s*None|!=\s*None",
          "Identity values (None, True, False) should be compared with 'is', not equality.",
          "Use `is None` / `is not None`.", None, ("python",)),
    _rule("BUG-004", Severity.low, Category.bug, "Debug statement left in code",
          r"\bprint\s*\([^)]*\)|console\.log\(",
          "Debug output left in production code leaks noise (and sometimes data) into logs.",
          "Use a logger with levels, or remove before merging."),
    _rule("BUG-005", Severity.medium, Category.bug, "Empty error handler",
          r"except[^:]*:\s*$|catch\s*\([^)]*\)\s*\{\s*\}",
          "An empty handler hides failures. At minimum, log what happened.",
          "Log the exception with context before recovering."),
    _rule("PERF-001", Severity.medium, Category.performance, "Database call inside a loop",
          r"^\s{8,}(cursor\.execute|db\.|\.query\(|fetch\()",
          "Executing a query per iteration causes N+1 query behaviour and scales poorly.",
          "Batch the lookup (WHERE id IN (...)) or prefetch before the loop."),
    _rule("PERF-002", Severity.low, Category.performance, "String concatenation in a loop",
          r"^\s{8,}\w+\s*\+=",
          "Repeated += on strings/collections inside loops can be O(n²); building a list and joining is faster.",
          "Collect parts in a list and ''.join(parts) at the end.", None, ("python",)),
    _rule("STYLE-001", Severity.low, Category.style, "Line too long",
          r"^.{121,}$",
          "Lines over 120 characters hurt readability in review and side-by-side diffs.",
          "Wrap the expression or extract a named variable."),
    _rule("STYLE-002", Severity.low, Category.style, "Unresolved TODO / FIXME",
          r"\b(TODO|FIXME|XXX|HACK)\b",
          "Unresolved markers tend to ship. Track them in an issue tracker instead.",
          "Create a ticket and reference it, or resolve before merging."),
]


def detect_language(filename: str) -> str:
    dot = filename.rfind(".")
    if dot == -1:
        return "text"
    return EXTENSION_LANGUAGE.get(filename[dot:].lower(), "text")


def _issue(rule: Rule, file: str, line: int, snippet: str) -> Issue:
    return Issue(
        id=str(uuid.uuid4())[:8],
        rule_id=rule.rule_id, file=file, line=line,
        severity=rule.severity, category=rule.category, title=rule.title,
        message=rule.message, code_snippet=snippet.strip()[:240],
        suggestion=rule.suggestion, suggested_fix=rule.suggested_fix,
    )


def _python_ast_checks(code: str, filename: str) -> list[Issue]:
    """Structural checks a regex cannot do reliably."""
    issues: list[Issue] = []
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        issues.append(Issue(
            id=str(uuid.uuid4())[:8], rule_id="BUG-000", file=filename,
            line=exc.lineno or 1, severity=Severity.high, category=Category.bug,
            title="Syntax error", message=f"This file does not parse: {exc.msg}.",
            code_snippet=(exc.text or "").strip()[:240],
            suggestion="Fix the syntax error — this code cannot run as committed.",
        ))
        return issues

    lines = code.splitlines()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            length = (node.end_lineno or node.lineno) - node.lineno + 1
            if length > 50:
                issues.append(Issue(
                    id=str(uuid.uuid4())[:8], rule_id="STYLE-003", file=filename,
                    line=node.lineno, severity=Severity.low, category=Category.style,
                    title="Function is too long",
                    message=f"'{node.name}' spans {length} lines. Long functions are harder to test and review.",
                    code_snippet=lines[node.lineno - 1].strip()[:240] if node.lineno <= len(lines) else "",
                    suggestion="Extract helper functions so each does one thing.",
                ))
        if isinstance(node, ast.For):
            for inner in ast.walk(node):
                if inner is not node and isinstance(inner, (ast.For, ast.While)):
                    issues.append(Issue(
                        id=str(uuid.uuid4())[:8], rule_id="PERF-003", file=filename,
                        line=inner.lineno, severity=Severity.medium, category=Category.performance,
                        title="Nested loop — possible O(n²)",
                        message="A loop nested inside another loop often means quadratic time. Verify this is acceptable for expected input sizes.",
                        code_snippet=lines[inner.lineno - 1].strip()[:240] if inner.lineno <= len(lines) else "",
                        suggestion="Consider a set/dict lookup, or precompute outside the loop.",
                    ))
                    break
    return issues


def _analyze_lines(lines: list[tuple[int, str]], filename: str, language: str) -> list[Issue]:
    issues: list[Issue] = []
    for line_no, content in lines:
        for rule in RULES:
            if rule.languages and language not in rule.languages:
                continue
            # PERF-001 needs indentation context; keep its pattern but require a loop nearby is overkill for v1.
            if rule.pattern.search(content):
                issues.append(_issue(rule, filename, line_no, content))
    return issues


def _grade(score: int) -> str:
    return "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"


def _compute_metrics(file_contents: list[FileContent]) -> dict[str, float]:
    total = blank = comments = functions = branches = 0
    branch_re = re.compile(r"\b(if|elif|for|while|except|with|and|or|case)\b")
    function_re = re.compile(r"^\s*(def |async def |function |func |const \w+ = \(|.*=>)")
    for fc in file_contents:
        for line in fc.lines:
            if line.kind == "removed":
                continue
            total += 1
            text = line.content.strip()
            if not text:
                blank += 1
            elif text.startswith(("#", "//", "/*", "*")):
                comments += 1
            if function_re.match(line.content):
                functions += 1
            branches += len(branch_re.findall(line.content))
    return {
        "total_lines": total,
        "blank_lines": blank,
        "comment_lines": comments,
        "comment_ratio": round((comments / total * 100) if total else 0, 1),
        "function_count": functions,
        "cyclomatic_complexity": 1 + branches,
        "avg_line_length": 0,  # filled below for readability in payloads
    }


def _build_result(title, source, file_contents, issues, lines_added_by_file) -> ReviewResult:
    score = max(0, 100 - sum(SEVERITY_PENALTY[i.severity] for i in issues))
    category_scores: dict[str, int] = {}
    for category in Category:
        penalty = sum(SEVERITY_PENALTY[i.severity] for i in issues if i.category == category)
        category_scores[category.value] = max(0, 100 - penalty)
    counts: dict[str, int] = {s.value: 0 for s in Severity}
    for issue in issues:
        counts[issue.severity.value] += 1

    files: list[FileSummary] = []
    for fc in file_contents:
        file_issues = sum(1 for i in issues if i.file == fc.path)
        files.append(FileSummary(
            path=fc.path, language=fc.language,
            lines_added=lines_added_by_file.get(fc.path, len(fc.lines)),
            issue_count=file_issues,
        ))

    if not issues:
        summary = "No issues found by the analysis engine. The changes look clean — still get a human review for logic and design."
    else:
        worst = "critical" if counts["critical"] else "high" if counts["high"] else "medium" if counts["medium"] else "low"
        summary = (
            f"Found {len(issues)} issue(s) across {len(files)} file(s), including "
            f"{counts['critical']} critical and {counts['high']} high severity findings. "
            f"Most urgent: address the {worst}-severity items before merging."
        )

    return ReviewResult(
        id=str(uuid.uuid4())[:12], title=title, source=source,
        created_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        score=score, grade=_grade(score), summary=summary,
        files=files, file_contents=file_contents, issues=sorted(
            issues, key=lambda i: (list(Severity).index(i.severity), i.file, i.line)
        ),
        stats={
            "total_issues": len(issues), **counts,
            "files_changed": len(files),
            "lines_added": sum(f.lines_added for f in files),
        },
        category_scores=category_scores,
        metrics=_compute_metrics(file_contents),
    )


def analyze_code(code: str, filename: str, title: str) -> ReviewResult:
    language = detect_language(filename)
    raw_lines = code.splitlines()
    numbered = list(enumerate(raw_lines, start=1))
    issues = _analyze_lines(numbered, filename, language)
    if language == "python":
        issues.extend(_python_ast_checks(code, filename))
    file_content = FileContent(
        path=filename, language=language,
        lines=[CodeLine(number=n, content=c) for n, c in numbered],
    )
    return _build_result(title, "paste", [file_content], issues, {filename: len(raw_lines)})


def analyze_diff(diff_files: list[DiffFile], title: str) -> ReviewResult:
    all_issues: list[Issue] = []
    file_contents: list[FileContent] = []
    added_by_file: dict[str, int] = {}

    for diff_file in diff_files:
        language = detect_language(diff_file.path)
        added = [(ln.number, ln.content) for ln in diff_file.added_lines]
        all_issues.extend(_analyze_lines(added, diff_file.path, language))
        if language == "python" and added:
            joined = "\n".join(content for _, content in added)
            for ast_issue in _python_ast_checks(joined, diff_file.path):
                # AST line numbers are relative to the joined added-lines block;
                # only keep syntax errors, structural checks need full-file context.
                if ast_issue.rule_id == "BUG-000":
                    all_issues.append(ast_issue)
        file_contents.append(FileContent(
            path=diff_file.path, language=language,
            lines=[CodeLine(number=ln.number, content=ln.content, kind=ln.kind) for ln in diff_file.lines],
        ))
        added_by_file[diff_file.path] = len(added)

    return _build_result(title, "diff", file_contents, all_issues, added_by_file)
