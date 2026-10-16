import type { ReviewResult } from "../lib/types";

const COLORS: Record<string, string> = {
  critical: "#c81e1e", high: "#ea580c", medium: "#d97706", low: "#94a3b8",
  security: "#c81e1e", bug: "#7c3aed", performance: "#0e7490", style: "#64748b",
};

export function SeverityDonut({ reviews }: { reviews: ReviewResult[] }) {
  const totals = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of reviews) for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] += r.stats[k] ?? 0;
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={R} fill="none" stroke="#eceef2" strokeWidth="15" />
        {total > 0 && (Object.keys(totals) as Array<keyof typeof totals>).map((key) => {
          const frac = totals[key] / total;
          const el = (
            <circle key={key} cx="66" cy="66" r={R} fill="none" stroke={COLORS[key]} strokeWidth="15"
              strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-offset * C}
              transform="rotate(-90 66 66)" />
          );
          offset += frac;
          return el;
        })}
        <text x="66" y="63" textAnchor="middle" style={{ fontSize: 22, fontWeight: 750, fill: "#131722" }}>{total}</text>
        <text x="66" y="80" textAnchor="middle" style={{ fontSize: 10, fill: "#8a94a3", fontWeight: 600 }}>ISSUES</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {(Object.keys(totals) as Array<keyof typeof totals>).map((key) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: COLORS[key] }} />
            <span style={{ textTransform: "capitalize", color: "#5b6472", width: 62 }}>{key}</span>
            <strong>{totals[key]}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreTrend({ reviews }: { reviews: ReviewResult[] }) {
  const points = [...reviews].slice(0, 12).reverse();
  if (points.length < 2) return <div className="section-sub">Run at least two reviews to see the score trend.</div>;
  const W = 300, H = 92, max = 100;
  const coords = points.map((r, i) => `${(i / (points.length - 1)) * (W - 16) + 8},${H - 10 - (r.score / max) * (H - 24)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <line x1="8" y1={H - 10} x2={W - 8} y2={H - 10} stroke="#e8ebef" />
      <polyline points={coords} fill="none" stroke="#0e7490" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((r, i) => {
        const x = (i / (points.length - 1)) * (W - 16) + 8;
        const y = H - 10 - (r.score / max) * (H - 24);
        return <g key={r.id}><circle cx={x} cy={y} r="3.6" fill="#fff" stroke="#0e7490" strokeWidth="2.2" /><text x={x} y={y - 8} textAnchor="middle" style={{ fontSize: 9.5, fill: "#5b6472", fontWeight: 700 }}>{r.score}</text></g>;
      })}
    </svg>
  );
}

export function CategoryBars({ scores }: { scores: Record<string, number> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
      {Object.entries(scores).map(([cat, score]) => (
        <div key={cat}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
            <span style={{ textTransform: "capitalize", fontWeight: 600 }}>{cat}</span>
            <span className="mono" style={{ fontWeight: 700, color: score >= 75 ? "#15803d" : score >= 50 ? "#b45309" : "#c81e1e" }}>{score}/100</span>
          </div>
          <div style={{ height: 8, background: "#eceef2", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ width: `${score}%`, height: "100%", background: COLORS[cat] ?? "#0e7490", borderRadius: 99, transition: "width .5s" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TopRules({ reviews }: { reviews: ReviewResult[] }) {
  const counts = new Map<string, { title: string; count: number; severity: string }>();
  for (const r of reviews) for (const i of r.issues) {
    const cur = counts.get(i.rule_id) ?? { title: i.title, count: 0, severity: i.severity };
    cur.count += 1;
    counts.set(i.rule_id, cur);
  }
  const top = [...counts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  if (!top.length) return <div className="section-sub">No findings yet.</div>;
  const max = top[0][1].count;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {top.map(([ruleId, v]) => (
        <div key={ruleId}>
          <div style={{ display: "flex", gap: 8, fontSize: 12.5, marginBottom: 4, alignItems: "baseline" }}>
            <span className="mono" style={{ fontWeight: 700, color: "#0e7490" }}>{ruleId}</span>
            <span style={{ color: "#3c4554", flex: 1 }}>{v.title}</span>
            <strong>{v.count}×</strong>
          </div>
          <div style={{ height: 6, background: "#eceef2", borderRadius: 99 }}>
            <div style={{ width: `${(v.count / max) * 100}%`, height: "100%", borderRadius: 99, background: COLORS[v.severity] ?? "#94a3b8" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
