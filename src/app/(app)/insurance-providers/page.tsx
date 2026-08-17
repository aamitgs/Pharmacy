import { listInsuranceProviders } from "@/lib/actions/insurance-providers";
import { InsuranceProviderForm } from "@/components/insurance/insurance-provider-form";
import { InsuranceProviderActiveToggle } from "@/components/insurance/insurance-provider-active-toggle";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function InsuranceProvidersPage() {
  const providers = await listInsuranceProviders();

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Insurance Providers</h1>
          <p className="text-sm text-muted-foreground">
            {providers.length} provider{providers.length === 1 ? "" : "s"} on file for cashless billing
          </p>
        </div>
        <InsuranceProviderForm />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>TPA code</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="w-32">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.length ? (
              providers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.tpaCode || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[p.contactPhone, p.contactEmail].filter(Boolean).join(" · ") || "—"}
                  </TableCell>
                  <TableCell>
                    <InsuranceProviderActiveToggle providerId={p.id} initialActive={p.active} />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No insurance providers yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
