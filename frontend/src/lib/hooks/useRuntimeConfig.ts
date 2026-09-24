"use client";

import { useEffect, useState } from "react";
import { getCachedRuntimeConfig, loadRuntimeConfig, type RuntimeConfig } from "@/lib/runtimeConfig";

/** `null` means not loaded yet — callers should fall back to their existing defaults. */
export function useRuntimeConfig(): RuntimeConfig | null {
  const [config, setConfig] = useState<RuntimeConfig | null>(getCachedRuntimeConfig);

  useEffect(() => {
    if (config) return;
    let cancelled = false;
    loadRuntimeConfig().then((resolved) => {
      if (!cancelled) setConfig(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  return config;
}
