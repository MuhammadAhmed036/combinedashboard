'use client';

import { useEffect, useState } from 'react';
import { EMPTY_LUNA_LOOKUPS, type LunaLookups } from './lunaCardModel';

const REFRESH_MS = 60_000;
let cached: LunaLookups | null = null;

/**
 * Handler / list / camera display names from /api/luna/lookups (resolved and
 * cached server-side). Cards render with ids until this arrives; never blocks.
 */
export function useLunaLookups(): LunaLookups {
  const [lookups, setLookups] = useState<LunaLookups>(cached ?? EMPTY_LUNA_LOOKUPS);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetch('/api/luna/lookups', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!active || !data) return;
          cached = { handlers: data.handlers ?? {}, lists: data.lists ?? {}, streams: data.streams ?? {} };
          setLookups(cached);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return lookups;
}
