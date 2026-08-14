import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveSelectedBranch } from "@/lib/branch-scope";
import { shouldShowPoweredBy } from "@/lib/branding";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mfaSetupRequired) redirect("/mfa-setup");

  const [tenant, branchScope, showPoweredBy] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.user.tenantId } }),
    resolveSelectedBranch(session.user.tenantId, session.user.role),
    shouldShowPoweredBy(session.user.tenantId),
  ]);

  return (
    <AppShell
      user={{
        name: session.user.name ?? "User",
        role: session.user.role,
        pharmacyName: tenant?.pharmacyName ?? "Pharmacy",
        logoUrl: tenant?.logoUrl ?? null,
        primaryColor: tenant?.primaryColor ?? null,
        showPoweredBy,
        tenantType: tenant?.tenantType,
      }}
      branchScope={branchScope}
    >
      {children}
    </AppShell>
  );
}
