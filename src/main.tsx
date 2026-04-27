import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// PWA back button: prevent Android hardware back from closing the app.
// Pushes a sentinel history entry on load; when popstate fires back to it,
// we immediately re-push it so the user stays in the app instead of exiting.
const isPWA =
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;
if (isPWA) {
  window.history.pushState({ __pwa_sentinel__: true }, "");
  window.addEventListener("popstate", (e: PopStateEvent) => {
    if ((e.state as any)?.__pwa_sentinel__) {
      window.history.pushState({ __pwa_sentinel__: true }, "");
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}
