import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

export function OnboardingChecklist({ hasItems, hasSale }: { hasItems: boolean; hasSale: boolean }) {
  const steps = [
    { label: "Branch details set up", done: true, href: "/branches" },
    { label: "Add your items (or import a CSV)", done: hasItems, href: "/settings" },
    { label: "Make your first sale", done: hasSale, href: "/pos" },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
        <Rocket className="h-4 w-4 text-primary" />
        <CardTitle className="text-sm font-medium">Get started</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step) => (
          <Link
            key={step.label}
            href={step.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50",
              step.done && "text-muted-foreground"
            )}
          >
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <Circle className="h-4 w-4 shrink-0" />
            )}
            <span className={step.done ? "line-through" : ""}>{step.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
