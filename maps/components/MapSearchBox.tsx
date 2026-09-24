"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { Camera } from "@/lib/types";

export function MapSearchBox({
  cameras,
  onResult,
}: {
  cameras: Camera[];
  onResult: (camera: Camera) => void;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim().toLowerCase();
    if (!q) return;
    const match = cameras.find(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.zoneName.toLowerCase().includes(q) ||
        c.location.toLowerCase().includes(q)
    );
    if (match) onResult(match);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="absolute left-4 top-4 z-10 flex w-[min(320px,calc(100%-2rem))] items-center gap-2 rounded-md border border-surface-border bg-surface-2/95 px-3 py-2 shadow-sm backdrop-blur"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search location, camera, zone..."
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <kbd className="hidden shrink-0 rounded border border-surface-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
        Ctrl /
      </kbd>
    </form>
  );
}
