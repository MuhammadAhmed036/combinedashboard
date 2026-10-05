/**
 * Absence Detection Engine:
 * Core evaluator combining Camera Streams API status, WebRTC live status,
 * YOLO detection verification, and Person ROI tracking with grace periods.
 */

export interface Detection {
  class_name: string;
  bbox_xyxy: [number, number, number, number];
}

export interface AbsenceEvalOptions {
  personId: string;
  cameraName: string;
  mockCameraStatus?: "running" | "stopped";
  mockWebRtcStatus?: "ACTIVE" | "ERROR";
  roi?: [number, number, number, number];
  mockDetections?: Detection[];
  mockSecondsAgo?: number;
  mockYoloDown?: boolean;
  simulatedTimerSeconds?: number;
  thresholdSeconds?: number;
}

export interface AbsenceEvalResult {
  result: "CAMERA_OFFLINE" | "STREAM_ERROR" | "UNKNOWN" | "PRESENT" | "ABSENT";
  timerSeconds: number;
  personInRoi: "YES" | "NO";
  detections: number;
  log: string;
}

const timers = new Map<string, number>();

export function resetAbsenceTimer(personId: string): void {
  timers.delete(personId);
}

export function extractDetections(
  rawJson: unknown,
  _imageWidth?: number,
  _imageHeight?: number
): Detection[] {
  if (!rawJson) return [];
  let parsed = rawJson;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  const detections: Detection[] = [];
  const list = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "detections" in parsed && Array.isArray((parsed as any).detections)
    ? (parsed as any).detections
    : [];

  for (const item of list) {
    if (!item) continue;
    const className = String(item.class_name || item.label || item.class || "person").toLowerCase();
    let bbox: [number, number, number, number] | null = null;
    if (Array.isArray(item.bbox_xyxy) && item.bbox_xyxy.length === 4) {
      bbox = item.bbox_xyxy;
    } else if (Array.isArray(item.bbox) && item.bbox.length === 4) {
      bbox = item.bbox;
    } else if (item.x1 !== undefined && item.y1 !== undefined && item.x2 !== undefined && item.y2 !== undefined) {
      bbox = [item.x1, item.y1, item.x2, item.y2];
    }
    if (bbox) {
      detections.push({ class_name: className, bbox_xyxy: bbox });
    }
  }
  return detections;
}

export function checkPersonInRoi(
  roi: [number, number, number, number] | undefined,
  bbox: [number, number, number, number]
): boolean {
  if (!roi) return true; // Whole camera view
  const [rx1, ry1, rx2, ry2] = roi;
  const [bx1, by1, bx2, by2] = bbox;

  // Check box intersection
  const xOverlap = Math.max(0, Math.min(rx2, bx2) - Math.max(rx1, bx1));
  const yOverlap = Math.max(0, Math.min(ry2, by2) - Math.max(ry1, by1));
  const overlapArea = xOverlap * yOverlap;

  const boxArea = (bx2 - bx1) * (by2 - by1);
  return overlapArea > 0 && overlapArea >= 0.15 * boxArea;
}

export async function fetchCameraStatuses(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const url = process.env.STREAMS_API_URL;
  if (!url) return map;

  try {
    const user = process.env.STREAMS_API_USERNAME || "";
    const pass = process.env.STREAMS_API_PASSWORD || "";
    const headers: Record<string, string> = { Accept: "application/json" };
    if (user || pass) {
      headers.Authorization = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
    }

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      const rows = Array.isArray(data) ? data : Array.isArray(data.rows) ? data.rows : [];
      for (const row of rows) {
        if (row.name) {
          map.set(String(row.name).toLowerCase(), String(row.ffmpeg || "").toLowerCase());
        }
      }
    }
  } catch {
    // best-effort
  }
  return map;
}

export async function getCameraFfmpegStatus(cameraName: string): Promise<string> {
  const map = await fetchCameraStatuses();
  return map.get(cameraName.toLowerCase()) || "running";
}

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

export async function checkWebRtcHealth(cameraName: string): Promise<boolean> {
  const base = process.env.CAMERA_FEED_BASE_URL;
  if (!base) return false;

  try {
    const whepUrl = `${base.replace(/\/+$/, "")}/${encodeURIComponent(cameraName)}/whep`;
    const user = process.env.CAMERA_FEED_USERNAME || "";
    const pass = process.env.CAMERA_FEED_PASSWORD || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/sdp",
    };
    if (user || pass) {
      headers.Authorization = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
    }

    const postRes = await fetch(whepUrl, {
      method: "POST",
      headers,
      body: WHEP_PROBE_SDP,
      signal: AbortSignal.timeout(3000),
    });
    // MediaMTX returns 201/200/400 when stream is publishing, and 404/502/504 when stopped/unreachable
    return postRes.status !== 404 && postRes.status !== 502 && postRes.status !== 504;
  } catch {
    return false;
  }
}

