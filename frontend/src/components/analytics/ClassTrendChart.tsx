"use client";

import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { classColor, formatClassNames } from "@/lib/detectionClasses";
import { formatTime } from "@/lib/formatters";

export interface ClassTrendPoint {
  time: string;
  counts: Record<string, number>;
}

/** Multi-line time series, one line per detection class — the class-aware counterpart to the old single-line people trend. */
export function ClassTrendChart({ data }: { data: ClassTrendPoint[] }) {
  const classNames = useMemo(() => {
    const set = new Set<string>();
    data.forEach((point) => Object.keys(point.counts).forEach((name) => set.add(name)));
    return Array.from(set).sort();
  }, [data]);

  const rows = useMemo(
    () => data.map((point) => ({ label: formatTime(point.time), ...point.counts })),
    [data]
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
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
          labelStyle={{ color: "var(--foreground)" }}
          formatter={(value, name) => [String(value), formatClassNames([String(name)])]}
        />
        <Legend
          formatter={(value) => formatClassNames([String(value)])}
          wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
        />
        {classNames.map((className) => (
          <Line
            key={className}
            type="monotone"
            dataKey={className}
            stroke={classColor(className)}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
