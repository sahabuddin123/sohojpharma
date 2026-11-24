import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Receipt, Layers, History as HistoryIcon, RefreshCw, ArrowDownCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RouteErrorPanel } from "@/components/route-error";
import { SubscriptionBanner } from "@/components/billing/subscription-banner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { renewSubscription, downgradePlan, listPlansPublic } from "@/lib/api/subscriptions.functions";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute("/billing/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Billing — SohojPharma" }] }),
  component: BillingPage,
});

function BillingPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { data: status } = useSubscriptionStatus();
  const qc = useQueryClient();
  const renewFn = useServerFn(renewSubscription);
  const downgradeFn = useServerFn(downgradePlan);
  const listPlansFn = useServerFn(listPlansPublic);

  const renew = useMutation({
    mutationFn: (months: number) => renewFn({ data: { tenant_id: currentTenantId!, months } }),
    onSuccess: () => { toast.success(t("billing.renew_success")); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message || t("billing.renew_failed")),
  });
  const downgrade = useMutation({
    mutationFn: (plan_id: string) => downgradeFn({ data: { tenant_id: currentTenantId!, plan_id } }),
    onSuccess: () => { toast.success(t("billing.downgrade_success")); qc.invalidateQueries(); },
    onError: (e: Error) => {
      try {
        const parsed = JSON.parse(e.message);
        if (parsed.code === "downgrade_blocked") {
          toast.error(t(`errors.downgrade_blocked.${parsed.resource}`, { current: parsed.current, limit: parsed.limit }));
          return;
        }
      } catch { /* fall through */ }
      toast.error(e.message || t("billing.downgrade_failed"));
    },
  });

  async function handleDowngrade() {
    const plans = await listPlansFn();
    const code = window.prompt(t("billing.downgrade_prompt"), plans.map((p: any) => p.code).join(", "));
    if (!code) return;
    const target = plans.find((p: any) => p.code === code);
    if (!target) { toast.error(t("billing.plan_not_found")); return; }
    downgrade.mutate(target.id);
  }

  const { data: plan } = useQuery({
    queryKey: ["billing-plan", status?.plan_id],
    enabled: !!status?.plan_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,code,name,price_bdt,price_yearly_bdt,billing_interval,max_branches,max_users,max_products,features,trial_days")
        .eq("id", status!.plan_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: usage } = useQuery({
    queryKey: ["billing-usage", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const [products, branches, members] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", currentTenantId!),
        supabase.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", currentTenantId!),
        supabase.from("tenant_members").select("user_id", { count: "exact", head: true }).eq("tenant_id", currentTenantId!),
      ]);
      return {
        products: products.count ?? 0,
        branches: branches.count ?? 0,
        users: members.count ?? 0,
      };
    },
  });

  const stateBadge = {
    active: { label: "Active", className: "bg-emerald-500 text-white" },
    trial: { label: "Trial", className: "bg-amber-500 text-white" },
    grace: { label: "Grace period", className: "bg-orange-500 text-white" },
    expired: { label: "Expired", className: "bg-destructive text-destructive-foreground" },
    suspended: { label: "Suspended", className: "bg-destructive text-destructive-foreground" },
    none: { label: "No subscription", className: "bg-muted text-foreground" },
  }[status?.state ?? "none"];

  return (
    <AppShell variant="store" title="Billing">
      <PageHeader
        title="Subscription & Billing"
        description="Manage your plan, payments, and usage limits."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/billing/history"><HistoryIcon className="mr-2 h-4 w-4" />History</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/billing/plans"><Layers className="mr-2 h-4 w-4" />Change plan</Link>
            </Button>
          </div>
        }
      />

      <SubscriptionBanner />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Current Plan</CardTitle>
              <Badge className={stateBadge.className}>{stateBadge.label}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{plan?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {plan ? `৳ ${Number(plan.price_bdt).toLocaleString("en-IN")} / month` : "No active plan"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Days remaining</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{status?.days_remaining ?? 0}</p>
            <p className="text-sm text-muted-foreground">
              {status?.current_period_end
                ? `Ends ${new Date(status.current_period_end).toLocaleDateString()}`
                : status?.trial_ends_at
                  ? `Trial ends ${new Date(status.trial_ends_at).toLocaleDateString()}`
                  : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button asChild size="sm" className="w-full">
              <Link to="/billing/plans"><CreditCard className="mr-2 h-4 w-4" />{t("billing.upgrade")}</Link>
            </Button>
            <Button
              size="sm" variant="secondary" className="w-full"
              disabled={!currentTenantId || renew.isPending}
              onClick={() => renew.mutate(1)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />{t("billing.renew")}
            </Button>
            <Button
              size="sm" variant="outline" className="w-full"
              disabled={!currentTenantId || downgrade.isPending}
              onClick={handleDowngrade}
            >
              <ArrowDownCircle className="mr-2 h-4 w-4" />{t("billing.downgrade")}
            </Button>
            <Button asChild size="sm" variant="ghost" className="w-full">
              <Link to="/billing/history"><Receipt className="mr-2 h-4 w-4" />{t("billing.history")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Usage vs limits</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <UsageRow label="Products" current={usage?.products ?? 0} limit={plan?.max_products} />
          <UsageRow label="Branches" current={usage?.branches ?? 0} limit={plan?.max_branches} />
          <UsageRow label="Users"    current={usage?.users    ?? 0} limit={plan?.max_users} />
        </CardContent>
      </Card>
    </AppShell>
  );
}

function UsageRow({ label, current, limit }: { label: string; current: number; limit?: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, (current / limit) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {current} / {limit ?? "Unlimited"}
        </span>
      </div>
      {limit && limit > 0 ? <Progress value={pct} /> : <div className="h-2 rounded bg-muted" />}
    </div>
  );
}
