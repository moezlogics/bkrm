"use client";

import React from "react";

/**
 * Last resort when even the root layout failed: plain HTML, no app styles
 * (they may be what broke). Offline-aware and retries on reconnect.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
    const retry = () => reset();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [error, reset]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 24, margin: "0 0 8px" }}>{offline ? "You're offline" : "Something went wrong"}</h1>
            <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
              {offline ? "Check your connection — the page will reload when you're back online." : "Please try again in a moment."}
            </p>
            <button onClick={() => reset()} style={{ height: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#0f172a", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
