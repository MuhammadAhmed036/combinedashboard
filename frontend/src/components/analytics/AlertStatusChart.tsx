"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const STATUS_COLOR: Record<string, string> = {
  Active: "#f97316",
  Resolved: "#22c55e",
  Muted: "#64748b",
};

export function AlertStatusChart({ byStatus }: { byStatus: Record<string, number> }) {
  const data = [
    { name: "Active", value: byStatus.active ?? 0, fill: STATUS_COLOR.Active },
    { name: "Resolved", value: byStatus.resolved ?? 0, fill: STATUS_COLOR.Resolved },
    { name: "Muted", value: byStatus.muted ?? 0, fill: STATUS_COLOR.Muted },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12, fill: "var(--foreground)" }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--surface-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          cursor={{ fill: "var(--surface-3)" }}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
