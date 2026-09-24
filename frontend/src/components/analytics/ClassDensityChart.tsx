"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { classColor, formatClassNames } from "@/lib/detectionClasses";

export interface CameraClassDatum {
  cameraName: string;
  counts: Record<string, number>;
}

/** Stacked bar per camera, one segment per detection class — the class-aware counterpart to the old single-number density chart. */
export function ClassDensityChart({ data }: { data: CameraClassDatum[] }) {
  const classNames = useMemo(() => {
    const set = new Set<string>();
    data.forEach((d) => Object.keys(d.counts).forEach((name) => set.add(name)));
    return Array.from(set).sort();
  }, [data]);

  const rows = useMemo(() => {
    return data
      .map((d) => {
        const total = Object.values(d.counts).reduce((sum, n) => sum + n, 0);
        return { cameraName: d.cameraName, total, ...d.counts };
      })
      .sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
        <XAxis
          dataKey="cameraName"
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          angle={-30}
          textAnchor="end"
          height={50}
          interval={0}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          width={28}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--surface-border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name) => [String(value), formatClassNames([String(name)])]}
        />
        <Legend
          formatter={(value) => formatClassNames([String(value)])}
          wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
        />
        {classNames.map((className) => (
          <Bar key={className} dataKey={className} stackId="classes" fill={classColor(className)} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
