// Multi-class region alerts: the server engine records a per-class breakdown and
// the alert UI shows every detected class, not only the rule's first one.
// Run: node --test 'tests/*.test.mjs'   (Node 22.18+)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { eventDetectedClasses, formatClassCounts, formatClassNames } from "../frontend/src/lib/detectionClasses.ts";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { countByClass } = require(resolve(root, "workers/sync-service/lib/class-counts.cjs"));

test("engine: per-class counts for each side of the zone", () => {
  const boxes = [
    { className: "car" }, { className: "car" }, { className: "truck" }, { className: "person" }, { className: "car" },
  ];
  assert.deepEqual(countByClass(boxes), { car: 3, truck: 1, person: 1 });
  assert.deepEqual(countByClass([]), {});
  assert.deepEqual(countByClass([{ className: "" }, null, {}]), {});
});

test("UI: detected classes come from the event's counts, most frequent first", () => {
  const event = {
    classCountsInside: { car: 9, person: 1 },
    classCountsOutside: { truck: 3, car: 4 },
    classNames: ["person", "truck", "car"], // rule order: person first
  };
  assert.deepEqual(eventDetectedClasses(event), ["car", "truck", "person"]);
  assert.equal(formatClassNames(eventDetectedClasses(event)), "Car, Truck, Person");
  assert.equal(formatClassCounts(event.classCountsOutside), "3 truck, 4 car");
});

test("UI: a vehicle-only event on a person+vehicle rule is not shown as person", () => {
  const event = { classCountsInside: {}, classCountsOutside: { car: 17 }, classNames: ["person", "truck", "car"] };
  assert.deepEqual(eventDetectedClasses(event), ["car"]);
});

test("UI: events recorded without a breakdown show every rule class, not just the first", () => {
  assert.deepEqual(eventDetectedClasses({ classCountsInside: {}, classCountsOutside: {}, classNames: ["person", "truck", "car"] }), [
    "person",
    "truck",
    "car",
  ]);
  assert.deepEqual(eventDetectedClasses({ classNames: [] }), []);
});

test("engine stores the breakdown in the shape the dashboard parses", () => {
  const engine = readFileSync(resolve(root, "workers/sync-service/index.js"), "utf8");
  assert.match(engine, /detectionsJson: JSON\.stringify\(\{ inside: countByClass\(insideBoxes\), outside: countByClass\(outsideBoxes\) \}\)/);
  const feed = readFileSync(resolve(root, "frontend/src/lib/services/alertEventsService.ts"), "utf8");
  assert.match(feed, /classCountsInside: normalizeClassCounts\(detectionsJson\.inside\)/);
  assert.match(feed, /classCountsOutside: normalizeClassCounts\(detectionsJson\.outside\)/);
  const rail = readFileSync(resolve(root, "frontend/src/components/command-wall/AlertRail.tsx"), "utf8");
  assert.equal(/classNames\?\.\[0\]/.test(rail), false, "AlertRail must not use only the rule's first class");
});
