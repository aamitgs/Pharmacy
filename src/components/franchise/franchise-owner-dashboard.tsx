"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import {
  removeFranchiseMember,
  pushStandardizedItemList,
  getFranchiseRollupReport,
  type FranchiseStatus,
  type FranchiseRollupReport,
} from "@/lib/actions/franchise";
import { Loader2, Send, X } from "lucide-react";

export function FranchiseOwnerDashboard({
  group,
  from,
  to,
  initialReport,
}: {
  group: NonNullable<FranchiseStatus["group"]>;
  from: string;
  to: string;
  initialReport: FranchiseRollupReport;
}) {
  const router = useRouter();
  const [pushing, startPush] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const report = initialReport;

  function pushItemList() {
    startPush(async () => {
      try {
        const result = await pushStandardizedItemList();
        toast.success(
          `Pushed to ${result.memberCount} member(s) — ${result.itemsCreated} created, ${result.itemsUpdated} updated`
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not push item list");
      }
    });
  }

  function removeMember(tenantId: string) {
    setRemovingId(tenantId);
    startTransition(async () => {
      try {
        await removeFranchiseMember(tenantId);
        toast.success("Member removed");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not remove member");
      } finally {
        setRemovingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{group.name}</CardTitle>
            <CardDescription>
              Join code: <span className="font-mono font-medium text-foreground">{group.joinCode}</span> — share
              this with pharmacies you want to invite.
            </CardDescription>
          </div>
          <Button onClick={pushItemList} disabled={pushing} variant="outline">
            {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Push item list to members
          </Button>
        </CardHeader>
        <CardContent>
          {group.itemListPushedAt && (
            <p className="mb-3 text-xs text-muted-foreground">
              Last pushed {format(new Date(group.itemListPushedAt), "dd MMM yyyy, h:mm a")}
            </p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Rollup sharing</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.members.length ? (
                group.members.map((m) => (
                  <TableRow key={m.tenantId}>
                    <TableCell className="font-medium">{m.pharmacyName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(m.joinedAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {m.rollupOptIn ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/15">Opted in</Badge>
                      ) : (
                        <Badge variant="outline">Not shared</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending && removingId === m.tenantId}
                        onClick={() => removeMember(m.tenantId)}
                        aria-label={`Remove ${m.pharmacyName}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    No members yet — share the join code above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Sales &amp; margin rollup (opted-in members only)</h2>
        <DateRangeFilter from={from} to={to} basePath="/franchise" />
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.members.length ? (
                <>
                  {report.members.map((m) => (
                    <TableRow key={m.tenantId}>
                      <TableCell className="font-medium">{m.pharmacyName}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.invoiceCount}</TableCell>
                      <TableCell className="text-right tabular-nums">₹{m.revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">₹{m.margin.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">{report.totalInvoices}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{report.totalRevenue.toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{report.totalMargin.toFixed(2)}</TableCell>
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    No members have opted in to sales sharing yet, or none had sales in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
