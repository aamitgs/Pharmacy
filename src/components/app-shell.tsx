"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Users,
  Stethoscope,
  Receipt,
  Truck,
  ClipboardList,
  PackageCheck,
  Undo2,
  TriangleAlert,
  ShieldAlert,
  Settings,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/alerts", label: "Alerts", icon: TriangleAlert },
  { href: "/pos", label: "Billing", icon: ScanBarcode },
  { href: "/items", label: "Items & Batches", icon: Package },
  { href: "/suppliers", label: "Suppliers", icon: Truck },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/grn", label: "GRN", icon: PackageCheck },
  { href: "/purchase-returns", label: "Purchase Returns", icon: Undo2 },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/doctors", label: "Doctors", icon: Stethoscope },
  { href: "/invoices", label: "Sales Register", icon: Receipt },
  {
    href: "/reports/narcotic-register",
    label: "Narcotic Register",
    icon: ShieldAlert,
    roles: ["owner", "pharmacist"],
  },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  user,
  children,
}: {
  user: { name: string; role: UserRole; pharmacyName: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground print:hidden">
        <div className="flex h-12 items-center border-b px-4">
          <span className="truncate text-sm font-semibold">{user.pharmacyName}</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <div className="mb-1.5 truncate px-2 text-xs text-sidebar-foreground/60">
            {user.name} · {user.role.replace("_", " ")}
          </div>
          <SignOutButton variant="ghost" size="sm" className="w-full justify-start">
            Sign out
          </SignOutButton>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden bg-background print:w-full">{children}</main>
    </div>
  );
}
