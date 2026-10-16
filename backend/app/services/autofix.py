"""Deterministic auto-fix engine.

Each transformation mirrors a review rule, so 'Apply fix' and the finding
that motivated it share one rule_id. Fixes are conservative: if a pattern
is ambiguous we leave the code untouched rather than rewrite it wrong.
"""

import re
from dataclasses import dataclass


@dataclass
class AppliedFix:
    rule_id: str
    description: str
    line: int


SECRET_RE = re.compile(
    r"^(\s*)([A-Za-z_][\w]*(?:key|secret|password|passwd|token)[\w]*)\s*=\s*(['\"]).*\3\s*$",
    re.IGNORECASE,
)


def apply_fixes(code: str, filename: str) -> tuple[str, list[AppliedFix]]:
    is_python = filename.endswith(".py")
    lines = code.splitlines()
    applied: list[AppliedFix] = []
    out: list[str] = []

    for index, line in enumerate(lines, start=1):
        new_line = line

        secret = SECRET_RE.match(line)
        if secret and is_python:
            indent, var, _ = secret.groups()
            env_name = re.sub(r"(?<!^)(?=[A-Z])", "_", var).upper()
            new_line = f'{indent}{var} = os.environ.get("{env_name}")'
            applied.append(AppliedFix("SEC-001", f"Moved hardcoded credential '{var}' to an environment variable", index))
        elif re.search(r"hashlib\.(md5|sha1)\(", line):
            new_line = re.sub(r"hashlib\.(md5|sha1)\(", "hashlib.sha256(", line)
            applied.append(AppliedFix("SEC-007", "Upgraded weak hash (MD5/SHA-1) to SHA-256", index))
        elif "verify=False" in line or "verify = False" in line:
            new_line = line.replace("verify=False", "verify=True").replace("verify = False", "verify=True")
            applied.append(AppliedFix("SEC-008", "Re-enabled TLS certificate verification", index))
        elif re.search(r"==\s*None|!=\s*None", line):
            new_line = re.sub(r"==\s*None", "is None", line)
            new_line = re.sub(r"!=\s*None", "is not None", new_line)
            applied.append(AppliedFix("BUG-003", "Replaced == None comparison with 'is None'", index))
        elif re.match(r"^\s*except\s*:\s*$", line):
            new_line = re.sub(r"except\s*:", "except Exception:", line)
            applied.append(AppliedFix("BUG-001", "Replaced bare except with 'except Exception'", index))

        out.append(new_line)

    fixed = "\n".join(out)
    if is_python and applied:
        rule_ids = {fix.rule_id for fix in applied}
        header: list[str] = []
        if "SEC-001" in rule_ids and not re.search(r"^import os\b", fixed, re.MULTILINE):
            header.append("import os")
        if header:
            fixed = "\n".join(header) + "\n" + fixed
    return fixed, applied
