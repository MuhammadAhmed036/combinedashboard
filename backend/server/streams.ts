import "server-only";

import type { Camera, CameraStatus } from "@/lib/types";
import { authenticatedFetch } from "@/lib/server/authenticatedFetch";

type UnknownRecord = Record<string, unknown>;

interface NormalizedStream {
  id: string;
  sourceName: string;
  displayName: string;
  status: CameraStatus;
  location: string;
  zoneName: string;
  upstreamFeedUrl?: string;
}

let streamCache: { expiresAt: number; data: NormalizedStream[] } | null = null;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function firstString(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function recordValues(record: UnknownRecord): unknown[] {
  return Object.entries(record).map(([name, value]) =>
    value && typeof value === "object" ? { name, ...asRecord(value) } : { name, status: value }
  );
}

function cameraRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  for (const key of ["rows", "data", "streams", "cameras", "results", "items"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    const nested = asRecord(value);
    for (const nestedKey of ["streams", "cameras", "items", "results"]) {
      if (Array.isArray(nested[nestedKey])) return nested[nestedKey] as unknown[];
    }
    if (Object.keys(nested).length) return recordValues(nested);
  }
  return Object.keys(record).length ? recordValues(record) : [];
}

function streamStatus(record: UnknownRecord): CameraStatus {
  for (const key of ["online", "is_online", "isOnline", "active", "ready"]) {
    if (typeof record[key] === "boolean") return record[key] ? "online" : "offline";
  }

  const value = firstString(record, ["ffmpeg", "status", "state", "health"])?.toLowerCase();
  return ["online", "active", "ready", "running", "connected", "up"].includes(value ?? "")
    ? "online"
    : "offline";
}

// Deliberately minimal/incomplete WebRTC offer. MediaMTX's WHEP endpoint
// checks whether the requested path has an active publisher BEFORE it
// validates the SDP body, responding 404 immediately if there's no source
// — so this never needs to complete a real handshake to learn what it came
// for. Confirmed against this deployment: a relay whose `ffmpeg` process
// reports "running" but whose configured upstream camera is unreachable
// still 404s here, while every camera that's actually playable returns a
// different status (typically 400, since this SDP is intentionally
// incomplete — a real player's valid offer would get 201).
const WHEP_PROBE_SDP = [
  "v=0",
  "o=- 0 0 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
  "c=IN IP4 0.0.0.0",
  "a=rtpmap:96 H264/90000",
  "a=sendrecv",
  "a=setup:actpass",
  "a=ice-ufrag:probe",
  "a=ice-pwd:probeprobeprobeprobeprobe",
  "",
].join("\r\n");

const STREAM_HEALTH_TIMEOUT_MS = 4000;

/**
 * Whether a stream is actually playable right now, checked directly against
 * the media server rather than trusted from the stream-list API's own
 * self-reported fields (which only reflect whether the relay *process* is
 * alive, not whether real video is flowing — see `WHEP_PROBE_SDP` above).
 * Returns `null` when there's no way to check (feed base URL unconfigured),
 * so the caller can fall back to the list API's own status instead of
 * inventing one.
 */
async function checkStreamHealth(sourceName: string): Promise<boolean | null> {
  const baseValue = process.env.CAMERA_FEED_BASE_URL;
  if (!baseValue) return null;

  try {
    const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
    const probeUrl = new URL(`${encodeURIComponent(sourceName)}/whep`, base);
    const response = await authenticatedFetch(
      probeUrl.toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: WHEP_PROBE_SDP,
        signal: AbortSignal.timeout(STREAM_HEALTH_TIMEOUT_MS),
      },
      {
        username: process.env.CAMERA_FEED_USERNAME,
        password: process.env.CAMERA_FEED_PASSWORD,
      }
    );
    return response.status !== 404;
  } catch {
    // Media server unreachable or the probe timed out — can't confirm the
    // stream is live, so don't claim that it is.
    return false;
  }
}

function normalizeStream(value: unknown): NormalizedStream | null {
  if (typeof value === "string" && value.trim()) {
    return {
      id: value.trim(),
      sourceName: value.trim(),
      displayName: value.trim(),
      status: "online",
      location: "Live camera stream",
      zoneName: "Live Streams",
    };
  }

  const record = asRecord(value);
  const sourceName = firstString(record, [
    "camera_name",
    "cameraName",
    "stream_name",
    "streamName",
    "path",
    "name",
    "id",
  ]);
  if (!sourceName || /^[-_\s]+$/.test(sourceName)) return null;

  const id = firstString(record, ["id", "camera_id", "cameraId"]) ?? sourceName;
  return {
    id,
    sourceName,
    displayName:
      firstString(record, ["display_name", "displayName", "title", "name"]) ??
      sourceName,
    status: streamStatus(record),
    location:
      firstString(record, ["location", "address", "description"]) ?? "Live camera stream",
    zoneName: firstString(record, ["zone_name", "zoneName", "zone"]) ?? "Live Streams",
    upstreamFeedUrl: firstString(record, [
      "output_url",
      "outputUrl",
      "feed_url",
      "feedUrl",
      "stream_url",
      "streamUrl",
      "url",
    ]),
  };
}

