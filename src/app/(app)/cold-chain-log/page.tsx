import { listTemperatureLogs } from "@/lib/actions/temperature-logs";
import { RecordTemperatureForm } from "@/components/cold-chain/record-temperature-form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default async function ColdChainLogPage() {
  const logs = await listTemperatureLogs();

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">Cold-Chain Temperature Log</h1>
        <p className="text-sm text-muted-foreground">
          Manual readings for cold-storage units — readings outside 2–8°C surface as an alert.
        </p>
      </div>

      <RecordTemperatureForm />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recorded</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Temperature</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>Recorded by</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length ? (
              logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {format(new Date(l.recordedAt), "dd MMM yyyy, h:mm a")}
                  </TableCell>
                  <TableCell>{l.branchName}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.temperatureCelsius.toFixed(1)}°C</TableCell>
                  <TableCell className="max-w-64 truncate text-sm text-muted-foreground">{l.note || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.recordedByName}</TableCell>
                  <TableCell>
                    {l.outOfRange ? (
                      <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                        Out of range
                      </Badge>
                    ) : (
                      <Badge className="bg-success/15 text-success hover:bg-success/15">In range</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No readings recorded yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
