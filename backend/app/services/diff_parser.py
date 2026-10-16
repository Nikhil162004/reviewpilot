"""Unified-diff parsing.

Kept dependency-free and deterministic so line numbers in review comments
always map back to the *new* version of the file — the same mapping GitHub
uses for inline PR comments.
"""

from dataclasses import dataclass, field
import re

_HUNK_RE = re.compile(r"^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@")


@dataclass
class DiffLine:
    number: int  # line number in the new file (0 for removed lines)
    content: str
    kind: str  # added | removed | context


@dataclass
class DiffFile:
    path: str
    lines: list[DiffLine] = field(default_factory=list)

    @property
    def added_lines(self) -> list[DiffLine]:
        return [ln for ln in self.lines if ln.kind == "added"]


def parse_unified_diff(diff_text: str) -> list[DiffFile]:
    files: list[DiffFile] = []
    current: DiffFile | None = None
    new_line_no = 0

    for raw in diff_text.splitlines():
        if raw.startswith("+++ b/"):
            path = raw[len("+++ b/") :].strip()
            current = DiffFile(path=path)
            files.append(current)
            continue
        if raw.startswith("+++ "):  # non-git style header
            current = DiffFile(path=raw[4:].strip())
            files.append(current)
            continue
        if current is None:
            continue

        hunk = _HUNK_RE.match(raw)
        if hunk:
            new_line_no = int(hunk.group(1))
            continue
        if raw.startswith("+") and not raw.startswith("+++"):
            current.lines.append(DiffLine(new_line_no, raw[1:], "added"))
            new_line_no += 1
        elif raw.startswith("-") and not raw.startswith("---"):
            current.lines.append(DiffLine(0, raw[1:], "removed"))
        elif raw.startswith("\\"):
            continue
        else:
            content = raw[1:] if raw.startswith(" ") else raw
            current.lines.append(DiffLine(new_line_no, content, "context"))
            new_line_no += 1

    return [f for f in files if f.lines]
