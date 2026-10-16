"""GitHub Pull Request fetching (public repos, no token required)."""

import re
import urllib.error
import urllib.request

_PR_URL_RE = re.compile(r"^https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)")


def parse_pr_url(url: str) -> tuple[str, str, int]:
    match = _PR_URL_RE.match(url.strip())
    if not match:
        raise ValueError("Expected a URL like https://github.com/owner/repo/pull/123")
    owner, repo, number = match.groups()
    return owner, repo, int(number)


def fetch_pr_diff(url: str) -> tuple[str, str]:
    """Return (title, unified_diff_text) for a public pull request."""
    owner, repo, number = parse_pr_url(url)
    api_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{number}"
    headers = {"User-Agent": "pr-review-assistant/1.0"}

    meta_req = urllib.request.Request(api_url, headers={**headers, "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(meta_req, timeout=20) as resp:  # noqa: S310 - fixed https host
            import json

            meta = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ValueError(f"GitHub returned {exc.code}. The repo may be private or the PR may not exist.") from exc
    except urllib.error.URLError as exc:
        raise ValueError("Could not reach GitHub. Check your network connection.") from exc

    diff_req = urllib.request.Request(api_url, headers={**headers, "Accept": "application/vnd.github.v3.diff"})
    with urllib.request.urlopen(diff_req, timeout=30) as resp:  # noqa: S310
        diff_text = resp.read().decode("utf-8", errors="replace")

    title = f"{owner}/{repo} #{number}: {meta.get('title', 'Pull request')}"
    return title, diff_text
