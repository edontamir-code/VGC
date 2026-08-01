import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Offline shell. Dev is excluded so hot reload is never served from cache.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // The ?v= is what makes a redeploy reach an already-installed PWA.
    navigator.serviceWorker.register(`./sw.js?v=${__BUILD_ID__}`).catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  });
}
