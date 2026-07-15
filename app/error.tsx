"use client";

/**
 * Next.js App Router error boundary for the root route.
 * Catches errors in the page and all its child segments.
 * Does NOT catch errors in layout.tsx itself — for that we'd need global-error.tsx.
 */

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        minHeight: "60vh",
        padding: "40px 20px",
        background: "var(--bg-0, #07090d)",
        color: "var(--text-dim, #9aa8c7)",
        textAlign: "center",
        fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--red, #ef4444)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>

      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text, #e8eefc)" }}>
        Something went wrong
      </div>

      <div
        style={{
          fontSize: 13,
          maxWidth: 420,
          lineHeight: 1.6,
          color: "var(--text-mute, #6b7a99)",
        }}
      >
        {error.message || "An unexpected error occurred while loading the tracker."}
      </div>

      <style>{`
        .err-btn { cursor: pointer; transition: filter 0.12s, background 0.12s; }
        .err-btn-primary:hover { filter: brightness(1.1); }
        .err-btn-secondary:hover { background: var(--bg-2, #121826) !important; }
        .err-btn:focus-visible { outline: 2px solid var(--accent, #3d8bfd); outline-offset: 2px; }
      `}</style>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button
          type="button"
          className="err-btn err-btn-primary"
          onClick={reset}
          style={{
            height: 38,
            padding: "0 24px",
            borderRadius: 8,
            border: 0,
            background: "linear-gradient(180deg, #3d8bfd, #2563eb)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Try again
        </button>

        <button
          type="button"
          className="err-btn err-btn-secondary"
          onClick={() => { window.location.href = "/"; }}
          style={{
            height: 38,
            padding: "0 20px",
            borderRadius: 8,
            border: "1px solid var(--line, #243049)",
            background: "transparent",
            color: "var(--text-dim, #9aa8c7)",
            fontSize: 13,
          }}
        >
          Back to home
        </button>
      </div>

      {error.digest && (
        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: "var(--text-mute, #6b7a99)",
            fontFamily: "monospace",
          }}
        >
          Error ID: {error.digest}
        </div>
      )}
    </div>
  );
}
