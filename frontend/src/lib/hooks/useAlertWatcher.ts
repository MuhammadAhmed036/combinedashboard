"use client";

/**
 * DEPRECATED CLIENT EVALUATOR — Server-Side Alert Engine Active.
 *
 * Alert detection, evaluation, and DB event insertion are now handled
 * 100% server-side 24/7 by `sync-service/index.js` (`evaluateDetectionEventsForAlerts`).
 *
 * This hook is intentionally a no-op to ensure there is exactly ONE single
 * alert-generation path (server-side background engine), eliminating duplicate
 * alert events or race conditions between client and server.
 */
export function useAlertWatcher() {
  // No-op: All alert generation logic is running server-side in sync-service.
}
