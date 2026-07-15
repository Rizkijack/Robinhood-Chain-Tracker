"use client";

import { useEffect, useRef, useState } from "react";

interface SSEState<T> {
  data: T | null;
  connected: boolean;
  error: string | null;
}

/** Generic Server-Sent Events hook. Pass `null` to disconnect. */
export function useSSE<T>(url: string | null): SSEState<T> {
  const [state, setState] = useState<SSEState<T>>({
    data: null,
    connected: false,
    error: null,
  });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) {
      setState({ data: null, connected: false, error: null });
      return;
    }

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () =>
      setState((s) => ({ ...s, connected: true, error: null }));

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data) as T;
        setState({ data: parsed, connected: true, error: null });
      } catch (err) {
        setState((s) => ({
          ...s,
          connected: true,
          error: `Parse error: ${String(err)}`,
        }));
      }
    };

    es.onerror = () => {
      setState((s) => ({ ...s, connected: false, error: "Connection lost" }));
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url]);

  return state;
}
