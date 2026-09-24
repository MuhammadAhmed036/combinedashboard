export type AlertSeverity = "critical" | "high" | "medium" | "low";

export type AlertStatus =
  | "active"
  | "acknowledged"
  | "investigating"
  | "resolved"
  | "closed";

export type CameraStatus = "online" | "offline";

export interface Operator {
  id: string;
  name: string;
  initials: string;
  controlRoom: string;
}

export interface Zone {
  id: string;
  name: string;
  shortName: string;
  color: string;
  center: [number, number];
  cameraCount: number;
}

export interface AiFeature {
  id: string;
  label: string;
  active: boolean;
}

export interface Camera {
  id: string;
  code: string;
  name: string;
  zoneId: string;
  zoneName: string;
  location: string;
  position: [number, number];
  status: CameraStatus;
  type: "PTZ Dome" | "Bullet" | "Fixed" | "LPR" | "Thermal";
  currentPersonCount: number;
  density: "Low" | "Medium" | "High" | "Critical";
  densityPercent: number;
  aiFeatures: AiFeature[];
  thumbnailSeed: string;
  isFavorite: boolean;
  proxy_feed_url?: string;
  proxyFeedUrl?: string;
  playerUrl?: string;
  sourceName?: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  cameraId: string;
  cameraCode: string;
  cameraName: string;
  zoneId: string;
  zoneName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  timestamp: string;
  durationSeconds: number;
  confidence: number;
  assignedOperatorId: string | null;
  notes: string;
  type: AlertType;
}

export type AlertType =
  | "perimeter_breach"
  | "loitering"
  | "vehicle_no_parking"
  | "crowd_gathering"
  | "tampering"
  | "fence_cut"
  | "abandoned_object"
  | "license_plate_unrecognized"
  | "intrusion"
  | "fire_smoke"
  | "fight_altercation"
  | "traffic_violation"
  | "line_crossing"
  | "vehicle_restricted"
  | "face_recognition_match";

export interface TrendPoint {
  label: string;
  value: number;
}

export interface DashboardStats {
  totalCameras: number;
  activeCameras: number;
  offlineCameras: number;
  totalPersonsToday: number;
  personsTrendPercent: number;
  activeAlerts: number;
  criticalAlerts: number;
  offlineCamerasTrendPercent: number;
  activeAlertTrendPercent: number;
}

export interface CameraLocation {
  id: number;
  cameraId: string;
  cameraName: string;
  cameraIp: string | null;
  zone: string | null;
  scene: string | null;
  latitude: number | null;
  longitude: number | null;
  headingDegrees: number | null;
  address: string | null;
  building: string | null;
  floor: string | null;
  description: string | null;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  /**
   * False for cameras known from the live-stream feed that don't have a
   * `camera_locations` row on the backend yet (no detection data to sync
   * from). Placing one of these on the map creates its registry row instead
   * of updating an existing one.
   */
  isRegistered: boolean;
}

export interface CameraEventDetection {
  classId: number;
  className: string;
  confidence: number;
  bboxXyxy: [number, number, number, number];
}

/** One real detection event for a camera, from `/api/v2/events`. */
export interface CameraEventDetail {
  eventId: string;
  cameraId: string;
  cameraIp: string | null;
  zone: string | null;
  scene: string | null;
  detectionTs: string | null;
  modelName: string | null;
  backend: string | null;
  device: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  detectionCount: number;
  decodeMs: number | null;
  preprocessMs: number | null;
  inferenceMs: number | null;
  postprocessMs: number | null;
  totalMs: number | null;
  detections: CameraEventDetection[];
  rawImageStatus: string | null;
  imageExists: boolean;
  createdAt: string | null;
}

/** Per-camera raw-image retention health, from `/api/camera-retention`. */
export interface CameraRetentionInfo {
  cameraId: string;
  totalEvents: number;
  withRaw: number;
  retainedRaw: number;
  target: number;
  remainingToTarget: number;
  latestTs: string | null;
}

export interface ZoneSummary {
  zone: string;
  cameraCount: number;
  withCoords: number;
  enabledCount: number;
}

export interface AlertBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  region?: string;
}

export interface AlertConditions {
  condition: string;
  triggerInside: boolean;
  triggerOutside: boolean;
  personLabel: string;
  /**
   * Only set for `condition: "absence"` rules — how long a camera must go
   * without any person detection before the no-person watcher records a
   * match. Null for region ("boundary") rules.
   */
  absenceThresholdSeconds: number | null;
}

export type AlertRuleStatus = "active" | "resolved" | "muted" | string;

/**
 * User-facing severity of an alert rule. The `/api/v2/alerts` backend has
 * no native field for this — it's stored in the rule's free-form `metadata`
 * object (same approach already used for `refImageWidth`/`refImageHeight`).
 */
export type AlertCategory = "critical" | "medium" | "low";

/** A saved alert rule (region/boundary or no-person/absence) from the real `/api/v2/alerts` backend. */
export interface AlertRuleV2 {
  id: number;
  alertId: string;
  cameraId: string;
  zone: string | null;
  collectionId: string | null;
  collectionName: string | null;
  label: string | null;
  name: string | null;
  description: string | null;
  sourceEventId: string | null;
  boundingBox: AlertBoundingBox | null;
  conditions: AlertConditions | null;
  /** Which raw detection classes this rule watches for — region rules only; absence rules are always `["person"]`. Dynamic: whatever classes the model reports, not a fixed list. */
  classNames: string[];
  category: AlertCategory;
  refImageWidth: number | null;
  refImageHeight: number | null;
  personCountInside: number;
  personCountOutside: number;
  seenCount: number;
  unseenCount: number;
  seen: boolean;
  seenBy: string[];
  seenAt: string | null;
  status: AlertRuleStatus;
  latestEventId: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  eventCount: number;
}

/** One matched-detection row from an alert rule's `/events` history. */
export interface AlertMatchEvent {
  id: number;
  alertId: string;
  eventId: string;
  cameraId: string;
  detectionTs: string | null;
  personCountInside: number;
  personCountOutside: number;
  /** Per-class breakdown of `personCountInside`/`personCountOutside`, e.g. `{person: 2, car: 5}`. Empty for older matches recorded before this was tracked. */
  classCountsInside: Record<string, number>;
  classCountsOutside: Record<string, number>;
  boundingBox: AlertBoundingBox | null;
  note: string | null;
  seen: boolean;
  isLatest: boolean;
  createdAt: string | null;
  // Extended fields populated when fetching across all rules (alert history feed)
  ruleName?: string;
  ruleLabel?: string;
  category?: AlertCategory;
  classNames?: string[];
}

export interface AlertStatsSummary {
  total: number;
  byStatus: Record<string, number>;
  seen: number;
  unseen: number;
}

export type GridLayoutKey = "1x1" | "2x2" | "3x3" | "4x4" | "5x5";

export interface MediaWallAssignment {
  cellIndex: number;
  cameraId: string | null;
}

export interface NotificationMethod {
  id: "email" | "sms" | "in_app" | "push";
  label: string;
}

/** A user-drawn map region (e.g. "Alert Zone") — persisted to `data/map-regions.json`. */
export interface MapRegion {
  id: string;
  name: string;
  /** Hex color, e.g. "#ef4444". */
  color: string;
  /** Polygon vertices as [lng, lat] pairs, in drawing order — not pre-closed (first point isn't repeated at the end). */
  coordinates: [number, number][];
  createdAt: string;
}
