"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

type Status = "checking" | "ok" | "down";

function classifyError(message: string): string {
  const detail = message.trim();
  if (detail.includes("DATABASE_URL is not configured")) {
    return "DATABASE_URL is not set on this server. Copy .env.example to .env and fill in the Postgres connection string, then restart the app.";
  }
  const detailText = detail ? ` (${detail})` : "";
  return `Could not reach the database${detailText}. Check that DATABASE_URL in .env points to a Postgres instance this server can reach.`;
}

/**
 * Mounted once in the dashboard shell so a misconfigured or unreachable
 * backend fails loudly everywhere, instead of every widget separately going
 * quiet with no explanation (the failure mode this was built to catch: a
 * fresh clone with no .env file yet).
 */
export function BackendStatusBanner() {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      setStatus("checking");
      try {
        const response = await fetch("/api/stats", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || payload?.error) {
          setDetail(classifyError(String(payload?.error ?? `HTTP ${response.status}`)));
          setStatus("down");
        } else {
          setStatus("ok");
        }
      } catch (error) {
        if (cancelled) return;
        setDetail(classifyError(error instanceof Error ? error.message : "unknown error"));
        setStatus("down");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status !== "down") return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive sm:px-6">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>{detail}</span>
      </div>
      <button
        onClick={() => setAttempt((n) => n + 1)}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/30 px-2 py-1 text-xs font-medium hover:bg-destructive/15"
      >
        <RotateCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}
