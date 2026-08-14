import { listActivePlans } from "@/lib/actions/subscription";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const plans = await listActivePlans();
  return <SignupForm plans={plans} />;
}
