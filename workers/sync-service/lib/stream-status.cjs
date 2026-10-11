// Camera status per stream from the streaming server's stream-status API
// (`{ streams: [{ name, online }] }`), keyed by lower-cased stream name:
// `online: true` -> "running", anything else -> "stopped". No dependencies:
// used by index.js and tests/pipeline-upstream.test.mjs.
function streamStatusMap(payload) {
  const map = new Map();
  const streams = payload && typeof payload === "object" ? payload.streams : undefined;
  if (!Array.isArray(streams)) return map;
  for (const row of streams) {
    if (!row || typeof row !== "object") continue;
    if (typeof row.name !== "string" || !row.name.trim()) continue;
    map.set(row.name.trim().toLowerCase(), row.online === true ? "running" : "stopped");
  }
  return map;
}

module.exports = { streamStatusMap };
