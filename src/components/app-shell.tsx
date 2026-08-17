"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { BranchSwitcher } from "@/components/branch-switcher";
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
  FileSpreadsheet,
  Building2,
  ArrowLeftRight,
  Settings,
  Percent,
  Award,
  Ticket,
  BedDouble,
  ClipboardPlus,
  LineChart,
  ShieldCheck,
  FileHeart,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
  // Phase 7 (Hospital Mode): only rendered when the tenant's tenantType is
  // 'hospital' — a retail tenant never sees these, and the pages
  // themselves 404 via requireHospitalTenant() if reached directly.
  hospitalOnly?: boolean;
};

// Retail billing/purchasing screens predate Hospital Mode and were written
// assuming every session could reach them — ward_nurse is excluded here to
// match the server-side requireRetailSession() gate added in Phase 7
// (src/lib/rbac.ts). ward_pharmacist is unaffected (treated as pharmacist).
const RETAIL_ONLY_ROLES: UserRole[] = ["owner", "pharmacist", "counter_staff", "ward_pharmacist"];

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: LineChart, roles: ["owner"] },
  { href: "/alerts", label: "Alerts", icon: TriangleAlert },
  { href: "/pos", label: "Billing", icon: ScanBarcode, roles: RETAIL_ONLY_ROLES },
  { href: "/items", label: "Items & Batches", icon: Package },
  { href: "/suppliers", label: "Suppliers", icon: Truck, roles: RETAIL_ONLY_ROLES },
  { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList, roles: RETAIL_ONLY_ROLES },
  { href: "/grn", label: "GRN", icon: PackageCheck, roles: RETAIL_ONLY_ROLES },
  { href: "/purchase-returns", label: "Purchase Returns", icon: Undo2, roles: RETAIL_ONLY_ROLES },
  { href: "/transfers", label: "Stock Transfers", icon: ArrowLeftRight, roles: RETAIL_ONLY_ROLES },
  { href: "/indents", label: "Indents", icon: ClipboardPlus, hospitalOnly: true },
  { href: "/admissions", label: "Patient Admissions", icon: BedDouble, hospitalOnly: true },
  {
    href: "/branches",
    label: "Branches",
    icon: Building2,
    roles: ["owner", "pharmacist"],
  },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/doctors", label: "Doctors", icon: Stethoscope },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  {
    href: "/insurance-claims",
    label: "Insurance Claims",
    icon: FileHeart,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/insurance-providers",
    label: "Insurance Providers",
    icon: ShieldCheck,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/schemes",
    label: "Schemes",
    icon: Percent,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/loyalty-tiers",
    label: "Loyalty Tiers",
    icon: Award,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/coupons",
    label: "Coupons",
    icon: Ticket,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/sales-register",
    label: "Sales Register",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/purchase-register",
    label: "Purchase Register",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/stock-ledger",
    label: "Stock Ledger",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/margin",
    label: "Margin Report",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/discounts",
    label: "Discount Report",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/movers",
    label: "Fast / Slow Movers",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/scheme-benefits",
    label: "Scheme Benefits",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/tally-export",
    label: "Tally Export",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/narcotic-register",
    label: "Narcotic Register",
    icon: ShieldAlert,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/hsn-summary",
    label: "HSN Summary",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/gstr-export",
    label: "GSTR-1 / 3B Export",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  user,
  branchScope,
  children,
}: {
  user: {
    name: string;
    role: UserRole;
    pharmacyName: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
    showPoweredBy?: boolean;
    // Phase 7: hospital-only nav items only render when this is 'hospital'.
    tenantType?: string;
  };
  branchScope: {
    branches: { id: string; name: string }[];
    branchId: string | null;
    isAllBranches: boolean;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter(
    (item) =>
      (!item.roles || item.roles.includes(user.role)) && (!item.hospitalOnly || user.tenantType === "hospital")
  );

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground print:hidden">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          {user.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.logoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
          )}
          <span
            className="truncate text-sm font-semibold"
            style={user.primaryColor ? { color: user.primaryColor } : undefined}
          >
            {user.pharmacyName}
          </span>
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
          {user.showPoweredBy && (
            <div className="mt-1.5 px-2 text-[10px] text-sidebar-foreground/40">Powered by Pharmacy Billing</div>
          )}
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-x-hidden bg-background print:w-full">
        <div className="flex h-12 shrink-0 items-center justify-end border-b px-4 print:hidden">
          <BranchSwitcher
            branches={branchScope.branches}
            selectedBranchId={branchScope.branchId}
            isAllBranches={branchScope.isAllBranches}
            canViewAll={user.role === "owner"}
          />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
