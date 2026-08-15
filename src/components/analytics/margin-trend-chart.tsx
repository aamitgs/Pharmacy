"use client";

import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MarginTrendPoint } from "@/lib/actions/analytics";

function formatDay(d: string) {
  return format(new Date(d), "dd MMM");
}

/** Margin %, not margin ₹ — the sales trend chart already shows the rupee
 * scale; this one is deliberately a single, different-scale measure on its
 * own axis rather than sharing one chart with revenue (never dual-axis). */
export function MarginTrendChart({ data }: { data: MarginTrendPoint[] }) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No sales in this period.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
          width={40}
        />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(label) => format(new Date(String(label)), "dd MMM yyyy")}
          formatter={(value, _name, item) => {
            const point = item.payload as MarginTrendPoint;
            return [`${Number(value).toFixed(1)}% (₹${point.margin.toFixed(2)} on ₹${point.revenue.toFixed(2)})`, "Margin"];
          }}
        />
        <Line type="monotone" dataKey="marginPercent" stroke="var(--success)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
