import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// @monaco-editor/react rejects its loader promise with "Canceled" when the
// editor unmounts mid-load (e.g. switching views). That cancellation is
// expected behaviour, not an application error — keep it out of the console.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: string } | string | undefined;
  const message = typeof reason === "string" ? reason : reason?.message;
  if (message === "Canceled") event.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
