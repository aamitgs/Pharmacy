import { auth } from "@/auth";
import { listRateContracts, getRateContractFormData } from "@/lib/actions/rate-contracts";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { RateContractForm } from "@/components/rate-contracts/rate-contract-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

export default async function RateContractsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const [contracts, formData] = await Promise.all([listRateContracts(), getRateContractFormData()]);
  const canCreate = session.user.role === "owner";
  const now = new Date();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Rate Contracts</h1>
          <p className="text-sm text-muted-foreground">
            {contracts.length} contract{contracts.length === 1 ? "" : "s"} — auto-applied at billing when the
            contracted customer buys the contracted item
          </p>
        </div>
        {canCreate && <RateContractForm customers={formData.customers} items={formData.items} />}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead>Valid window</TableHead>
              <TableHead>Status</TableHead>
              {canCreate && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.length ? (
              contracts.map((c) => {
                const inWindow = new Date(c.validFrom) <= now && now <= new Date(c.validTo);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.customerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.itemName}</TableCell>
                    <TableCell className="text-right tabular-nums">₹{c.contractRate.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(c.validFrom), "dd MMM yyyy")} – {format(new Date(c.validTo), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      {c.active && inWindow ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/15">Live</Badge>
                      ) : c.active ? (
                        <Badge variant="outline">Out of window</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    {canCreate && (
                      <TableCell>
                        <RateContractForm
                          contract={c}
                          customers={formData.customers}
                          items={formData.items}
                          trigger={
                            <Button size="sm" variant="outline">
                              Edit
                            </Button>
                          }
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No rate contracts yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
