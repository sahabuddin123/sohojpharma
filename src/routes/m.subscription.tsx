import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CreditCard, Crown, History, Layers } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneCard, PhoneEmpty, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/subscription")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "সাবস্ক্রিপশন — SohojPharma" },
      { name: "description", content: "আপনার ফার্মেসি প্ল্যান, ব্যবহার ও পেমেন্ট ইতিহাস।" },
    ],
  }),
  component: MobileSubscription,
});

type Tab = "current" | "plans" | "history";

type PlanRow = {
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
  sort_order: number;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  billing_cycle: string;
  transaction_id: string | null;
  status: string;
  created_at: string;
  plans: { name: string } | null;
};

function UsageBar({ label, used, max }: { label: string; used: number; max: number | null | undefined }) {
  const unlimited = !max || max <= 0;
  const pct = unlimited ? 12 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-bold text-slate-900">
          {used.toLocaleString()} / {unlimited ? "আনলিমিটেড" : max.toLocaleString()}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-rose-500" : "bg-[#0d5c46]")}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
    </div>
  );
}

function MobileSubscription() {
  const navigate = useNavigate();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { data: status, isLoading: loadingStatus } = useSubscriptionStatus();

  const [tab, setTab] = useState<Tab>("current");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");

  const { data: plan } = useQuery({
    queryKey: ["m-sub-plan", status?.plan_id],
    enabled: !!status?.plan_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,code,name,price_bdt,price_yearly_bdt,max_branches,max_users,max_products,trial_days")
        .eq("id", status!.plan_id!)
        .maybeSingle();
      if (error) throw error;
      return data as PlanRow | null;
    },
  });

  const { data: usage } = useQuery({
    queryKey: ["m-sub-usage", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [products, branches, members] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("tenant_members").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      ]);
      return {
        products: products.count ?? 0,
        branches: branches.count ?? 0,
        users: members.count ?? 0,
      };
    },
  });

  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["m-sub-plans-all"],
    enabled: tab === "plans",
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

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ["m-sub-history", tenantId],
    enabled: !!tenantId && tab === "history",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_payments")
        .select("id,amount,method,billing_cycle,transaction_id,status,created_at,plans(name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentRow[];
    },
  });

  const daysLeft = (() => {
    const end = status?.expires_at ?? status?.trial_ends_at;
    if (!end) return null;
    const diff = Math.ceil((new Date(end).getTime() - Date.now()) / 86_400_000);
    return Math.max(0, diff);
  })();

  const statusBadge = (() => {
    const s = status?.status ?? "trial";
    if (s === "active") return { label: "সক্রিয়", cls: "bg-emerald-50 text-[#0d5c46]" };
    if (s === "trial") return { label: "ট্রায়াল", cls: "bg-sky-50 text-sky-700" };
    if (s === "past_due" || s === "grace") return { label: "বকেয়া", cls: "bg-amber-50 text-amber-700" };
    return { label: "মেয়াদ শেষ", cls: "bg-rose-50 text-rose-600" };
  })();

  return (
    <PhoneShell title="সাবস্ক্রিপশন" back>
      {/* 3-Column Tabs */}
      <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
        {(
          [
            { id: "current", label: "বর্তমান প্ল্যান", icon: Crown },
            { id: "plans", label: "প্ল্যানসমূহ", icon: Layers },
            { id: "history", label: "পেমেন্ট ইতিহাস", icon: History },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-full py-2 text-[11px] font-semibold transition",
                tab === item.id
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Current Plan & Usage */}
      {tab === "current" && (
        <div className="mt-3 space-y-3">
          <PhoneCard className="space-y-3">
            {loadingStatus ? (
              <p className="py-6 text-center text-xs text-slate-500">লোড হচ্ছে…</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500">সক্রিয় প্যাকেজ</p>
                    <p className="mt-0.5 text-lg font-extrabold text-slate-900">
                      {plan?.name ?? status?.plan_name ?? "Basic"}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", statusBadge.cls)}>
                    {statusBadge.label}
                  </span>
                </div>

                <div className="phone-grid-keep grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                  <div>
                    <p className="text-[10px] text-slate-500">মেয়াদ শেষ</p>
                    <p className="mt-0.5 font-bold text-slate-900">
                      {(status?.expires_at ?? status?.trial_ends_at)
                        ? new Date(status!.expires_at ?? status!.trial_ends_at!).toLocaleDateString("en-GB")
                        : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500">বাকি সময়</p>
                    <p className="mt-0.5 font-extrabold text-[#0d5c46]">
                      {daysLeft !== null ? `${daysLeft} দিন` : "—"}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => setTab("plans")}
                  className="w-full h-10 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white text-xs font-bold gap-1.5"
                >
                  <CreditCard className="h-4 w-4" />
                  প্ল্যান আপগ্রেড / রিনিউ করুন
                </Button>
              </>
            )}
          </PhoneCard>

          <PhoneCard className="space-y-3">
            <p className="text-sm font-extrabold text-slate-900">ব্যবহারের সীমা (Usage)</p>
            <UsageBar label="পণ্য (Products)" used={usage?.products ?? 0} max={plan?.max_products} />
            <UsageBar label="শাখা (Branches)" used={usage?.branches ?? 0} max={plan?.max_branches} />
            <UsageBar label="ব্যবহারকারী (Users)" used={usage?.users ?? 0} max={plan?.max_users} />
          </PhoneCard>
        </div>
      )}

      {/* Tab 2: Available Plans */}
      {tab === "plans" && (
        <div className="mt-3 space-y-3">
          <div className="phone-grid-keep grid grid-cols-2 gap-1 rounded-full bg-[#e9eeea] p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={cn(
                "rounded-full py-1.5 text-xs font-semibold transition",
                cycle === "monthly" ? "bg-white text-[#0d5c46] shadow-xs" : "text-slate-600",
              )}
            >
              মাসিক (Monthly)
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={cn(
                "rounded-full py-1.5 text-xs font-semibold transition",
                cycle === "yearly" ? "bg-white text-[#0d5c46] shadow-xs" : "text-slate-600",
              )}
            >
              বাৎসরিক (Yearly)
            </button>
          </div>

          {loadingPlans && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
          {plans.map((p) => {
            const price = cycle === "yearly" ? (p.price_yearly_bdt ?? Number(p.price_bdt) * 12) : p.price_bdt;
            const isCurrent = status?.plan_id === p.id;
            const feats = Array.isArray(p.features)
              ? (p.features as string[])
              : Object.entries((p.features ?? {}) as Record<string, unknown>)
                  .filter(([, v]) => v === true)
                  .map(([k]) => k.replace(/_/g, " "));
            return (
              <PhoneCard key={p.id} className={cn("space-y-3", isCurrent && "border-[#0d5c46] ring-1 ring-[#0d5c46]/30")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-extrabold text-slate-900">{p.name}</p>
                    <p className="mt-0.5 text-lg font-black text-[#0d5c46]">
                      {money(price)}
                      <span className="text-xs font-medium text-slate-500">
                        {" "}/ {cycle === "yearly" ? "বছর" : "মাস"}
                      </span>
                    </p>
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-[#0d5c46]">
                      বর্তমান
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-50 p-2 text-center text-[11px] phone-grid-keep">
                  <div>
                    <p className="text-slate-500">পণ্য</p>
                    <p className="font-bold">{p.max_products ?? "∞"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">ইউজার</p>
                    <p className="font-bold">{p.max_users ?? "∞"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">শাখা</p>
                    <p className="font-bold">{p.max_branches ?? "∞"}</p>
                  </div>
                </div>

                {feats.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-600">
                    {feats.slice(0, 4).map((f) => (
                      <li key={f} className="flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5 shrink-0 text-[#0d5c46]" />
                        <span className="capitalize">{f}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/billing/checkout/$planId" as never,
                      params: { planId: p.id } as never,
                      search: { cycle, from: "mobile" } as never,
                    })
                  }
                  className="w-full h-10 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white text-xs font-bold"
                >
                  {isCurrent ? "রিনিউ করুন" : "এই প্ল্যান নিন"}
                </Button>
              </PhoneCard>
            );
          })}
        </div>
      )}

      {/* Tab 3: Billing History */}
      {tab === "history" && (
        <div className="mt-3 space-y-2.5">
          {loadingHistory && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
          {!loadingHistory && history.length === 0 && (
            <PhoneEmpty message="এখনো কোনো পেমেন্ট ইতিহাস নেই" />
          )}
          {history.map((h) => {
            const badge =
              h.status === "approved"
                ? { label: "অনুমোদিত", cls: "bg-emerald-50 text-[#0d5c46]" }
                : h.status === "rejected"
                  ? { label: "বাতিল", cls: "bg-rose-50 text-rose-600" }
                  : { label: "অপেক্ষমাণ", cls: "bg-amber-50 text-amber-700" };
            return (
              <PhoneCard key={h.id} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">{h.plans?.name ?? "Plan"}</p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(h.created_at).toLocaleDateString("en-GB")} · {h.method.toUpperCase()} ({h.billing_cycle})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-[#0d5c46]">{money(h.amount)}</p>
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-bold", badge.cls)}>
                      {badge.label}
                    </span>
                  </div>
                </div>
                {h.transaction_id && (
                  <p className="text-[11px] text-slate-500">TrxID: {h.transaction_id}</p>
                )}
              </PhoneCard>
            );
          })}
        </div>
      )}
    </PhoneShell>
  );
}
