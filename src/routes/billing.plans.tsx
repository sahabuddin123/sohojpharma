import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";

export const Route = createFileRoute("/billing/plans")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Plans — SohojPharma" }] }),
  component: PlansPage,
});

interface PlanRow {
  id: string;
  code: string;
  name: string;
  price_bdt: number;
  price_yearly_bdt: number | null;
  trial_days: number;
  max_products: number | null;
  max_users: number | null;
  max_branches: number | null;
  features: Record<string, unknown> | string[] | null;
  is_active: boolean;
  sort_order: number;
}

function PlansPage() {
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const { data: status } = useSubscriptionStatus();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["plans-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PlanRow[];
    },
  });

  return (
    <AppShell variant="store" title="Plans">
      <PageHeader
        title="Choose a plan"
        description="Pick a plan to start a trial or renew your subscription."
        actions={
          <div className="inline-flex rounded-md border bg-muted p-1">
            <Button size="sm" variant={cycle === "monthly" ? "default" : "ghost"} onClick={() => setCycle("monthly")}>Monthly</Button>
            <Button size="sm" variant={cycle === "yearly" ? "default" : "ghost"} onClick={() => setCycle("yearly")}>Yearly</Button>
          </div>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading plans…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => {
            const price = cycle === "yearly" ? (p.price_yearly_bdt ?? Number(p.price_bdt) * 12) : p.price_bdt;
            const featureList = Array.isArray(p.features)
              ? p.features as string[]
              : Object.entries((p.features ?? {}) as Record<string, unknown>)
                  .filter(([, v]) => v === true)
                  .map(([k]) => k.replace(/_/g, " "));
            const current = status?.plan_id === p.id;
            return (
              <Card key={p.id} className={current ? "border-primary ring-1 ring-primary/30" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{p.name}</CardTitle>
                    {current && <Badge>Current</Badge>}
                  </div>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">৳ {Number(price ?? 0).toLocaleString("en-IN")}</span>
                    <span className="text-sm text-muted-foreground"> / {cycle === "yearly" ? "year" : "month"}</span>
                  </div>
                  {p.trial_days > 0 && (
                    <p className="text-xs text-muted-foreground">{p.trial_days}-day free trial available</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1.5 text-sm">
                    <Item>{p.max_branches ?? "Unlimited"} branches</Item>
                    <Item>{p.max_users ?? "Unlimited"} users</Item>
                    <Item>{p.max_products ?? "Unlimited"} products</Item>
                    {featureList.slice(0, 8).map((f) => <Item key={f}>{f}</Item>)}
                  </ul>
                  <Button
                    className="w-full"
                    onClick={() => navigate({ to: "/billing/checkout/$planId", params: { planId: p.id }, search: { cycle } })}
                  >
                    {current ? "Renew" : "Select plan"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> {children}</li>;
}
