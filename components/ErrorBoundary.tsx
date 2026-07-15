"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback rendered instead of the default one. */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  /** Called when an error is caught, useful for logging. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Generic error boundary that catches JavaScript errors anywhere in its child
 * component tree, logs them, and displays a fallback UI.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary fallback={<MyFallback />}>
 *   <MaybeCrashyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { fallback } = this.props;
    const { error } = this.state;

    if (typeof fallback === "function") {
      return fallback(error, this.handleReset);
    }
    if (fallback) {
      return fallback;
    }

    // Default fallback UI matching the dark theme
    return (
      <div
        role="alert"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "48px 20px",
          color: "var(--text-dim, #9aa8c7)",
          fontSize: 13,
          textAlign: "center",
          borderTop: "1px solid var(--line, #243049)",
          borderBottom: "1px solid var(--line, #243049)",
          background: "var(--bg-0, #07090d)",
          width: "100%",
        }}
      >
        <style>{`
          .eb-btn { cursor: pointer; transition: background 0.12s, border-color 0.12s; }
          .eb-btn:hover { background: var(--bg-hover, #1c2740) !important; border-color: #314365 !important; }
          .eb-btn:focus-visible { outline: 2px solid var(--accent, #3d8bfd); outline-offset: 2px; }
        `}</style>
        <svg
          width="36"
          height="36"
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
        <div style={{ fontWeight: 600 }}>Something went wrong</div>
        <div
          style={{
            color: "var(--text-mute, #6b7a99)",
            fontSize: 12,
            maxWidth: 400,
            lineHeight: 1.5,
          }}
        >
          {error.message || "An unexpected error occurred."}
        </div>
        <button
          type="button"
          className="eb-btn"
          onClick={this.handleReset}
          style={{
            marginTop: 4,
            height: 36,
            padding: "0 20px",
            borderRadius: 8,
            border: "1px solid var(--line, #243049)",
            background: "var(--bg-2, #121826)",
            color: "var(--text, #e8eefc)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
