import { Link } from "@tanstack/react-router";
import { Check, Circle, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";

type Item = { label: string; done: boolean; href: string };

export function OnboardingChecklist() {
  const { branchCount, warehouseCount, registerCount, completionPct, isComplete, isLoading } =
    useOnboardingStatus();

  if (isLoading || isComplete) return null;

  const items: Item[] = [
    { label: "Branch Created", done: branchCount > 0, href: "/setup" },
    { label: "Warehouse Created", done: warehouseCount > 0, href: "/inventory/warehouses" },
    { label: "Register Created", done: registerCount > 0, href: "/sales/register" },
  ];

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Finish setting up SohojPharma</CardTitle>
            <CardDescription>
              {completionPct}% complete — a few more steps before you're ready to sell.
            </CardDescription>
          </div>
          <Button asChild size="sm">
            <Link to="/setup">
              Open setup <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.label} className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                {it.done ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={it.done ? "text-emerald-700 dark:text-emerald-400" : ""}>
                  {it.label}
                </span>
              </span>
              {!it.done && (
                <Link to={it.href} className="text-xs font-medium text-primary hover:underline">
                  Set up
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
