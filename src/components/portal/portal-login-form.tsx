"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { requestPortalOtp, verifyPortalOtp } from "@/lib/actions/customer-portal";
import { Loader2 } from "lucide-react";

export function PortalLoginForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await requestPortalOtp(slug, phone.trim());
      setStep("otp");
      toast.success("If that number is on file, a code has been sent via WhatsApp.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verify(codeOverride?: string) {
    const value = codeOverride ?? code;
    if (loading || value.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const result = await verifyPortalOtp(slug, { phone: phone.trim(), code: value });
      if (!result.ok) {
        setError(result.error ?? "Incorrect code.");
        setCode("");
        return;
      }
      window.location.assign(`/portal/${slug}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          {step === "phone"
            ? "Enter the phone number on file with this pharmacy."
            : `Enter the 6-digit code sent to ${phone}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "phone" ? (
          <form onSubmit={sendOtp} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send code
            </Button>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <InputOTP
              maxLength={6}
              value={code}
              autoFocus
              disabled={loading}
              onChange={(value) => {
                setCode(value);
                if (value.length === 6) void verify(value);
              }}
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => setStep("phone")}>
              Use a different number
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
