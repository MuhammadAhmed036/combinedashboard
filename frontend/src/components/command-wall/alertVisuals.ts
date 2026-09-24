import type { AlertCategory } from "@/lib/types";

export const CLASS_ACCENT: Record<string, string> = {
  person: "#facc15",
  car: "#ef4444",
  truck: "#22c55e",
  bus: "#38bdf8",
  motorcycle: "#f97316",
  bicycle: "#a855f7",
};

export const CATEGORY_ACCENT: Record<AlertCategory, string> = {
  critical: "#ef4444",
  medium: "#f59e0b",
  low: "#3b82f6",
};

export const CATEGORY_LABEL: Record<AlertCategory, string> = {
  critical: "High",
  medium: "Medium",
  low: "Low",
};

export function classAccent(className: string) {
  return CLASS_ACCENT[className.toLowerCase()] ?? "#14b8a6";
}

export function classLabel(className: string) {
  return className ? className.charAt(0).toUpperCase() + className.slice(1) : "Class";
}
