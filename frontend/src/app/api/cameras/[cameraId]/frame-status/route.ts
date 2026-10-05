import { NextRequest, NextResponse } from "next/server";
import {
  getCameraFfmpegStatus,
  checkWebRtcHealth,
  extractDetections,
} from "@/lib/server/absenceEngine";
import { getPool } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cameraId: string }> }
) {
  try {
    const { cameraId } = await params;
    const decodedCamera = decodeURIComponent(cameraId);

    // 1. Camera ffmpeg status from Streams API
    const camStatus = await getCameraFfmpegStatus(decodedCamera);

    // 2. WebRTC health check
    const webrtc = await checkWebRtcHealth(decodedCamera);

    // 3. Latest YOLO detection frame from database
    let yoloInfo = {
      lastFrameTs: null as string | null,
      secondsAgo: null as number | null,
      detectionsCount: 0,
      lastEventId: null as string | null,
      isStale: true,
      detections: [] as any[],
    };

    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT event_id, detection_ts, created_at, detection_count, detections_json,
                image_width, image_height, raw_image_path, raw_image_status
         FROM detection_events WHERE camera_id = $1 ORDER BY id DESC LIMIT 1`,
        [decodedCamera]
      );
      if (rows.length > 0) {
        const row = rows[0];
        const ts = new Date(row.detection_ts || row.created_at).getTime();
        const secondsAgo = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        const detections = extractDetections(
          row.detections_json,
          Number(row.image_width) || 1920,
          Number(row.image_height) || 1080
        );

        yoloInfo = {
          lastFrameTs: row.detection_ts || row.created_at,
          secondsAgo,
          detectionsCount: detections.length,
          lastEventId: row.event_id,
          isStale: secondsAgo > 5,
          detections,
        };
      }
    } catch (err: any) {
      console.warn(`[frame-status] DB query note for ${decodedCamera}:`, err.message);
    }

    const isCameraRunning = camStatus.toLowerCase() === "running";
    const currentFrameAvailable = isCameraRunning && webrtc;
    const feedBase = (process.env.CAMERA_FEED_BASE_URL || "").replace(/\/+$/, "");

    return NextResponse.json(
      {
        camera: decodedCamera,
        cameraStatus: isCameraRunning ? "RUNNING" : "STOPPED",
        webrtc: {
          status: webrtc ? "ACTIVE" : "ERROR",
          isLive: webrtc,
          whepUrl: feedBase ? `${feedBase}/${encodeURIComponent(decodedCamera)}/whep` : null,
          playerUrl: feedBase ? `${feedBase}/${encodeURIComponent(decodedCamera)}/` : null,
        },
        yolo: yoloInfo,
        currentFrameAvailable,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || "Failed to inspect camera frame status",
      },
      { status: 500 }
    );
  }
}
