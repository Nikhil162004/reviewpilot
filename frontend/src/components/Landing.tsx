interface Props {
  onEnter: () => void;
  onGuide: () => void;
  onDashboard: () => void;
}

const FEATURES: Array<[string, string, string]> = [
  ["01", "Finds the mistakes that matter first", "Hardcoded passwords, SQL built from user input, pickle on untrusted data, TLS checks switched off. Each finding has a rule number, the exact line, and what to change."],
  ["02", "Works on real pull requests", "Paste a GitHub PR link or browse a public repo inside the app. When you are done, the same report can be posted back to GitHub as a comment."],
  ["03", "Fixes the mechanical problems for you", "Secrets move to environment variables, MD5 becomes SHA-256, bare except clauses get a real exception type. The review runs again afterwards so the score change is measured, not promised."],
  ["04", "You can question the result", "Ask the assistant panel which finding is dangerous, or type \"fix issue 2\" and watch it work. If you add your own Groq or Gemini key, a language model reads the logic as well."],
];

export default function Landing({ onEnter, onGuide, onDashboard }: Props) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <button className="landing-brand" onClick={onEnter} title="ReviewPilot home">
          <span className="brand-glyph">RP</span> ReviewPilot
        </button>
        <nav className="landing-links">
          <button onClick={onGuide}>How it works</button>
          <button onClick={onDashboard}>Dashboard</button>
          <button className="btn btn-primary" onClick={onEnter}>Open the app</button>
        </nav>
      </header>

      <section className="landing-hero">
        <h1>First-pass code review, done in seconds.</h1>
        <p className="landing-lede">
          ReviewPilot reads pasted code, git diffs and GitHub pull requests, then tells you in plain
          language what is wrong, where it is, and how serious it is. It was built so a student team
          could show their working: every automated finding comes from a rule you can open and read.
        </p>
        <div className="landing-cta">
          <button className="btn btn-primary btn-large" onClick={onEnter}>Start a review</button>
          <button className="btn btn-ghost btn-large" onClick={onGuide}>Read how it works</button>
        </div>
        <dl className="landing-stats">
          <div><dt>19</dt><dd>checks run on every review</dd></div>
          <div><dt>3</dt><dd>ways to submit code</dd></div>
          <div><dt>0 to 100</dt><dd>health score, with the maths shown</dd></div>
          <div><dt>15+</dt><dd>automated tests in the repo</dd></div>
        </dl>
      </section>

      <section className="landing-features">
        <h2>What it actually does</h2>
        {FEATURES.map(([num, title, text]) => (
          <article key={num} className="landing-feature">
            <span className="landing-feature-num">{num}</span>
            <div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </section>

      <footer className="landing-footer">
        <div>
          <strong>ReviewPilot</strong>
          <span>Built by a final-year CSE student for placement demonstrations and viva.</span>
        </div>
        <nav>
          <button onClick={onGuide}>How it works</button>
          <button onClick={onDashboard}>Dashboard</button>
          <button onClick={onEnter}>Open the app</button>
        </nav>
        <div className="landing-contact">
          <span>Questions: <a href="mailto:reviewpilot.project@gmail.com">reviewpilot.project@gmail.com</a></span>
          <span>© 2026 ReviewPilot. Source available in the project repository.</span>
        </div>
      </footer>
    </div>
  );
}
