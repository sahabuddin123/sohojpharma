import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronRight, Search, UserRound } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneEmpty,
  PhoneKpi,
  PhoneKpiGrid,
  money,
} from "@/components/mobile/phone-ui";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cacheCustomers, listCachedCustomers } from "@/lib/offline/db";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/customers")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "গ্রাহক তালিকা — SohojPharma" },
      { name: "description", content: "গ্রাহকের বাকি, অগ্রিম ও পূর্ণ লেজার দেখুন।" },
      { property: "og:title", content: "গ্রাহক তালিকা — SohojPharma" },
      { property: "og:description", content: "মোবাইলে গ্রাহকের বকেয়া ও লেজার দেখুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileCustomers,
});

type Row = { id: string; name: string; phone: string | null; due_balance: number | null; pendingSync?: boolean };

function MobileCustomers() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const [filter, setFilter] = useState<"all" | "due" | "advance">("all");
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["m-customers", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const tid = currentTenantId!;
      const loadCached = async (): Promise<Row[]> =>
        (await listCachedCustomers(tid)).map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          due_balance: c.due_balance,
          pendingSync: c.pendingSync,
        }));

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await loadCached();
      }
      try {
        const { data, error } = await supabase
          .from("customers")
          .select("id,name,phone,due_balance")
          .eq("tenant_id", tid)
          .eq("is_active", true)
          .order("due_balance", { ascending: false })
          .limit(500);
        if (error) throw error;
        const rows = (data ?? []) as Row[];
        void cacheCustomers(
          tid,
          rows.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            due_balance: Number(c.due_balance ?? 0),
          })),
        ).catch(() => {});

        const cached = await loadCached().catch(() => []);
        const pendingLocal = cached.filter((c) => c.pendingSync);
        const seen = new Set(rows.map((r) => r.id));
        return [...pendingLocal.filter((p) => !seen.has(p.id)), ...rows];
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await loadCached();
        }
        throw err;
      }
    },
  });

  const stats = useMemo(() => {
    let due = 0, adv = 0, dueCount = 0, advCount = 0;
    for (const r of data) {
      const b = Number(r.due_balance ?? 0);
      if (b > 0) { due += b; dueCount++; }
      if (b < 0) { adv += -b; advCount++; }
    }
    return { due, adv, dueCount, advCount };
  }, [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((r) => {
      const b = Number(r.due_balance ?? 0);
      if (filter === "due" && b <= 0) return false;
      if (filter === "advance" && b >= 0) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [data, filter, search]);

  return (
    <PhoneShell title={t("m.customers.title")} back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={money(stats.due)} label={t("m.customers.totalDue")} />
        <PhoneKpi tone="sky" accent="info" value={money(stats.adv)} label={t("m.customers.totalAdvance")} />
        <PhoneKpi tone="rose" accent="danger" value={stats.dueCount} label={t("m.customers.filterDue")} />
        <PhoneKpi tone="sky" accent="info" value={stats.advCount} label={t("m.customers.filterAdvance")} />
      </PhoneKpiGrid>

      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("m.customers.searchPlaceholder")}
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>

        <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
          {(
            [
              { id: "all", label: `${t("m.customers.filterAll")} (${data.length})` },
              { id: "due", label: `${t("m.customers.filterDue")} (${stats.dueCount})` },
              { id: "advance", label: `${t("m.customers.filterAdvance")} (${stats.advCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "rounded-full py-1.5 text-[11px] font-semibold transition",
                filter === tab.id
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">{t("m.common.loading")}</p>}
        {!isLoading && rows.length === 0 && (
          <PhoneEmpty message={t("m.customers.empty")} />
        )}
        {rows.map((r) => {
          const b = Number(r.due_balance ?? 0);
          return (
            <Link
              key={r.id}
              to={"/m/customer/$id" as never}
              params={{ id: r.id } as never}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)] active:scale-[0.99] transition hover:border-[#0d5c46]/40"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-50 text-[#0d5c46]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{r.name}</p>
                  <p className="truncate text-xs text-slate-500">{r.phone ?? "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <p
                    className={cn(
                      "text-sm font-extrabold",
                      b > 0 ? "text-rose-600" : b < 0 ? "text-[#0d5c46]" : "text-slate-600",
                    )}
                  >
                    {money(Math.abs(b))}
                  </p>
                  <p
                    className={cn(
                      "text-[10px] font-bold",
                      b > 0 ? "text-rose-600" : b < 0 ? "text-[#0d5c46]" : "text-slate-400",
                    )}
                  >
                    {b > 0
                      ? t("m.sales.badgeDue")
                      : b < 0
                        ? t("m.customers.filterAdvance")
                        : t("m.sales.badgePaid")}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </div>
            </Link>
          );
        })}
      </div>
    </PhoneShell>
  );
}
