/**
 * Deterministic PRNG so server-rendered and client-hydrated output match
 * exactly (Math.random()/Date.now() would cause hydration mismatches).
 * All mock data is generated relative to a fixed reference timestamp that
 * mirrors the date/time shown in the reference screenshots.
 */
export function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number) {
  const rand = mulberry32(seed);
  return {
    next: () => rand(),
    int: (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min,
    float: (min: number, max: number, decimals = 2) => {
      const v = rand() * (max - min) + min;
      const p = 10 ** decimals;
      return Math.round(v * p) / p;
    },
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)],
    bool: (chance = 0.5) => rand() < chance,
    shuffle: <T>(arr: readonly T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// Fixed "now" used by all mock generators — matches the reference design's
// demo date so timestamps/relative offsets are stable across server/client.
export const REFERENCE_NOW = new Date("2025-05-24T14:45:36");
