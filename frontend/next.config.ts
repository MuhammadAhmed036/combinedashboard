import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

function loadParentEnv() {
  const envPath = resolve(process.cwd(), "..", ".env");
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadParentEnv();

const nextConfig: NextConfig = {
  output: "standalone",
  // Defaults to roughly this machine's CPU core count, which on a
  // memory-constrained dev machine spawns enough parallel page-data workers
  // to exhaust RAM mid-build (observed: 15 workers, each dying with an
  // out-of-memory crash almost immediately). Capping this trades some build
  // speed for not crashing.
  experimental: {
    cpus: 2,
  },
};

export default nextConfig;