function safeId(value: string): string {
  return value || "camera";
}

function buildPlayerUrl(sourceName: string): string | undefined {
  const baseValue = process.env.CAMERA_FEED_BASE_URL;
  if (!baseValue) return undefined;

  try {
    const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
    return new URL(`${encodeURIComponent(sourceName)}/`, base).toString();
  } catch {
    return undefined;
  }
}

function toCamera(stream: NormalizedStream, aiCameraNames: Set<string>): Camera {
  const zoneId = stream.zoneName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "live-streams";
  const hasAiAnalytics = aiCameraNames.has(stream.sourceName.toLowerCase());
  return {
    id: safeId(stream.id),
    code: stream.sourceName,
    name: stream.displayName,
    zoneId,
    zoneName: stream.zoneName,
    location: stream.location,
    position: [73.0479, 33.7295],
    status: stream.status,
    type: "Fixed",
    currentPersonCount: 0,
    density: "Low",
    densityPercent: 0,
    aiFeatures: hasAiAnalytics
      ? [{ id: "ai-analytics", label: "AI Analytics", active: true }]
      : [],
    thumbnailSeed: stream.sourceName,
    isFavorite: false,
    sourceName: stream.sourceName,
    proxy_feed_url: `/api/camera-feed/${encodeURIComponent(stream.sourceName)}`,
    proxyFeedUrl: `/api/camera-feed/${encodeURIComponent(stream.sourceName)}`,
    playerUrl: buildPlayerUrl(stream.sourceName),
  };
}

export async function fetchStreams(): Promise<NormalizedStream[]> {
  if (streamCache && streamCache.expiresAt > Date.now()) return streamCache.data;

  const url = process.env.STREAMS_API_URL;
  if (!url) throw new Error("STREAMS_API_URL is not configured");

  const response = await authenticatedFetch(
    url,
    { headers: { Accept: "application/json" } },
    {
      username: process.env.STREAMS_API_USERNAME,
      password: process.env.STREAMS_API_PASSWORD,
    }
  );

  if (!response.ok) {
    throw new Error(`Streams API returned ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const streams = cameraRows(payload)
    .map((value) => normalizeStream(value))
    .filter((stream): stream is NormalizedStream => Boolean(stream));

  // Override the list API's self-reported status with a real health probe
  // — see `checkStreamHealth` for why that field alone isn't trustworthy.
  const healthResults = await Promise.all(
    streams.map((stream) => checkStreamHealth(stream.sourceName))
  );
  const healthyStreams = streams.map((stream, index) => {
    const health = healthResults[index];
    // `null` means health-checking isn't configured for this deployment —
    // fall back to whatever the list API itself reported instead of
    // guessing.
    return health === null ? stream : { ...stream, status: (health ? "online" : "offline") as CameraStatus };
  });

  streamCache = { data: healthyStreams, expiresAt: Date.now() + 4000 };
  return healthyStreams;
}

export async function fetchStreamCameras(): Promise<Camera[]> {
  const [streams, aiCameraNames] = await Promise.all([
    fetchStreams(),
    fetchAiCameraNames(),
  ]);
  return streams.map((stream) => toCamera(stream, aiCameraNames));
}

async function fetchAiCameraNames(): Promise<Set<string>> {
  const baseValue = process.env.DETECTION_API_BASE_URL;
  if (!baseValue) return new Set();

  try {
    const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
    const response = await fetch(new URL("api/cameras", base), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return new Set();

    const payload = (await response.json()) as unknown;
    const names = cameraRows(payload)
      .map((value) => {
        if (typeof value === "string") return value;
        return firstString(asRecord(value), [
          "camera_name",
          "cameraName",
          "name",
          "stream_name",
          "id",
        ]);
      })
      .filter((name): name is string => Boolean(name))
      .map((name) => name.toLowerCase());
    return new Set(names);
  } catch {
    return new Set();
  }
}

export async function resolveFeedUrl(cameraName: string): Promise<URL> {
  const baseValue = process.env.CAMERA_FEED_BASE_URL;
  if (!baseValue) throw new Error("CAMERA_FEED_BASE_URL is not configured");

  const base = new URL(baseValue.endsWith("/") ? baseValue : `${baseValue}/`);
  const streams = await fetchStreams().catch(() => []);
  const stream = streams.find(
    (candidate) =>
      candidate.sourceName === cameraName ||
      candidate.id === cameraName ||
      candidate.displayName === cameraName
  );

  if (stream?.upstreamFeedUrl) {
    const candidate = new URL(stream.upstreamFeedUrl, base);
    if (candidate.origin === base.origin) return candidate;
  }

  return new URL(encodeURIComponent(stream?.sourceName ?? cameraName), base);
}

