import { auth } from "@/auth";
import { getFeedbackReport } from "@/lib/actions/customer-feedback";
import { defaultMonthRange } from "@/lib/date-range";
import { DateRangeFilter } from "@/components/reports/date-range-filter";
import { RestrictedAccess } from "@/components/reports/restricted-access";
import { FeedbackTrendChart } from "@/components/feedback/feedback-trend-chart";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Star } from "lucide-react";

export default async function FeedbackReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const canView = session.user.role === "owner" || session.user.role === "pharmacist";
  if (!canView) return <RestrictedAccess />;

  const params = await searchParams;
  const { from, to } = defaultMonthRange(params);
  const report = await getFeedbackReport(from, to);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Customer Feedback</h1>
        <p className="text-sm text-muted-foreground">
          {report.totalResponses} response{report.totalResponses === 1 ? "" : "s"}
          {report.averageRating !== null && ` · ${report.averageRating.toFixed(1)} average rating`}
        </p>
      </div>

      <DateRangeFilter from={from} to={to} basePath="/reports/feedback" />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Rating trend</h2>
          <div className="rounded-lg border p-3">
            <FeedbackTrendChart data={report.trend} />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Rating distribution</h2>
          <div className="space-y-2 rounded-lg border p-4">
            {report.distribution
              .slice()
              .reverse()
              .map((d) => (
                <div key={d.rating} className="flex items-center gap-2">
                  <span className="flex w-10 shrink-0 items-center gap-0.5 text-sm">
                    {d.rating} <Star className="h-3 w-3 fill-warning text-warning" />
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: report.totalResponses > 0 ? `${(d.count / report.totalResponses) * 100}%` : "0%",
                      }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {d.count}
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Comments ({report.comments.length})</h2>
        <div className="space-y-3">
          {report.comments.length ? (
            report.comments.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      {c.rating} <Star className="h-3 w-3 fill-warning text-warning" />
                    </Badge>
                    <span className="text-sm font-medium">{c.customerName ?? "Anonymous"}</span>
                    <span className="text-xs text-muted-foreground">{c.branchName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(c.submittedAt), "dd MMM yyyy")}
                  </span>
                </div>
                <p className="mt-2 text-sm">{c.comment}</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No comments in this period.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
