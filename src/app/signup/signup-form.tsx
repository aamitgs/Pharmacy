"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { signUpTenant } from "@/lib/actions/subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Check, Loader2 } from "lucide-react";

interface PlanSummary {
  code: string;
  name: string;
  priceMonthly: number;
  maxBranches: number | null;
  maxUsers: number | null;
  whiteLabel: boolean;
  publicApiAccess: boolean;
  contactSalesOnly: boolean;
}

export function SignupForm({ plans }: { plans: PlanSummary[] }) {
  const [pharmacyName, setPharmacyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [licensedAddress, setLicensedAddress] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await signUpTenant({ pharmacyName, ownerName, licensedAddress, email, password });
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        // Signup succeeded but the immediate sign-in call failed (rare) —
        // send them to the normal login form instead of leaving them stuck.
        window.location.assign("/login");
        return;
      }
      window.location.assign("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">Start your free trial</h1>
            <p className="text-sm text-muted-foreground">
              14 days free, no card required. Upgrade any time from Settings.
            </p>
          </div>
          <div className="space-y-2">
            {plans.map((plan) => (
              <Card key={plan.code} className={plan.code === "trial" ? "border-primary" : ""}>
                <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-sm">
                      {plan.name}
                      {plan.code === "trial" && <Badge>Start here</Badge>}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {plan.contactSalesOnly
                        ? "Custom pricing — talk to sales"
                        : plan.priceMonthly === 0
                          ? "Free"
                          : `₹${plan.priceMonthly.toFixed(0)}/month`}
                      {" · "}
                      {plan.maxBranches ? `${plan.maxBranches} branch${plan.maxBranches === 1 ? "" : "es"}` : "Unlimited branches"}
                      {" · "}
                      {plan.maxUsers ? `${plan.maxUsers} users` : "Unlimited users"}
                      {plan.whiteLabel && " · White-labeling"}
                      {plan.publicApiAccess && " · API access"}
                    </CardDescription>
                  </div>
                  {plan.code === "trial" && <Check className="h-4 w-4 text-primary" />}
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create your pharmacy account</CardTitle>
            <CardDescription>
              Already have an account?{" "}
              <Link href="/login" className="underline underline-offset-2">
                Sign in
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pharmacyName">Pharmacy name</Label>
                <Input id="pharmacyName" value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} required disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="licensedAddress">Branch address</Label>
                <Input id="licensedAddress" value={licensedAddress} onChange={(e) => setLicensedAddress(e.target.value)} required disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ownerName">Your name</Label>
                <Input id="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
