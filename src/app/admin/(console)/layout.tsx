import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/admin-auth";
import { adminSignOut } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

export default async function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="flex h-12 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold">Platform Admin</span>
          <Link href="/admin" className="text-muted-foreground hover:text-foreground">
            Tenants
          </Link>
          <Link href="/admin/churn" className="text-muted-foreground hover:text-foreground">
            Churn
          </Link>
        </div>
        <form action={adminSignOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
