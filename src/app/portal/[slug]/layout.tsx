import { notFound } from "next/navigation";
import Link from "next/link";
import { getPortalTenantBySlug, getPortalSession, portalSignOut } from "@/lib/actions/customer-portal";
import { Button } from "@/components/ui/button";

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getPortalTenantBySlug(slug);
  if (!tenant) notFound();

  const session = await getPortalSession(slug);
  const signOut = signOutAction.bind(null, slug);

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="flex h-14 items-center justify-between border-b bg-background px-4">
        <Link href={`/portal/${slug}`} className="flex items-center gap-2">
          {tenant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
          )}
          <span className="font-semibold" style={tenant.primaryColor ? { color: tenant.primaryColor } : undefined}>
            {tenant.pharmacyName}
          </span>
        </Link>
        {session && (
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        )}
      </header>
      <main className="flex-1 p-4">{children}</main>
      <footer className="p-4 text-center text-xs text-muted-foreground">
        Customer portal for {tenant.pharmacyName}
      </footer>
    </div>
  );
}

async function signOutAction(slug: string) {
  "use server";
  await portalSignOut(slug);
  const { redirect } = await import("next/navigation");
  redirect(`/portal/${slug}/login`);
}
