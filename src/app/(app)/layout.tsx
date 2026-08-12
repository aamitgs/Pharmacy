import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.mfaSetupRequired) redirect("/mfa-setup");

  const tenant = await prisma.tenant.findUnique({ where: { id: session.user.tenantId } });

  return (
    <AppShell
      user={{
        name: session.user.name ?? "User",
        role: session.user.role,
        pharmacyName: tenant?.pharmacyName ?? "Pharmacy",
      }}
    >
      {children}
    </AppShell>
  );
}
