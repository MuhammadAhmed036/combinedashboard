/** Human-readable, title-cased list of raw detection class names, e.g. "Person, Car, Truck". */
export function formatClassNames(classNames: string[]): string {
  if (!classNames.length) return "Person";
  return classNames.map((name) => name.charAt(0).toUpperCase() + name.slice(1)).join(", ");
}

/** Per-class counts for one side of a region match, e.g. `{person: 2, car: 5}` -> "2 person, 5 car". */
export function formatClassCounts(counts: Record<string, number> | null | undefined): string {
  if (!counts) return "";
  const parts = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([name, count]) => `${count} ${name}`);
  return parts.join(", ");
}

/**
 * Fixed-order categorical palette for detection-class charts (validated for
 * colorblind-safe adjacent-pair contrast — see the dataviz skill). Assigned
 * by name, not by array position, so a class never repaints when the set of
 * classes present changes. `CLASS_COLOR_FALLBACK` covers any class beyond
 * this fixed list — chart data itself is still fully dynamic (see
 * `detectionClasses`'s callers), only the color assignment plateaus.
 */
export const CLASS_COLOR: Record<string, string> = {
  person: "#2a78d6",
  car: "#eb6834",
  truck: "#1baf7a",
  bus: "#eda100",
  motorcycle: "#e87ba4",
  bicycle: "#008300",
};

export const CLASS_COLOR_FALLBACK = "#4a3aa7";

export function classColor(className: string): string {
  return CLASS_COLOR[className] ?? CLASS_COLOR_FALLBACK;
}
