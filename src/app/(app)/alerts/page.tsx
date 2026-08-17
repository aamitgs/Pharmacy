import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getAlerts } from "@/lib/actions/alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { FilePlus2, Sparkles, TriangleAlert } from "lucide-react";

export default async function AlertsPage() {
  const session = await auth();
  const t = await getTranslations("alerts");
  const {
    lowStock,
    reorderSuggestions,
    reorderDaysThreshold,
    velocityWindowDays,
    slowMoverThresholdQty,
    nearExpiry,
    nearExpiryWindowDays,
    licenseExpiry,
    licenseExpiryWindowDays,
    gstFilingReminders,
    coldChainAlerts,
    coldChainMinC,
    coldChainMaxC,
  } = await getAlerts();
  const canEdit = session?.user.role === "owner" || session?.user.role === "pharmacist";

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          License renewals{" "}
          <span className="text-muted-foreground">
            ({licenseExpiry.length}) — within {licenseExpiryWindowDays} days
          </span>
        </h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>License</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>License no.</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="w-32" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenseExpiry.length ? (
                licenseExpiry.map((row) => (
                  <TableRow key={`${row.branchId}-${row.licenseType}`}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell>{row.branchName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.licenseNo || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(row.expiryDate, "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {row.severity === "expired" ? (
                        <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <TriangleAlert className="h-3 w-3" /> Expired
                        </Badge>
                      ) : row.severity === "urgent" ? (
                        <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <TriangleAlert className="h-3 w-3" /> {row.daysRemaining}d left
                        </Badge>
                      ) : (
                        <Badge className="gap-1 bg-warning/20 text-warning-foreground hover:bg-warning/20">
                          <TriangleAlert className="h-3 w-3" /> {row.daysRemaining}d left
                        </Badge>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/settings">Update</Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canEdit ? 6 : 5} className="h-20 text-center text-muted-foreground">
                    No license renewals due within the window.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          GST filing reminders{" "}
          <span className="text-muted-foreground">({gstFilingReminders.length})</span>
        </h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filing</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="w-32" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {gstFilingReminders.length ? (
                gstFilingReminders.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{format(row.dueDate, "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      {row.severity === "overdue" ? (
                        <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <TriangleAlert className="h-3 w-3" /> Overdue
                        </Badge>
                      ) : row.severity === "urgent" ? (
                        <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          <TriangleAlert className="h-3 w-3" /> {row.daysRemaining}d left
                        </Badge>
                      ) : (
                        <Badge className="gap-1 bg-warning/20 text-warning-foreground hover:bg-warning/20">
                          <TriangleAlert className="h-3 w-3" /> {row.daysRemaining}d left
                        </Badge>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/settings">Manage</Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canEdit ? 4 : 3} className="h-20 text-center text-muted-foreground">
                    No GST filing reminders due.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">
            Low stock <span className="text-muted-foreground">({lowStock.length})</span>
          </h2>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Current qty</TableHead>
                <TableHead className="text-right">Reorder level</TableHead>
                <TableHead>Last purchase</TableHead>
                {canEdit && <TableHead className="w-32" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStock.length ? (
                lowStock.map((row) => (
                  <TableRow key={row.itemId}>
                    <TableCell>
                      <Link href={`/items/${row.itemId}`} className="font-medium hover:underline">
                        {row.itemName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.currentQty}
                      {row.currentQty === 0 && (
                        <Badge className="ml-1.5 bg-destructive/10 text-destructive hover:bg-destructive/10">
                          Out of stock
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.reorderLevel}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.lastPurchase ? (
                        <>
                          ₹{row.lastPurchase.rate.toFixed(2)} from {row.lastPurchase.supplierName}
                        </>
                      ) : (
                        "No purchase history"
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/grn/new?itemId=${row.itemId}${
                              row.lastPurchase ? `&supplierId=${row.lastPurchase.supplierId}` : ""
                            }`}
                          >
                            <FilePlus2 /> Create GRN
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canEdit ? 5 : 4} className="h-20 text-center text-muted-foreground">
                    No items are below their reorder level.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            Reorder suggestions{" "}
            <span className="text-muted-foreground">
              ({reorderSuggestions.length}) — projected to run out within {reorderDaysThreshold} days
            </span>
          </h2>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Current qty</TableHead>
                <TableHead>Reasoning</TableHead>
                <TableHead>Last purchase</TableHead>
                {canEdit && <TableHead className="w-32" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {reorderSuggestions.length ? (
                reorderSuggestions.map((row) => (
                  <TableRow key={row.itemId}>
                    <TableCell>
                      <Link href={`/items/${row.itemId}`} className="font-medium hover:underline">
                        {row.itemName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.currentQty} {row.unit}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      Selling ~{row.unitsPerWeek}/week over the last {velocityWindowDays} days —{" "}
                      <span className={row.daysOfStockRemaining <= 3 ? "font-medium text-destructive" : ""}>
                        {row.daysOfStockRemaining <= 0 ? "already out of stock" : `${row.daysOfStockRemaining} days of stock left`}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.lastPurchase ? (
                        <>
                          ₹{row.lastPurchase.rate.toFixed(2)} from {row.lastPurchase.supplierName}
                        </>
                      ) : (
                        "No purchase history"
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/grn/new?itemId=${row.itemId}${
                              row.lastPurchase ? `&supplierId=${row.lastPurchase.supplierId}` : ""
                            }`}
                          >
                            <FilePlus2 /> Create GRN
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={canEdit ? 5 : 4} className="h-20 text-center text-muted-foreground">
                    Nothing is projected to run out soon at current sales pace.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          Near expiry{" "}
          <span className="text-muted-foreground">
            ({nearExpiry.length}) — within {nearExpiryWindowDays} days
          </span>
        </h2>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nearExpiry.length ? (
                nearExpiry.map((row) => (
                  <TableRow key={row.batchId}>
                    <TableCell>
                      <Link href={`/items/${row.itemId}`} className="font-medium hover:underline">
                        {row.itemName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.batchNo}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(row.expiryDate), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.currentQty}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.isExpired ? (
                          <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                            <TriangleAlert className="h-3 w-3" /> Expired
                          </Badge>
                        ) : (
                          <Badge className="gap-1 bg-warning/20 text-warning-foreground hover:bg-warning/20">
                            <TriangleAlert className="h-3 w-3" /> Near expiry
                          </Badge>
                        )}
                        {row.isSlowMover && !row.isExpired && (
                          <Badge
                            className="gap-1 bg-destructive text-destructive-foreground hover:bg-destructive"
                            title={`Fewer than ${slowMoverThresholdQty} sold in the last ${velocityWindowDays} days — unlikely to sell through before it expires`}
                          >
                            <TriangleAlert className="h-3 w-3" /> High risk — slow mover
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    No batches expiring within the window.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">
            Cold-chain temperature{" "}
            <span className="text-muted-foreground">
              ({coldChainAlerts.length}) — readings outside {coldChainMinC}–{coldChainMaxC}°C in the last 7 days
            </span>
          </h2>
          <Button asChild size="sm" variant="outline">
            <Link href="/cold-chain-log">Log a reading</Link>
          </Button>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Temperature</TableHead>
                <TableHead>Recorded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coldChainAlerts.length ? (
                coldChainAlerts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.branchName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Badge className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10">
                        <TriangleAlert className="h-3 w-3" /> {c.temperatureCelsius.toFixed(1)}°C
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {format(new Date(c.recordedAt), "dd MMM yyyy, h:mm a")}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                    No out-of-range readings in the last 7 days.
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
