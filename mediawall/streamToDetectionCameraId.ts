/**
 * The live-stream API and the detection API register cameras under
 * independently-chosen names, which usually match exactly (case aside) but
 * not always. These are the confirmed exceptions — same physical camera,
 * different name in each system. Only add a pair here once it's confirmed;
 * guessing at a match would silently attribute the wrong camera's person
 * count to a tile.
 */
const CONFIRMED_ALIASES: Record<string, string> = {};

export function resolveDetectionCameraId(streamCameraId: string): string {
  return CONFIRMED_ALIASES[streamCameraId.toLowerCase()] ?? streamCameraId;
}
