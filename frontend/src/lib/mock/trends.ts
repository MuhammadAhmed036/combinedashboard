import type { TrendPoint } from "@/lib/types";
import { createRng } from "@/lib/mock/seed";

const HOUR_LABELS = [
  "12 AM", "01 AM", "02 AM", "03 AM", "04 AM", "05 AM", "06 AM", "07 AM",
  "08 AM", "09 AM", "10 AM", "11 AM", "12 PM", "01 PM", "02 PM", "03 PM",
  "04 PM", "05 PM", "06 PM", "07 PM", "08 PM", "09 PM", "10 PM", "11 PM",
];

function dayCurve(seed: number, peakHour: number, base: number, peak: number): TrendPoint[] {
  const rng = createRng(seed);
  return HOUR_LABELS.map((label, hour) => {
    const distance = Math.abs(hour - peakHour);
    const falloff = Math.max(0, 1 - distance / 9);
    const noise = rng.float(-0.06, 0.06, 3);
    const value = base + (peak - base) * Math.max(0, falloff + noise);
    return { label, value: Math.round(Math.max(base * 0.4, value)) };
  });
}

export const PEOPLE_COUNT_TODAY: TrendPoint[] = dayCurve(101, 16, 8, 72);
export const CROWD_DENSITY_TODAY: TrendPoint[] = dayCurve(102, 14, 12, 62);
export const PERSON_COUNT_TREND: TrendPoint[] = dayCurve(103, 15, 6, 58);

export const ACTIVE_ALERT_TREND: TrendPoint[] = [
  { label: "02 PM", value: 18 },
  { label: "04 PM", value: 22 },
  { label: "06 PM", value: 27 },
  { label: "08 PM", value: 24 },
  { label: "10 PM", value: 31 },
  { label: "12 AM", value: 29 },
  { label: "02 AM", value: 33 },
  { label: "04 AM", value: 30 },
  { label: "06 AM", value: 25 },
  { label: "08 AM", value: 28 },
  { label: "10 AM", value: 34 },
  { label: "12 PM", value: 36 },
  { label: "02 PM", value: 36 },
];

export const OFFLINE_CAMERAS_TREND: TrendPoint[] = [
  { label: "02 PM", value: 21 },
  { label: "04 PM", value: 20 },
  { label: "06 PM", value: 19 },
  { label: "08 PM", value: 18 },
  { label: "10 PM", value: 19 },
  { label: "12 AM", value: 17 },
  { label: "02 AM", value: 18 },
  { label: "04 AM", value: 16 },
  { label: "06 AM", value: 17 },
  { label: "08 AM", value: 16 },
  { label: "10 AM", value: 17 },
  { label: "12 PM", value: 17 },
  { label: "02 PM", value: 17 },
];

export function peakValue(points: TrendPoint[]) {
  return points.reduce((max, p) => Math.max(max, p.value), 0);
}

export function currentValue(points: TrendPoint[]) {
  return points[points.length - 1]?.value ?? 0;
}
