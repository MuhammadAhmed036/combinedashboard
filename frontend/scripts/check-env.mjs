#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", ".env"),
  resolve(here, "..", ".env"),
  resolve(here, "..", "..", ".env"),
];
const envPath = candidates.find((path) => existsSync(path));

function fail(lines) {
  console.error("\n\x1b[31mEnvironment check failed\x1b[0m");
  lines.forEach((line) => console.error(`  ${line}`));
  console.error("");
  process.exit(1);
}

const values = { ...process.env };

if (envPath) {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    values[key] = trimmed.slice(eq + 1).trim();
  }
}

const missing = [];
const placeholder = [];

for (const key of REQUIRED_VARS) {
  const value = values[key];
  if (!value) {
    missing.push(key);
  } else if (/<[A-Z_]+>/.test(value) || value === "change_me") {
    placeholder.push(`${key}=<placeholder>`);
  }
}

if (missing.length > 0 || placeholder.length > 0) {
  const source = envPath ? `.env at ${envPath}` : "process environment";
  const lines = [`Environment from ${source} is not fully filled in:`, ""];
  if (missing.length > 0) {
    lines.push("Missing:");
    missing.forEach((key) => lines.push(`  ${key}`));
  }
  if (placeholder.length > 0) {
    lines.push("Placeholder values:");
    placeholder.forEach((entry) => lines.push(`  ${entry}`));
  }
  fail(lines);
}

console.log("\x1b[32m.env looks complete\x1b[0m");
