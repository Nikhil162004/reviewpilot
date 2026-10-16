import { motion } from "framer-motion";
import { ArrowRight, Bot, GitPullRequest, ShieldCheck, Wand2, Zap } from "lucide-react";

const FEATURES = [
  { icon: <ShieldCheck size={19} />, title: "Security-first analysis", text: "Secrets, injection, unsafe deserialization and TLS mistakes — caught deterministically, with rule IDs you can cite." },
  { icon: <GitPullRequest size={19} />, title: "Real GitHub reviews", text: "Fetch any public PR, review it, and post the bot's verdict back as a GitHub comment." },
  { icon: <Wand2 size={19} />, title: "Auto-fix with proof", text: "Safe mechanical fixes applied automatically — then re-scored so you see the improvement, not just a promise." },
  { icon: <Bot size={19} />, title: "Chat with your review", text: "Ask what is dangerous, how to fix it, or whether it is safe to merge. Answers come from real findings." },
];

export default function Landing({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand"><span className="brand-glyph">RP</span> ReviewPilot</div>
        <button className="btn btn-accent" onClick={onEnter}>Launch app <ArrowRight size={15} /></button>
      </header>

      <motion.section className="landing-hero" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="landing-pill"><Zap size={13} /> Automated code review for student &amp; indie teams</div>
        <h1>Code reviews that<br />explain themselves.</h1>
        <p>
          ReviewPilot analyzes pasted code, git diffs and real GitHub pull requests with a deterministic
          rules + AST engine — scored, severity-ranked, and fixable in one click. No black box, no hallucinated line numbers.
        </p>
        <div className="landing-cta">
          <button className="btn btn-accent btn-large" onClick={onEnter}>Start reviewing — it's live <ArrowRight size={16} /></button>
          <span className="landing-note">No signup needed · Optional free AI key for deep review</span>
        </div>
        <div className="landing-stats">
          <div><strong>19</strong><span>analysis rules</span></div>
          <div><strong>3</strong><span>input modes</span></div>
          <div><strong>0–100</strong><span>health score</span></div>
          <div><strong>1-click</strong><span>auto-fix</span></div>
        </div>
      </motion.section>

      <section className="landing-grid">
        {FEATURES.map((f, i) => (
          <motion.div key={f.title} className="card landing-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 * i, duration: 0.4 }}>
            <div className="landing-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </motion.div>
        ))}
      </section>

      <footer className="landing-foot">
        Built as a final-year CSE project · FastAPI + React + Monaco · Deterministic engine, optional LLM enrichment
      </footer>
    </div>
  );
}
