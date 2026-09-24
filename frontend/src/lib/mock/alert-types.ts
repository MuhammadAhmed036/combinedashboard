import type { AlertSeverity, AlertType } from "@/lib/types";

export interface AlertTypeDef {
  type: AlertType;
  title: string;
  description: string;
  defaultSeverity: AlertSeverity;
  icon:
    | "shield-alert"
    | "user-round-search"
    | "car"
    | "users"
    | "video-off"
    | "scissors-line-dashed"
    | "package"
    | "id-card"
    | "door-open"
    | "flame"
    | "swords"
    | "traffic-cone"
    | "scan-face"
    | "footprints";
}

export const ALERT_TYPE_DEFS: AlertTypeDef[] = [
  {
    type: "perimeter_breach",
    title: "Perimeter Breach Detected",
    description: "Motion detected in restricted area",
    defaultSeverity: "critical",
    icon: "shield-alert",
  },
  {
    type: "fire_smoke",
    title: "Fire/Smoke Detected",
    description: "Smoke or fire detected",
    defaultSeverity: "critical",
    icon: "flame",
  },
  {
    type: "fight_altercation",
    title: "Fight / Physical Altercation",
    description: "Multiple persons involved in physical altercation",
    defaultSeverity: "critical",
    icon: "swords",
  },
  {
    type: "fence_cut",
    title: "Fence Cut Detected",
    description: "Possible fence cut or damage",
    defaultSeverity: "high",
    icon: "scissors-line-dashed",
  },
  {
    type: "intrusion",
    title: "Intrusion Detected",
    description: "Unauthorized entry detected",
    defaultSeverity: "high",
    icon: "door-open",
  },
  {
    type: "loitering",
    title: "Loitering Detected",
    description: "Person loitering for 5+ minutes",
    defaultSeverity: "high",
    icon: "footprints",
  },
  {
    type: "vehicle_no_parking",
    title: "Vehicle in No Parking Zone",
    description: "Vehicle parked in restricted area",
    defaultSeverity: "high",
    icon: "car",
  },
  {
    type: "traffic_violation",
    title: "Traffic Violation",
    description: "Vehicle moving against the traffic flow",
    defaultSeverity: "high",
    icon: "traffic-cone",
  },
  {
    type: "crowd_gathering",
    title: "Crowd Gathering Detected",
    description: "Large crowd detected",
    defaultSeverity: "medium",
    icon: "users",
  },
  {
    type: "abandoned_object",
    title: "Abandoned Object Detected",
    description: "Object left unattended",
    defaultSeverity: "medium",
    icon: "package",
  },
  {
    type: "vehicle_restricted",
    title: "Vehicle in Restricted Area",
    description: "Vehicle detected in pedestrian zone",
    defaultSeverity: "medium",
    icon: "car",
  },
  {
    type: "face_recognition_match",
    title: "Face Recognition Match",
    description: "Watchlist match identified",
    defaultSeverity: "medium",
    icon: "scan-face",
  },
  {
    type: "tampering",
    title: "Tampering Detected",
    description: "Camera tampering suspected",
    defaultSeverity: "low",
    icon: "video-off",
  },
  {
    type: "license_plate_unrecognized",
    title: "License Plate Not Recognized",
    description: "Plate confidence below threshold",
    defaultSeverity: "low",
    icon: "id-card",
  },
  {
    type: "line_crossing",
    title: "Line Crossing Detected",
    description: "1 event detected",
    defaultSeverity: "low",
    icon: "user-round-search",
  },
];

export function getAlertTypeDef(type: AlertType): AlertTypeDef {
  return ALERT_TYPE_DEFS.find((d) => d.type === type) ?? ALERT_TYPE_DEFS[0];
}

export const SEVERITY_ORDER: AlertSeverity[] = ["critical", "high", "medium", "low"];

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
