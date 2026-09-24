import type { NextConfig } from "next";

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
