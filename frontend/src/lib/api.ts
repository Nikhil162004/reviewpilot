import type { DashboardStats, ReviewResult } from "./types";

const TOKEN_KEY = "rp_token";
const USER_KEY = "rp_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser(): { id: string; email: string } | null {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
}
export function setSession(token: string, user: { id: string; email: string }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) detail = String(body.detail);
    } catch { /* keep default */ }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export interface PrItem { number: number; title: string; author: string; url: string; updated_at: string }
export interface AdminAnalytics {
  total_users: number; total_reviews: number; average_score: number;
  total_issues: number; critical_issues: number;
  top_rules: Array<{ rule_id: string; count: number }>;
  issues_by_category: Record<string, number>;
}

export const api = {
  reviewCode: (code: string, filename: string, title: string) =>
    request<ReviewResult>("/api/review/code", { method: "POST", body: JSON.stringify({ code, filename, title }) }),

  reviewDiff: (diff: string, title: string) =>
    request<ReviewResult>("/api/review/diff", { method: "POST", body: JSON.stringify({ diff, title }) }),

  reviewGitHubPR: (url: string) =>
    request<ReviewResult>("/api/review/github-pr", { method: "POST", body: JSON.stringify({ url }) }),

  listReviews: () => request<ReviewResult[]>("/api/reviews"),
  getReview: (id: string) => request<ReviewResult>(`/api/reviews/${id}`),
  getStats: () => request<DashboardStats>("/api/stats"),
  getAdminAnalytics: () => request<AdminAnalytics>("/api/admin/analytics"),

  applyFixes: (code: string, filename: string) =>
    request<{ fixed_code: string; applied: Array<{ rule_id: string; description: string; line: number }> }>(
      "/api/fix", { method: "POST", body: JSON.stringify({ code, filename }) }),

  listGitHubPRs: (repo: string) => request<PrItem[]>(`/api/github/prs?repo=${encodeURIComponent(repo)}`),

  postGitHubComment: (token: string, prUrl: string, reviewId: string) =>
    request<{ comment_url: string }>("/api/github/comment", {
      method: "POST", body: JSON.stringify({ token, pr_url: prUrl, review_id: reviewId }),
    }),

  register: (email: string, password: string) =>
    request<{ id: string; email: string; token: string }>("/api/auth/register", {
      method: "POST", body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ id: string; email: string; token: string }>("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    }),

  llmReview: (code: string, filename: string, apiKey: string, provider: string) =>
    request<{ provider: string; review: string }>("/api/llm/review", {
      method: "POST", body: JSON.stringify({ code, filename, api_key: apiKey, provider }),
    }),

  generateTests: (code: string, filename: string) =>
    request<{ test_code: string; test_filename: string }>("/api/tests/generate", {
      method: "POST", body: JSON.stringify({ code, filename }),
    }),
};
