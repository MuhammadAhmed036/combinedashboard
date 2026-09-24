import type { AlertBoundingBox } from "@/lib/types";

/** A box in 0–1 normalized image coordinates. */
export interface NormBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A box tagged with which detection class it came from. */
export interface ClassBox extends NormBox {
  className: string;
}

export function intersects(a: NormBox, b: NormBox): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

/**
 * Pulls every detection box matching one of `classNames` out of a
 * `/api/events/{id}` detail payload, normalized to 0–1 image coordinates.
 * Prefers the backend's own normalized box when present, falling back to
 * dividing the pixel box by the event's own image dimensions.
 */
export function extractClassBoxes(event: UnknownRecord, classNames: string[]): ClassBox[] {
  const imageWidth = Number(event.image_width);
  const imageHeight = Number(event.image_height);
  const detections = Array.isArray(event.detections) ? event.detections : [];
  if (!imageWidth || !imageHeight || detections.length === 0) return [];

  const wanted = new Set(classNames.map((name) => name.toLowerCase()));
  const boxes: ClassBox[] = [];
  for (const raw of detections) {
    const detection = asRecord(raw);
    const className = String(detection.class_name ?? "").toLowerCase();
    if (!wanted.has(className)) continue;

    const normXyxy = detection.bbox_norm_xyxy as [number, number, number, number] | undefined;
    const pixelXyxy = detection.bbox_xyxy as [number, number, number, number] | undefined;
    if (Array.isArray(normXyxy) && normXyxy.length === 4) {
      boxes.push({ x1: normXyxy[0], y1: normXyxy[1], x2: normXyxy[2], y2: normXyxy[3], className });
    } else if (Array.isArray(pixelXyxy) && pixelXyxy.length === 4) {
      boxes.push({
        x1: pixelXyxy[0] / imageWidth,
        y1: pixelXyxy[1] / imageHeight,
        x2: pixelXyxy[2] / imageWidth,
        y2: pixelXyxy[3] / imageHeight,
        className,
      });
    }
  }
  return boxes;
}

/** Convenience wrapper over `extractClassBoxes` for the person-only watchers. */
export function extractPersonBoxes(event: UnknownRecord): NormBox[] {
  return extractClassBoxes(event, ["person"]);
}

/** Converts a saved rule's pixel-space bounding box into the same 0–1 normalized space as `extractPersonBoxes`. */
export function normalizeRuleRegion(rule: {
  boundingBox: AlertBoundingBox | null;
  refImageWidth: number | null;
  refImageHeight: number | null;
}): NormBox | null {
  const { boundingBox, refImageWidth, refImageHeight } = rule;
  if (!boundingBox || !refImageWidth || !refImageHeight) return null;
  return {
    x1: boundingBox.x1 / refImageWidth,
    y1: boundingBox.y1 / refImageHeight,
    x2: boundingBox.x2 / refImageWidth,
    y2: boundingBox.y2 / refImageHeight,
  };
}
