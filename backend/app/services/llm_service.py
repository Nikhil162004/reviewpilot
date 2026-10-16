"""Optional LLM enrichment layer.

Interviews defence: the product is NOT "a ChatGPT wrapper". The deterministic
engine in analyzer.py produces all findings. If GROQ_API_KEY is set, this
layer only rewrites the human-readable summary — it never invents findings,
so reviews stay reproducible and explainable.
"""

import os


def llm_enabled() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


def enrich_summary(deterministic_summary: str, issues_json: str) -> str:
    """Return an LLM-polished summary, or the deterministic one unchanged."""
    if not llm_enabled():
        return deterministic_summary

    try:
        import httpx

        response = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"},
            json={
                "model": "llama-3.3-70b-versatile",
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": "Rewrite the code-review summary in 2 concise sentences. Do not add new findings."},
                    {"role": "user", "content": f"{deterministic_summary}\nFindings: {issues_json[:4000]}"},
                ],
            },
            timeout=20,
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        # Never let an optional enrichment break a review.
        return deterministic_summary
