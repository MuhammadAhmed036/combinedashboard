"use client";

import { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only tick; SSR intentionally renders no clock to avoid a hydration mismatch.
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const label = now
    ? `${now.toLocaleDateString("en-US", {
        month: "long",
        day: "2-digit",
        year: "numeric",
      })}  ${now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })}`
    : "";

  return (
    <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
      <Calendar className="size-4" />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}
