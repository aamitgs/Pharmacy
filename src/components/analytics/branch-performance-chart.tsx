"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BranchPerformance } from "@/lib/actions/analytics";

/** Ranked bar, top branch first — "top/bottom performing branches" is the
 * same sorted list read from either end, not two separate charts. Bars are
 * a single hue (magnitude, not identity) except the best/worst are tinted
 * for a quick read without needing a legend. */
export function BranchPerformanceChart({ data }: { data: BranchPerformance[] }) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No sales in this period.</div>;
  }

  const chartHeight = Math.max(120, data.length * 40);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
        />
        <YAxis
          type="category"
          dataKey="branchName"
          tick={{ fontSize: 12, fill: "var(--foreground)" }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          formatter={(value, _name, item) => {
            const row = item.payload as BranchPerformance;
            return [`₹${Number(value).toFixed(2)} revenue · ${row.marginPercent.toFixed(1)}% margin · ${row.invoiceCount} sales`, row.branchName];
          }}
        />
        <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
          {data.map((row, i) => (
            <Cell
              key={row.branchId}
              fill={i === 0 ? "var(--success)" : i === data.length - 1 && data.length > 1 ? "var(--destructive)" : "var(--primary)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
