import { useEffect, useState } from "react";
import { api, type AdminAnalytics } from "../lib/api";

export default function AdminPanel() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAdminAnalytics().then(setData).catch(() => setError("Could not load analytics — is the API running?"));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="card empty"><strong>Loading analytics...</strong></div>;

  return (
    <>
      <div className="stats-grid">
        <div className="card stat-card"><div className="stat-label">Registered users</div><div className="stat-value">{data.total_users}</div></div>
        <div className="card stat-card"><div className="stat-label">Total reviews</div><div className="stat-value">{data.total_reviews}</div></div>
        <div className="card stat-card"><div className="stat-label">Average score</div><div className="stat-value">{data.average_score}</div></div>
        <div className="card stat-card"><div className="stat-label">Critical issues caught</div><div className="stat-value" style={{ color: data.critical_issues ? "#f85149" : undefined }}>{data.critical_issues}</div></div>
      </div>
      <div className="analytics-grid">
        <div className="card card-pad">
          <div className="section-title">Most common bugs (all users)</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
            {data.top_rules.length === 0 && <span className="section-sub">No findings yet.</span>}
            {data.top_rules.map((r) => (
              <div key={r.rule_id} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                <span className="mono" style={{ color: "var(--accent)", fontWeight: 700 }}>{r.rule_id}</span>
                <span style={{ marginLeft: "auto", fontWeight: 700 }}>{r.count}x</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-title">Issues by category</div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 9 }}>
            {Object.entries(data.issues_by_category).map(([cat, count]) => (
              <div key={cat} style={{ display: "flex", gap: 10, fontSize: 13 }}>
                <span style={{ textTransform: "capitalize" }}>{cat}</span>
                <span style={{ marginLeft: "auto", fontWeight: 700 }}>{count}</span>
              </div>
            ))}
            {Object.keys(data.issues_by_category).length === 0 && <span className="section-sub">No findings yet.</span>}
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-title">Platform health</div>
          <p className="section-sub" style={{ marginTop: 10, lineHeight: 1.9 }}>
            {data.total_issues} total findings across {data.total_reviews} review(s).
            Admin analytics aggregates stored reviews; per-user data stays tied to accounts.
          </p>
        </div>
      </div>
    </>
  );
}
