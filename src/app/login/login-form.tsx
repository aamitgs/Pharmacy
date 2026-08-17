"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { AlertCircle, Loader2 } from "lucide-react";

export function LoginForm() {
  const t = useTranslations("login");
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const ERROR_MESSAGES: Record<string, string> = {
    MFA_REQUIRED: t("errorMfaRequired"),
    INVALID_TOTP: t("errorInvalidTotp"),
    TENANT_SUSPENDED: t("errorTenantSuspended"),
    credentials: t("errorCredentials"),
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (needsTotp) totpRef.current?.focus();
  }, [needsTotp]);

  async function submit(codeOverride?: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        totpCode: needsTotp ? (codeOverride ?? totpCode) : "",
        redirect: false,
      });

      if (result?.error) {
        const code = result.code ?? result.error;
        if (code === "MFA_REQUIRED") {
          setNeedsTotp(true);
          setError(null);
        } else {
          setError(ERROR_MESSAGES[code] ?? t("errorGeneric"));
          if (needsTotp) setTotpCode("");
        }
        return;
      }

      // Full reload, not router.push: avoids a stale-session-cookie race
      // against a client-side RSC navigation right after sign-in.
      window.location.assign(callbackUrl);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    void submit();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>
            {t("subtitle")} ·{" "}
            <a href="/signup" className="underline underline-offset-2">
              {t("startTrial")}
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                ref={emailRef}
                type="email"
                autoComplete="username"
                value={email}
                disabled={needsTotp || loading}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={needsTotp || loading}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {needsTotp && (
              <div className="space-y-1.5">
                <Label htmlFor="totp">{t("authenticatorCode")}</Label>
                <InputOTP
                  ref={totpRef as React.Ref<React.ElementRef<typeof InputOTP>>}
                  maxLength={6}
                  value={totpCode}
                  onChange={(value) => {
                    setTotpCode(value);
                    if (value.length === 6) void submit(value);
                  }}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {needsTotp && !error && (
              <p className="text-sm text-muted-foreground">
                {t("passwordVerified")} {ERROR_MESSAGES.MFA_REQUIRED}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {needsTotp ? t("verifyCode") : t("signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
