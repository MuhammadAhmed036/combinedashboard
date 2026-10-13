// Sync source column selection: works against the plain YOLO Stage 2 table
// (no worker_id) and against a compat view that adds it.
// Run: node --test 'tests/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { buildSourceSelect, REQUIRED_SOURCE_COLUMNS } = require(resolve(root, "workers/sync-service/lib/source-columns.cjs"));

// The columns the mirror stores (workers/sync-service/index.js DETECTION_EVENTS_COLUMNS).
const WANTED = [
  "id", "event_id", "camera_id", "camera_ip", "zone", "scene", "detection_ts",
  "model_name", "backend", "device", "image_width", "image_height", "detection_count",
  "decode_ms", "preprocess_ms", "inference_ms", "postprocess_ms", "total_ms",
  "detections_json", "raw_image_path", "raw_image_status", "worker_id", "created_at",
];

// public.detection_events as created by the YOLO Stage 2 tar (f812553) — no worker_id.
const PLAIN_YOLO = "id,event_id,source_subject,output_subject,camera_id,camera_ip,zone,scene,tags_json,detection_ts,model_name,backend,device,image_width,image_height,payload_bytes,detection_count,decode_ms,preprocess_ms,inference_ms,postprocess_ms,total_ms,detections_json,event_json,raw_image_path,annotated_image_path,created_at,raw_image_status,raw_image_deleted_at,raw_image_delete_reason".split(",");

test("plain YOLO table: only worker_id is missing, mirrored as NULL, nothing required missing", () => {
  const s = buildSourceSelect(WANTED, PLAIN_YOLO);
  assert.deepEqual(s.missing, ["worker_id"]);
  assert.deepEqual(s.missingRequired, []);
  assert.match(s.list, /,NULL AS worker_id,created_at$/);
  assert.equal(s.list.split(",").length, WANTED.length, "same column count and order as the local mirror");
});

test("compat view with worker_id (.213): plain column list, nothing missing", () => {
  const s = buildSourceSelect(WANTED, [...PLAIN_YOLO, "worker_id", "worker_ip", "receiver_id"]);
  assert.deepEqual(s.missing, []);
  assert.equal(s.list, WANTED.join(","));
});

test("no raw_image_status at the source: mirrored as 'available' (local column is NOT NULL)", () => {
  const s = buildSourceSelect(WANTED, PLAIN_YOLO.filter((c) => c !== "raw_image_status"));
  assert.ok(s.missing.includes("raw_image_status"));
  assert.match(s.list, /'available' AS raw_image_status/);
});

test("a source without a required column is reported, not silently mirrored", () => {
  const s = buildSourceSelect(WANTED, PLAIN_YOLO.filter((c) => c !== "detections_json" && c !== "created_at"));
  assert.deepEqual(s.missingRequired, ["detections_json", "created_at"]);
  assert.ok(REQUIRED_SOURCE_COLUMNS.includes("id"));
});
