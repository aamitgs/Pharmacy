"use client";

import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SalesTrendPoint } from "@/lib/actions/analytics";

function formatDay(d: string) {
  return format(new Date(d), "dd MMM");
}

export function SalesTrendChart({ data }: { data: SalesTrendPoint[] }) {
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
          tickFormatter={(v: number) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
          width={48}
        />
        <Tooltip
          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(label) => format(new Date(String(label)), "dd MMM yyyy")}
          formatter={(value) => [`₹${Number(value).toFixed(2)}`, "Revenue"]}
        />
        <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
