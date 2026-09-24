import type { Operator } from "@/lib/types";

export const OPERATORS: Operator[] = [
  { id: "op-1", name: "Ali Raza", initials: "AR", controlRoom: "Control Room 1" },
  { id: "op-2", name: "Sara Khan", initials: "SK", controlRoom: "Control Room 1" },
  { id: "op-3", name: "Usman Tariq", initials: "UT", controlRoom: "Control Room 1" },
  { id: "op-4", name: "Fatima Noor", initials: "FN", controlRoom: "Control Room 2" },
  { id: "op-5", name: "Bilal Ahmed", initials: "BA", controlRoom: "Control Room 2" },
  { id: "op-6", name: "Maham Iqbal", initials: "MI", controlRoom: "Control Room 1" },
];

export function getOperatorById(id: string | null): Operator | null {
  if (!id) return null;
  return OPERATORS.find((o) => o.id === id) ?? null;
}
