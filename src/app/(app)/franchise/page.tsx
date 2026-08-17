import { auth } from "@/auth";
import { getFranchiseStatus, getFranchiseRollupReport } from "@/lib/actions/franchise";
import { defaultMonthRange } from "@/lib/date-range";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { CreateOrJoinFranchise } from "@/components/franchise/create-or-join-franchise";
import { FranchiseOwnerDashboard } from "@/components/franchise/franchise-owner-dashboard";
import { FranchiseMemberView } from "@/components/franchise/franchise-member-view";

export default async function FranchisePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role !== "owner") return <RestrictedAccess />;

  const status = await getFranchiseStatus();
  const params = await searchParams;
  const { from, to } = defaultMonthRange(params);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Franchise / Dealer Network</h1>
        <p className="text-sm text-muted-foreground">
          Link independent pharmacies together without merging any data — each pharmacy&apos;s own
          stock, sales, and customers stay fully separate and isolated.
        </p>
      </div>

      {status.role === "none" && <CreateOrJoinFranchise />}

      {status.role === "owner" && status.group && (
        <FranchiseOwnerDashboard
          group={status.group}
          from={from}
          to={to}
          initialReport={await getFranchiseRollupReport(from, to)}
        />
      )}

      {status.role === "member" && status.membership && (
        <FranchiseMemberView
          groupName={status.membership.groupName}
          rollupOptIn={status.membership.rollupOptIn}
        />
      )}
    </div>
  );
}