export function formatAbsenceLog(data: {
  camera: string;
  cameraStatus: string;
  webRtcStatus?: string;
  yoloUnavailable?: boolean;
  roi?: [number, number, number, number];
  detections: number;
  personInRoi: "YES" | "NO";
  timerSeconds: number;
  thresholdSeconds: number;
  result: string;
}): string {
  const lines = [
    `Camera: ${data.camera}`,
    `Camera Status: ${data.cameraStatus}`,
  ];
  if (data.webRtcStatus) {
    lines.push(`WebRTC Status: ${data.webRtcStatus}`);
  }
  if (data.yoloUnavailable) {
    lines.push("YOLO Last Frame: UNAVAILABLE");
  }
  if (data.roi) {
    lines.push(`ROI: [${data.roi.join(", ")}]`);
  }
  lines.push(`Detections: ${data.detections}`);
  lines.push(`Person in ROI: ${data.personInRoi}`);
  lines.push(`Timer: ${data.timerSeconds}s / ${data.thresholdSeconds}s`);
  lines.push(`Result: ${data.result}`);
  return lines.join("\n");
}

export async function evaluateAbsenceLogic(
  opts: AbsenceEvalOptions
): Promise<AbsenceEvalResult> {
  const threshold = opts.thresholdSeconds ?? 60;

  // 1. Camera Status Rule
  const camStatus =
    opts.mockCameraStatus !== undefined
      ? opts.mockCameraStatus
      : await getCameraFfmpegStatus(opts.cameraName);

  if (camStatus.toLowerCase() !== "running") {
    timers.delete(opts.personId);
    const log = formatAbsenceLog({
      camera: opts.cameraName,
      cameraStatus: camStatus,
      webRtcStatus: "N/A",
      roi: opts.roi,
      detections: 0,
      personInRoi: "NO",
      timerSeconds: 0,
      thresholdSeconds: threshold,
      result: "CAMERA_OFFLINE",
    });
    return {
      result: "CAMERA_OFFLINE",
      timerSeconds: 0,
      personInRoi: "NO",
      detections: 0,
      log,
    };
  }

  // 2. WebRTC Live Stream Check
  let webrtcLive = false;
  let webrtcStatusStr = "ACTIVE";
  if (opts.mockWebRtcStatus !== undefined) {
    webrtcLive = opts.mockWebRtcStatus === "ACTIVE";
    webrtcStatusStr = opts.mockWebRtcStatus;
  } else {
    webrtcLive = await checkWebRtcHealth(opts.cameraName);
    webrtcStatusStr = webrtcLive ? "ACTIVE" : "ERROR";
  }

  if (!webrtcLive) {
    timers.delete(opts.personId);
    const log = formatAbsenceLog({
      camera: opts.cameraName,
      cameraStatus: camStatus,
      webRtcStatus: webrtcStatusStr,
      roi: opts.roi,
      detections: 0,
      personInRoi: "NO",
      timerSeconds: 0,
      thresholdSeconds: threshold,
      result: "STREAM_ERROR",
    });
    return {
      result: "STREAM_ERROR",
      timerSeconds: 0,
      personInRoi: "NO",
      detections: 0,
      log,
    };
  }

  // 3. YOLO Pipeline Check
  if (opts.mockYoloDown) {
    timers.delete(opts.personId);
    const log = formatAbsenceLog({
      camera: opts.cameraName,
      cameraStatus: camStatus,
      webRtcStatus: webrtcStatusStr,
      yoloUnavailable: true,
      roi: opts.roi,
      detections: 0,
      personInRoi: "NO",
      timerSeconds: 0,
      thresholdSeconds: threshold,
      result: "UNKNOWN",
    });
    return {
      result: "UNKNOWN",
      timerSeconds: 0,
      personInRoi: "NO",
      detections: 0,
      log,
    };
  }

  // 4. ROI & Person Verification
  const detections = opts.mockDetections ?? [];
  const personDetections = detections.filter(
    (d) => d.class_name.toLowerCase() === "person"
  );

  let personInRoi = false;
  for (const person of personDetections) {
    if (checkPersonInRoi(opts.roi, person.bbox_xyxy)) {
      personInRoi = true;
      break;
    }
  }

  // 5. Timer & Absence Evaluation
  let timerSeconds = 0;
  let finalResult: "PRESENT" | "ABSENT" = "PRESENT";

  if (personInRoi) {
    timers.delete(opts.personId);
    timerSeconds = 0;
    finalResult = "PRESENT";
  } else {
    if (opts.simulatedTimerSeconds !== undefined) {
      timerSeconds = opts.simulatedTimerSeconds;
    } else {
      const current = timers.get(opts.personId) || 0;
      timerSeconds = current + 1;
      timers.set(opts.personId, timerSeconds);
    }

    if (timerSeconds >= threshold) {
      finalResult = "ABSENT";
    } else {
      finalResult = "PRESENT"; // Within grace period
    }
  }

  const log = formatAbsenceLog({
    camera: opts.cameraName,
    cameraStatus: camStatus,
    webRtcStatus: webrtcStatusStr,
    roi: opts.roi,
    detections: detections.length,
    personInRoi: personInRoi ? "YES" : "NO",
    timerSeconds,
    thresholdSeconds: threshold,
    result: finalResult,
  });

  return {
    result: finalResult,
    timerSeconds,
    personInRoi: personInRoi ? "YES" : "NO",
    detections: detections.length,
    log,
  };
}
