/** Deterministic line explainer — pattern-based, no API key needed. */

export function explainLine(content: string, language: string): string {
  const line = content.trim();
  if (!line) return "Blank line — separates logical sections for readability.";
  if (line.startsWith("#") || line.startsWith("//")) return "A comment. It documents intent for humans; the interpreter ignores it. Good comments explain *why*, not *what*.";
  if (/^(import|from)\s/.test(line)) return "An import statement — brings a module's functionality into this file's namespace so it can be used below.";
  if (/^(const|let|var)\s/.test(line)) return "A variable declaration. `const` cannot be reassigned; prefer it unless the value must change (then `let`).";
  if (/^\w+\s*=/.test(line) && !line.includes("==")) return "An assignment — evaluates the right-hand side and binds the result to the variable on the left.";
  if (/^(def|async def|function|func)\s/.test(line) || /^\s*(def|function)\s/.test(line)) return "A function definition. It runs only when called. Keep functions single-purpose so they stay testable.";
  if (/^class\s/.test(line)) return "A class definition — a blueprint bundling data (attributes) with behaviour (methods).";
  if (/^return\b/.test(line)) return "Returns a value to the caller and immediately exits the function. Code after it in the same block never runs.";
  if (/^if\b/.test(line)) return "A conditional branch — the indented block below runs only when this condition is true.";
  if (/^(for|while)\b/.test(line)) return "A loop — repeats the indented block. Watch for accidental O(n²) behaviour if another loop nests inside.";
  if (/^(try|except|catch|finally)\b/.test(line)) return "Error handling. `try` runs risky code; the handler decides what happens on failure. Specific exceptions are safer than bare ones.";
  if (/^(with|using)\b/.test(line)) return "A context manager — guarantees setup/teardown (like closing a file) even if an error occurs.";
  if (/^(print|console\.|logger\.|logging\.)/.test(line)) return "A logging/output statement. In production, structured logging with levels beats print statements.";
  if (/^@/.test(line)) return "A decorator — wraps the function below it to add behaviour (timing, auth, caching) without editing its body.";
  if (/^(SELECT|INSERT|UPDATE|DELETE)/i.test(line) || line.includes(".execute(") || line.includes(".query("))
    return "A database operation. It should use parameterized queries so user input can never be interpreted as SQL.";
  if (/\($/.test(line) || /\(\).*\{?$/.test(line) || /\w+\(.*\)\s*$/.test(line)) return "A function/method call — control jumps into that function with these arguments, then returns here.";
  if (line.endsWith("{")) return "Opens a new block/scope. Variables declared inside may not be visible outside it (language-dependent).";
  if (language === "python" && line.endsWith(":")) return "Ends a statement that owns the indented block below it (function, branch, loop, or handler).";
  return "A statement in the program's flow. If its purpose isn't obvious from naming, that's a signal a comment or a better name would help the next reader.";
}
