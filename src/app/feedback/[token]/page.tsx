import { notFound } from "next/navigation";
import { getPublicFeedbackByToken } from "@/lib/actions/customer-feedback";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function FeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const feedback = await getPublicFeedbackByToken(token);
  if (!feedback) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {feedback.tenant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={feedback.tenant.logoUrl} alt="" className="mb-1 h-10 max-w-[60%] object-contain" />
          )}
          <CardTitle style={feedback.tenant.primaryColor ? { color: feedback.tenant.primaryColor } : undefined}>
            {feedback.tenant.pharmacyName}
          </CardTitle>
          <CardDescription>How was your visit?</CardDescription>
        </CardHeader>
        <CardContent>
          {feedback.submitted ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">You&apos;ve already shared your feedback.</p>
              <p className="mt-1 text-sm text-muted-foreground">Thank you!</p>
            </div>
          ) : (
            <FeedbackForm token={token} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
