"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { densityTierColor, densityTierFromCount } from "@/lib/density";

export interface CameraDensityDatum {
  cameraName: string;
  peopleCount: number;
}

export function CameraDensityChart({ data }: { data: CameraDensityDatum[] }) {
  const sorted = [...data].sort((a, b) => b.peopleCount - a.peopleCount);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={sorted} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
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
          formatter={(value) => {
            const count = Number(value) || 0;
            return [`${count} persons`, densityTierFromCount(count)];
          }}
        />
        <Bar dataKey="peopleCount" radius={[4, 4, 0, 0]}>
          {sorted.map((entry) => (
            <Cell key={entry.cameraName} fill={densityTierColor(densityTierFromCount(entry.peopleCount))} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
