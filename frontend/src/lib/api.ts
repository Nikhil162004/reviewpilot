import type { DashboardStats, ReviewResult } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* keep default message */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const api = {
  reviewCode: (code: string, filename: string, title: string) =>
    request<ReviewResult>("/api/review/code", {
      method: "POST",
      body: JSON.stringify({ code, filename, title }),
    }),

  reviewDiff: (diff: string, title: string) =>
    request<ReviewResult>("/api/review/diff", {
      method: "POST",
      body: JSON.stringify({ diff, title }),
    }),

  reviewGitHubPR: (url: string) =>
    request<ReviewResult>("/api/review/github-pr", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  listReviews: () => request<ReviewResult[]>("/api/reviews"),
  getStats: () => request<DashboardStats>("/api/stats"),

  applyFixes: (code: string, filename: string) =>
    request<{ fixed_code: string; applied: Array<{ rule_id: string; description: string; line: number }> }>(
      "/api/fix",
      { method: "POST", body: JSON.stringify({ code, filename }) },
    ),

  listGitHubPRs: (repo: string) =>
    request<Array<{ number: number; title: string; author: string; url: string; updated_at: string }>>(
      `/api/github/prs?repo=${encodeURIComponent(repo)}`,
    ),
};
