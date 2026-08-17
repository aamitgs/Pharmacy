import { PortalLoginForm } from "@/components/portal/portal-login-form";

export default async function PortalLoginPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="mx-auto max-w-sm">
      <PortalLoginForm slug={slug} />
    </div>
  );
}
