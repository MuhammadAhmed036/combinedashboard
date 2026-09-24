#!/usr/bin/env node
// Runs before dev/build/start so a missing or half-filled .env fails loudly
// right away, instead of silently shipping a broken build. In Docker, the
// standalone server.js bypasses npm scripts entirely, so this same file is
// also invoked directly by docker/entrypoint.sh on every container start.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_VARS = [
  "DETECTION_API_BASE_URL",
  "STREAMS_API_URL",
  "STREAMS_API_USERNAME",
  "STREAMS_API_PASSWORD",
  "CAMERA_FEED_BASE_URL",
  "CAMERA_FEED_USERNAME",
  "CAMERA_FEED_PASSWORD",
  "LOCAL_DB_USER",
  "LOCAL_DB_PASSWORD",
  "LOCAL_DB_NAME",
  "LOCAL_DB_PORT",
  "DATABASE_URL",
  "TEAM_DATABASE_URL",
  "PERSON_COUNT_WS_URL",
];
// RAW_IMAGE_RETENTION_TARGET is intentionally not required — the code
// defaults to 100 when it's unset.

const envPath = resolve(process.cwd(), ".env");

function fail(lines) {
  console.error("\n\x1b[31m✖ Environment check failed\x1b[0m");
  lines.forEach((line) => console.error(`  ${line}`));
  console.error("");
  process.exit(1);
}

if (!existsSync(envPath)) {
  fail([
    "No .env file found in the project root.",
    "",
    "Fix:",
    "  cp .env.example .env",
    "  nano .env   # fill in the real, reachable addresses for this machine",
    "",
    "Then re-run this command.",
  ]);
}

const raw = readFileSync(envPath, "utf8");
const values = {};
for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const missing = [];
const placeholder = [];

for (const key of REQUIRED_VARS) {
  const value = values[key];
  if (!value) {
    missing.push(key);
  } else if (/<[A-Z_]+>/.test(value) || value === "change_me") {
    placeholder.push(`${key}=${value}`);
  }
}

if (missing.length > 0 || placeholder.length > 0) {
  const lines = [".env exists but isn't fully filled in:", ""];
  if (missing.length > 0) {
    lines.push("  Missing:");
    missing.forEach((key) => lines.push(`    ${key}`));
  }
  if (placeholder.length > 0) {
    lines.push("  Still using placeholder values from .env.example:");
    placeholder.forEach((entry) => lines.push(`    ${entry}`));
  }
  lines.push("", "Edit .env and set real values reachable from this machine, then re-run.");
  fail(lines);
}

console.log("\x1b[32m✓ .env looks complete\x1b[0m");
