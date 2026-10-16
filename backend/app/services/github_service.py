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


def parse_repo(value: str) -> tuple[str, str]:
    cleaned = value.strip().removesuffix("/")
    match = re.search(r"github\.com/([^/]+)/([^/]+)", cleaned)
    if match:
        return match.group(1), match.group(2).removesuffix(".git")
    parts = cleaned.split("/")
    if len(parts) == 2 and all(parts):
        return parts[0], parts[1]
    raise ValueError("Enter a repo as owner/repo or a GitHub repo URL")


def list_open_prs(value: str) -> list[dict]:
    owner, repo = parse_repo(value)
    api_url = f"https://api.github.com/repos/{owner}/{repo}/pulls?state=open&per_page=20"
    req = urllib.request.Request(
        api_url,
        headers={"User-Agent": "pr-review-assistant/1.0", "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310 - fixed https host
            import json

            pulls = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ValueError(f"GitHub returned {exc.code}. Check the repo name is public and correct.") from exc
    except urllib.error.URLError as exc:
        raise ValueError("Could not reach GitHub. Check your network connection.") from exc
    return [
        {
            "number": pr["number"],
            "title": pr["title"],
            "author": pr["user"]["login"],
            "url": pr["html_url"],
            "updated_at": pr["updated_at"],
        }
        for pr in pulls
    ]


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
