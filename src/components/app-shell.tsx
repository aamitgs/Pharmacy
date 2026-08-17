"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { UserRole } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";
import { BranchSwitcher } from "@/components/branch-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { StaffWalkthrough } from "@/components/onboarding/staff-walkthrough";
import { CERTIFIABLE_ROLES } from "@/lib/certification";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
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
  RefreshCcw,
  FileSignature,
  Thermometer,
  Star,
  Handshake,
} from "lucide-react";

type NavItem = {
  href: string;
  labelKey: string;
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

// labelKey resolves against the "nav" namespace in messages/<locale>.json
// (Phase 10.1) — add a language by adding a translation file, not by
// touching this list.
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/analytics", labelKey: "analytics", icon: LineChart, roles: ["owner"] },
  { href: "/franchise", labelKey: "franchise", icon: Handshake, roles: ["owner"] },
  { href: "/alerts", labelKey: "alerts", icon: TriangleAlert },
  { href: "/cold-chain-log", labelKey: "coldChainLog", icon: Thermometer, roles: RETAIL_ONLY_ROLES },
  { href: "/pos", labelKey: "billing", icon: ScanBarcode, roles: RETAIL_ONLY_ROLES },
  { href: "/items", labelKey: "items", icon: Package },
  { href: "/suppliers", labelKey: "suppliers", icon: Truck, roles: RETAIL_ONLY_ROLES },
  { href: "/purchase-orders", labelKey: "purchaseOrders", icon: ClipboardList, roles: RETAIL_ONLY_ROLES },
  { href: "/grn", labelKey: "grn", icon: PackageCheck, roles: RETAIL_ONLY_ROLES },
  { href: "/purchase-returns", labelKey: "purchaseReturns", icon: Undo2, roles: RETAIL_ONLY_ROLES },
  { href: "/transfers", labelKey: "stockTransfers", icon: ArrowLeftRight, roles: RETAIL_ONLY_ROLES },
  { href: "/indents", labelKey: "indents", icon: ClipboardPlus, hospitalOnly: true },
  { href: "/admissions", labelKey: "patientAdmissions", icon: BedDouble, hospitalOnly: true },
  {
    href: "/branches",
    labelKey: "branches",
    icon: Building2,
    roles: ["owner", "pharmacist"],
  },
  { href: "/customers", labelKey: "customers", icon: Users },
  { href: "/doctors", labelKey: "doctors", icon: Stethoscope },
  { href: "/invoices", labelKey: "invoices", icon: Receipt },
  {
    href: "/refill-requests",
    labelKey: "refillRequests",
    icon: RefreshCcw,
    roles: ["owner", "pharmacist", "counter_staff", "ward_pharmacist"],
  },
  {
    href: "/insurance-claims",
    labelKey: "insuranceClaims",
    icon: FileHeart,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/insurance-providers",
    labelKey: "insuranceProviders",
    icon: ShieldCheck,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/schemes",
    labelKey: "schemes",
    icon: Percent,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/loyalty-tiers",
    labelKey: "loyaltyTiers",
    icon: Award,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/coupons",
    labelKey: "coupons",
    icon: Ticket,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/rate-contracts",
    labelKey: "rateContracts",
    icon: FileSignature,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/sales-register",
    labelKey: "salesRegister",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/purchase-register",
    labelKey: "purchaseRegister",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/stock-ledger",
    labelKey: "stockLedger",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/margin",
    labelKey: "marginReport",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/discounts",
    labelKey: "discountReport",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/movers",
    labelKey: "fastSlowMovers",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/scheme-benefits",
    labelKey: "schemeBenefits",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/feedback",
    labelKey: "customerFeedback",
    icon: Star,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/tally-export",
    labelKey: "tallyExport",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/narcotic-register",
    labelKey: "narcoticRegister",
    icon: ShieldAlert,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/hsn-summary",
    labelKey: "hsnSummary",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  {
    href: "/reports/gstr-export",
    labelKey: "gstrExport",
    icon: FileSpreadsheet,
    roles: ["owner", "pharmacist"],
  },
  { href: "/settings", labelKey: "settings", icon: Settings },
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
    // Phase 10.3: null/undefined -> the guided walkthrough hasn't been
    // completed yet.
    certifiedAt?: Date | null;
    // Phase 10.5: applied on this component's own wrapper (not the root
    // <html>) since it's a personal preference scoped to the authenticated
    // counter screens, not the public login/portal pages.
    highContrast?: boolean;
  };
  branchScope: {
    branches: { id: string; name: string }[];
    branchId: string | null;
    isAllBranches: boolean;
  };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  const items = NAV_ITEMS.filter(
    (item) =>
      (!item.roles || item.roles.includes(user.role)) && (!item.hospitalOnly || user.tenantType === "hospital")
  );

  const needsCertification = CERTIFIABLE_ROLES.has(user.role) && !user.certifiedAt;

  return (
    <div className={cn("flex min-h-screen", user.highContrast && "high-contrast")}>
      <ServiceWorkerRegister />
      <StaffWalkthrough open={needsCertification} />
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
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <div className="mb-1.5 truncate px-2 text-xs text-sidebar-foreground/60">
            {user.name} · {user.role.replace("_", " ")}
          </div>
          <SignOutButton variant="ghost" size="sm" className="w-full justify-start">
            {tCommon("signOut")}
          </SignOutButton>
          {user.showPoweredBy && (
            <div className="mt-1.5 px-2 text-[10px] text-sidebar-foreground/40">{tCommon("poweredBy")}</div>
          )}
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-x-hidden bg-background print:w-full">
        <div className="flex h-12 shrink-0 items-center justify-end gap-3 border-b px-4 print:hidden">
          <LanguageSwitcher />
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
