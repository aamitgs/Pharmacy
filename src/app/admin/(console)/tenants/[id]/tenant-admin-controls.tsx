"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTenantSuspended, overrideTenantPlan, setTenantType } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export function TenantAdminControls({
  tenantId,
  suspended,
  currentPlanCode,
  subscriptionStatus,
  plans,
  tenantType,
}: {
  tenantId: string;
  suspended: boolean;
  currentPlanCode: string | null;
  subscriptionStatus: string | null;
  plans: { code: string; name: string }[];
  tenantType: string;
}) {
  const [pending, startTransition] = useTransition();
  const [isSuspended, setIsSuspended] = useState(suspended);
  const [planCode, setPlanCode] = useState(currentPlanCode ?? "");
  const [type, setType] = useState(tenantType);

  function applyTenantType(value: string) {
    setType(value);
    startTransition(async () => {
      try {
        await setTenantType(tenantId, value as "retail" | "hospital");
        toast.success("Account type updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function toggleSuspend() {
    startTransition(async () => {
      try {
        await setTenantSuspended(tenantId, !isSuspended);
        setIsSuspended((s) => !s);
        toast.success(!isSuspended ? "Tenant suspended" : "Tenant reactivated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function applyPlanOverride(code: string) {
    setPlanCode(code);
    startTransition(async () => {
      try {
        await overrideTenantPlan(tenantId, code);
        toast.success("Plan overridden");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Controls</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-6">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Access</p>
          <Button size="sm" variant={isSuspended ? "default" : "destructive"} disabled={pending} onClick={toggleSuspend}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSuspended ? "Reactivate tenant" : "Suspend tenant"}
          </Button>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Plan override {subscriptionStatus && `(currently ${subscriptionStatus})`}
          </p>
          <Select value={planCode} onValueChange={applyPlanOverride} disabled={pending}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Account type</p>
          <Select value={type} onValueChange={applyTenantType} disabled={pending}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="retail">Retail</SelectItem>
              <SelectItem value="hospital">Hospital</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
