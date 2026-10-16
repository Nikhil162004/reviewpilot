import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ReviewResult } from "../lib/types";

const SEV_COLORS: Record<string, string> = {
  critical: "#f85149", high: "#fb8500", medium: "#d29922", low: "#8b949e",
};
const CAT_COLORS: Record<string, string> = {
  security: "#f85149", bug: "#a371f7", performance: "#39c5cf", style: "#8b949e",
};
const tooltipStyle = {
  background: "#0d1424", border: "1px solid #22304d", borderRadius: 10,
  color: "#e6edf3", fontSize: 12.5,
};

export function SeverityDonut({ reviews }: { reviews: ReviewResult[] }) {
  const totals = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of reviews) for (const k of Object.keys(totals) as Array<keyof typeof totals>) totals[k] += r.stats[k] ?? 0;
  const data = Object.entries(totals).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <div className="section-sub">No findings yet — run a review or generate the demo dataset.</div>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 148, height: 148, position: "relative", flexShrink: 0 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={68} paddingAngle={3} strokeWidth={0}>
              {data.map((d) => <Cell key={d.name} fill={SEV_COLORS[d.name]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none" }}>
          <div><div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{total}</div><div style={{ fontSize: 9.5, color: "#8b949e", fontWeight: 700 }}>ISSUES</div></div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {Object.entries(totals).map(([key, value]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: SEV_COLORS[key] }} />
            <span style={{ textTransform: "capitalize", color: "#9aa7ba", width: 60 }}>{key}</span><strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoreTrend({ reviews }: { reviews: ReviewResult[] }) {
  const data = [...reviews].slice(0, 12).reverse().map((r, i) => ({ n: i + 1, score: r.score }));
  if (data.length < 2) return <div className="section-sub">Run at least two reviews — or generate the demo dataset — to see the trend.</div>;
  return (
    <ResponsiveContainer width="100%" height={132}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1c2534" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="n" stroke="#66738a" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} stroke="#66738a" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}/100`, "Score"]} labelFormatter={(l) => `Review #${l}`} />
        <Area type="monotone" dataKey="score" stroke="#2dd4bf" strokeWidth={2.5} fill="url(#scoreFill)" dot={{ r: 3, fill: "#0d1424", stroke: "#2dd4bf", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryBars({ scores }: { scores: Record<string, number> }) {
  const data = Object.entries(scores).map(([name, score]) => ({ name, score }));
  return (
    <ResponsiveContainer width="100%" height={168}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#1c2534" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis type="category" dataKey="name" stroke="#9aa7ba" fontSize={12} tickLine={false} axisLine={false} width={78}
          tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}/100`, "Score"]} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={15}>
          {data.map((d) => <Cell key={d.name} fill={CAT_COLORS[d.name] ?? "#2dd4bf"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopRules({ reviews }: { reviews: ReviewResult[] }) {
  const counts = new Map<string, { title: string; count: number; severity: string }>();
  for (const r of reviews) for (const i of r.issues) {
    const cur = counts.get(i.rule_id) ?? { title: i.title, count: 0, severity: i.severity };
    cur.count += 1;
    counts.set(i.rule_id, cur);
  }
  const data = [...counts.entries()]
    .map(([rule, v]) => ({ rule, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  if (!data.length) return <div className="section-sub">No findings yet.</div>;
  return (
    <ResponsiveContainer width="100%" height={168}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#1c2534" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="rule" stroke="#9aa7ba" fontSize={11.5} tickLine={false} axisLine={false} width={64} />
        <Tooltip contentStyle={tooltipStyle}
          formatter={(_v, _n, item) => {
            const p = (item as { payload?: { title?: string; count?: number } }).payload;
            return [`${p?.count ?? 0}× — ${p?.title ?? ""}`, "Triggered"];
          }}
          cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={15}>
          {data.map((d) => <Cell key={d.rule} fill={SEV_COLORS[d.severity] ?? "#8b949e"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function qualityGate(review: ReviewResult): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (review.score < 75) reasons.push(`Score ${review.score} is below the 75 threshold`);
  if ((review.stats.critical ?? 0) > 0) reasons.push(`${review.stats.critical} critical issue(s) must be fixed`);
  if ((review.stats.high ?? 0) > 2) reasons.push(`${review.stats.high} high-severity issues (max allowed: 2)`);
  return { passed: reasons.length === 0, reasons };
}

export function estimatedEffort(review: ReviewResult): string {
  const minutes =
    (review.stats.critical ?? 0) * 45 + (review.stats.high ?? 0) * 30 +
    (review.stats.medium ?? 0) * 15 + (review.stats.low ?? 0) * 5;
  if (minutes === 0) return "0 min";
  if (minutes < 60) return `~${minutes} min`;
  return `~${(minutes / 60).toFixed(1)} hrs`;
}
