import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneCard,
  PhoneKpi,
  PhoneKpiGrid,
  PhoneRow,
  money,
} from "@/components/mobile/phone-ui";
import { useAuth } from "@/hooks/use-auth";
import { getStoreDashboard } from "@/lib/api/dashboard.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/analytics")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "অ্যানালিটিক্স — SohojPharma" },
      { name: "description", content: "বিক্রির ধারা, সেরা ওষুধ, কোম্পানি ও স্টক বিশ্লেষণ।" },
    ],
  }),
  component: MobileAnalytics,
});

type Tab = "trend" | "top" | "stock";
type DatePreset = "today" | "yesterday" | "7d" | "month" | "custom";

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.label}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-medium text-slate-600">{i.label}</span>
            <span className="shrink-0 font-bold text-slate-900">{money(i.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#0d5c46]"
              style={{ width: `${Math.max(2, Math.round((i.value / max) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MobileAnalytics() {
  const { currentTenantId } = useAuth();
  const fetchDashboard = useServerFn(getStoreDashboard);
  const [tab, setTab] = useState<Tab>("trend");
  const bdToday = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [preset, setPreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState(bdToday);
  const [customTo, setCustomTo] = useState(bdToday);

  const { from, to } = useMemo(() => {
    const now = new Date(Date.now() + 6 * 60 * 60 * 1000);
    if (preset === "today") return { from: bdToday, to: bdToday };
    if (preset === "yesterday") {
      const y = new Date(now);
      y.setUTCDate(y.getUTCDate() - 1);
      const yStr = y.toISOString().slice(0, 10);
      return { from: yStr, to: yStr };
    }
    if (preset === "7d") {
      const s = new Date(now);
      s.setUTCDate(s.getUTCDate() - 6);
      return { from: s.toISOString().slice(0, 10), to: bdToday };
    }
    if (preset === "month") return { from: `${bdToday.slice(0, 7)}-01`, to: bdToday };
    return { from: customFrom || bdToday, to: customTo || customFrom || bdToday };
  }, [preset, bdToday, customFrom, customTo]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["m-analytics", currentTenantId, from, to],
    enabled: !!currentTenantId,
    staleTime: 60_000,
    queryFn: () =>
      fetchDashboard({
        data: { tenant_id: currentTenantId!, from_date: from, to_date: to },
      }),
  });

  const k = data?.kpi;
  const daily = (data?.dailySales ?? []).filter((d) => d.sales > 0 || d.profit > 0);
  const monthly = (data?.monthly ?? []).filter((m) => m.sales > 0 || m.purchase > 0);
  const topMeds = data?.topMedicines ?? [];
  const topCos = data?.topCompanies ?? [];
  const cats = data?.categoryInventory ?? [];

  return (
    <PhoneShell title="অ্যানালিটিক্স" back>
      {/* Date Filter Bar */}
      <div className="mb-3 space-y-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <Calendar className="mr-0.5 h-3.5 w-3.5 shrink-0 text-[#0d5c46]" />
          {(
            [
              ["today", "আজ"],
              ["yesterday", "গতকাল"],
              ["7d", "৭ দিন"],
              ["month", "এই মাস"],
              ["custom", "তারিখ"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreset(key)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                preset === key
                  ? "bg-[#0d5c46] text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium text-slate-500">শুরু</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || bdToday}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium text-slate-500">শেষ</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={bdToday}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
              />
            </label>
          </div>
        )}
      </div>

      <div className={cn("transition-opacity", isFetching && "opacity-60")}>
        <PhoneKpiGrid>
          <PhoneKpi tone="mint" accent="success" value={money(k?.todaySales)} label="মোট বিক্রি" />
          <PhoneKpi
            tone="lilac"
            accent={(k?.todayProfit ?? 0) < 0 ? "danger" : "success"}
            value={money(k?.todayProfit)}
            label="নিট লাভ"
          />
          <PhoneKpi tone="rose" accent="danger" value={money(k?.todayExpense)} label="মোট খরচ" />
          <PhoneKpi tone="sky" value={money(k?.inventoryValue)} label="ইনভেন্টরি মূল্য" />
        </PhoneKpiGrid>
      </div>

      <div className="phone-grid-keep mt-3 grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
        {(
          [
            ["trend", "বিক্রির ধারা"],
            ["top", "সেরা পণ্য"],
            ["stock", "স্টক বিশ্লেষণ"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "rounded-full py-1.5 text-[11px] font-semibold transition",
              tab === key
                ? "bg-white text-[#0d5c46] shadow-xs"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}

      {!isLoading && tab === "trend" && (
        <div className="mt-3 space-y-3">
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-slate-900">দৈনিক বিক্রি</p>
            {daily.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">এখনো কোনো বিক্রির তথ্য নেই</p>
            ) : (
              <Bars items={daily.slice(-10).map((d) => ({ label: d.day, value: d.sales }))} />
            )}
          </PhoneCard>
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-slate-900">মাসিক বিক্রি বনাম ক্রয়</p>
            {monthly.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">মাসিক কোনো তথ্য নেই</p>
            ) : (
              monthly.map((m) => (
                <PhoneRow
                  key={m.m}
                  label={m.m}
                  value={`${money(m.sales)} / ${money(m.purchase)}`}
                />
              ))
            )}
          </PhoneCard>
        </div>
      )}

      {!isLoading && tab === "top" && (
        <div className="mt-3 space-y-3">
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-slate-900">সর্বাধিক বিক্রিত ওষুধ</p>
            {topMeds.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">কোনো বিক্রির তথ্য নেই</p>
            ) : (
              <Bars items={topMeds.map((m) => ({ label: `${m.name} (${m.qty} পিস)`, value: m.revenue }))} />
            )}
          </PhoneCard>
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-slate-900">শীর্ষ কোম্পানি</p>
            {topCos.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">কোনো তথ্য নেই</p>
            ) : (
              <Bars items={topCos.map((c) => ({ label: c.name, value: c.revenue }))} />
            )}
          </PhoneCard>
        </div>
      )}

      {!isLoading && tab === "stock" && (
        <div className="mt-3 space-y-3">
          <PhoneCard>
            <p className="mb-3 text-sm font-bold text-slate-900">ক্যাটাগরি অনুযায়ী স্টক</p>
            {cats.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">কোনো স্টক তথ্য নেই</p>
            ) : (
              <Bars items={cats.map((c) => ({ label: c.name, value: c.value }))} />
            )}
          </PhoneCard>
          <PhoneCard>
            <p className="mb-2 text-sm font-bold text-slate-900">স্টক সতর্কতা</p>
            <PhoneRow label="স্টক কম (Low stock)" value={`${k?.lowStock ?? 0}টি`} />
            <PhoneRow label="মেয়াদোত্তীর্ণ (Expired)" value={`${k?.expired ?? 0}টি`} />
            <PhoneRow label="মেয়াদ কাছাকাছি (Near expiry)" value={`${k?.nearExpiry ?? 0}টি`} />
          </PhoneCard>
        </div>
      )}
    </PhoneShell>
  );
}
