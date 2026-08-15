import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StaffPerformance } from "@/lib/actions/analytics";

export function StaffPerformanceTable({ data }: { data: StaffPerformance[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Staff</TableHead>
            <TableHead className="text-right">Sales</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Discount given</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length ? (
            data.map((row) => (
              <TableRow key={row.userId}>
                <TableCell className="font-medium">{row.userName}</TableCell>
                <TableCell className="text-right tabular-nums">{row.salesCount}</TableCell>
                <TableCell className="text-right tabular-nums">₹{row.salesRevenue.toFixed(2)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.discountGiven > 0 ? `₹${row.discountGiven.toFixed(2)}` : "—"}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                No sales in this period.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
