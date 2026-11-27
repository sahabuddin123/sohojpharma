import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Building2,
  Calendar,
  Copy,
  FileText,
  Package,
  Printer,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneCard, PhoneEmpty, PhoneRow, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getStoreDashboard } from "@/lib/api/dashboard.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/report")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "রিপোর্ট সেন্টার — SohojPharma" },
      { name: "description", content: "ফার্মেসির সব ধরনের রিপোর্ট তৈরি ও প্রিন্ট করুন।" },
    ],
  }),
  component: MobileReport,
});

type ReportType = "sales" | "purchase" | "pnl" | "customer_due" | "supplier_due" | "stock";
type DatePreset = "today" | "yesterday" | "7d" | "month" | "custom";

const REPORT_TYPES: Array<{ id: ReportType; key: string; icon: typeof FileText }> = [
  { id: "pnl", key: "m.report.pnl", icon: TrendingUp },
  { id: "sales", key: "m.report.sales", icon: ShoppingCart },
  { id: "purchase", key: "m.report.purchase", icon: Truck },
  { id: "customer_due", key: "m.report.customerDue", icon: Users },
  { id: "supplier_due", key: "m.report.supplierDue", icon: Building2 },
  { id: "stock", key: "m.report.stock", icon: Package },
];

function MobileReport() {
  const { t } = useTranslation();
  const { currentTenantId, memberships } = useAuth();
  const tenantId = currentTenantId ?? "";
  const tenantName =
    memberships.find((m) => m.tenant_id === currentTenantId)?.tenants?.name ?? "SohojPharma";
  const fetchDashboard = useServerFn(getStoreDashboard);

  const bdToday = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [reportType, setReportType] = useState<ReportType>("pnl");
  const [preset, setPreset] = useState<DatePreset>("today");
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

  const { data: dash, isLoading: loadingDash } = useQuery({
    queryKey: ["m-report-dash", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: () => fetchDashboard({ data: { tenant_id: tenantId, from_date: from, to_date: to } }),
  });

  const { data: reportRows, isLoading: loadingRows } = useQuery({
    queryKey: ["m-report-rows", tenantId, reportType, from, to],
    enabled: !!tenantId && reportType !== "pnl",
    queryFn: async () => {
      if (reportType === "sales") {
        const { data, error } = await supabase
          .from("sales")
          .select("id,invoice_no,total,paid,due,discount,created_at,customers(name)")
          .eq("tenant_id", tenantId)
          .neq("status", "void")
          .gte("created_at", `${from}T00:00:00+06:00`)
          .lte("created_at", `${to}T23:59:59.999+06:00`)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        return data ?? [];
      }
      if (reportType === "purchase") {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select("id,po_number,status,total,order_date,created_at,suppliers(name)")
          .eq("tenant_id", tenantId)
          .gte("created_at", `${from}T00:00:00+06:00`)
          .lte("created_at", `${to}T23:59:59.999+06:00`)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        return data ?? [];
      }
      if (reportType === "customer_due") {
        const { data, error } = await supabase
          .from("v_customer_due")
          .select("customer_id,name,phone,net_due")
          .eq("tenant_id", tenantId)
          .gt("net_due", 0)
          .order("net_due", { ascending: false })
          .limit(200);
        if (error) throw error;
        return data ?? [];
      }
      if (reportType === "supplier_due") {
        const { data, error } = await supabase
          .from("suppliers")
          .select("id,name,phone,due_balance")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .gt("due_balance", 0)
          .order("due_balance", { ascending: false })
          .limit(200);
        if (error) throw error;
        return data ?? [];
      }
      if (reportType === "stock") {
        const { data, error } = await supabase
          .from("batches")
          .select("id,batch_no,expiry_date,qty_on_hand,purchase_price,products(name)")
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .gt("qty_on_hand", 0)
          .order("expiry_date", { ascending: true })
          .limit(200);
        if (error) throw error;
        return data ?? [];
      }
      return [];
    },
  });

  const k = dash?.kpi;
  const activeMeta = REPORT_TYPES.find((r) => r.id === reportType)!;
  const dateLabel = from === to ? from : `${from} → ${to}`;
  const isDateReport = reportType === "pnl" || reportType === "sales" || reportType === "purchase";

  const copySummary = async () => {
    const lines = [
      `${tenantName} — ${t(activeMeta.key)}`,
      `${dateLabel}`,
      "----------------",
    ];
    if (reportType === "pnl" && k) {
      lines.push(
        `মোট বিক্রি: ${money(k.todaySales)}`,
        `নগদ বিক্রি: ${money(k.todayCashSale ?? 0)}`,
        `বাকি বিক্রি: ${money(k.todayDueSale ?? 0)}`,
        `বাকি আদায়: ${money(k.dueCollection)}`,
        `খরচ: ${money(k.todayExpense ?? 0)}`,
        `বিক্রি রিটার্ন: ${money(k.todayReturn ?? 0)}`,
        `নিট লাভ: ${money(k.todayProfit)}`,
        `দৈনিক হাতে ক্যাশ: ${money(k.dailyCashInHand ?? 0)}`,
      );
    } else if (reportRows) {
      lines.push(`মোট এন্ট্রি: ${reportRows.length}টি`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("রিপোর্ট সামারি কপি হয়েছে!");
    } catch {
      toast.error("কপি করা যায়নি");
    }
  };

  const handlePrint = () => {
    setTimeout(() => window.print(), 60);
  };

  return (
    <PhoneShell title={t("m.report.title")} back>
      {/* Report Type Grid */}
      <div className="phone-grid-keep grid grid-cols-3 gap-2">
        {REPORT_TYPES.map((r) => {
          const Icon = r.icon;
          const active = reportType === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setReportType(r.id)}
              className={cn(
                "flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-2.5 text-center transition active:scale-[0.97]",
                active
                  ? "border-[#0d5c46] bg-[#0d5c46] text-white shadow-xs"
                  : "border-slate-200/90 bg-white text-slate-700 hover:border-[#0d5c46]/40",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-[11px] font-bold leading-tight">{t(r.key)}</span>
            </button>
          );
        })}
      </div>

      {/* Date Filter (for date-scoped reports) */}
      {isDateReport && (
        <div className="mt-3 space-y-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <Calendar className="mr-0.5 h-3.5 w-3.5 shrink-0 text-[#0d5c46]" />
            {(
              [
                ["today", t("m.presets.today")],
                ["yesterday", t("m.presets.yesterday")],
                ["7d", t("m.presets.7d")],
                ["month", t("m.presets.month")],
                ["custom", t("m.presets.custom")],
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
              <input
                type="date"
                value={customFrom}
                max={customTo || bdToday}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium"
              />
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={bdToday}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium"
              />
            </div>
          )}
        </div>
      )}

      {/* Action Buttons: Print & Copy */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          onClick={handlePrint}
          className="h-10 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white text-xs font-bold gap-1.5"
        >
          <Printer className="h-4 w-4" />
          {t("m.report.print")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={copySummary}
          className="h-10 rounded-xl text-xs font-bold gap-1.5"
        >
          <Copy className="h-4 w-4" />
          {t("m.report.copy")}
        </Button>
      </div>

      {/* Report Preview */}
      <div className="mt-3 space-y-3">
        {(loadingDash || loadingRows) && (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("m.common.loading")}</p>
        )}

        {!loadingDash && reportType === "pnl" && k && (
          <PhoneCard className="space-y-1">
            <div className="mb-2 border-b border-slate-100 pb-2">
              <p className="text-sm font-extrabold text-slate-900">{t(activeMeta.key)}</p>
              <p className="text-[11px] text-slate-500">সময়কাল: {dateLabel}</p>
            </div>
            <PhoneRow label="মোট বিক্রি" value={money(k.todaySales)} />
            <PhoneRow label="নগদ বিক্রি" value={money(k.todayCashSale ?? 0)} />
            <PhoneRow label="বাকি বিক্রি" value={money(k.todayDueSale ?? 0)} />
            <PhoneRow label="বাকি আদায়" value={money(k.dueCollection)} />
            <PhoneRow label="মোট খরচ" value={money(k.todayExpense ?? 0)} />
            <PhoneRow label="বিক্রি রিটার্ন" value={money(k.todayReturn ?? 0)} />
            <PhoneRow
              label="নিট লাভ"
              value={
                <span className={k.todayProfit < 0 ? "text-rose-600" : "text-[#0d5c46]"}>
                  {k.todayProfit < 0 ? "-" : ""}{money(Math.abs(k.todayProfit))}
                </span>
              }
            />
            <PhoneRow label="দৈনিক হাতে ক্যাশ" value={money(k.dailyCashInHand ?? 0)} />
            <PhoneRow label="মোট ইনভেন্টরি মূল্য" value={money(k.inventoryValue)} />
          </PhoneCard>
        )}

        {!loadingRows && reportType !== "pnl" && (
          <PhoneCard className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <p className="text-sm font-extrabold text-slate-900">{t(activeMeta.key)}</p>
                {isDateReport && <p className="text-[11px] text-slate-500">সময়কাল: {dateLabel}</p>}
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-[#0d5c46]">
                {(reportRows ?? []).length}টি
              </span>
            </div>

            {(reportRows ?? []).length === 0 ? (
              <PhoneEmpty message="এই রিপোর্টে কোনো তথ্য পাওয়া যায়নি" />
            ) : (
              <div className="divide-y divide-slate-100">
                {(reportRows ?? []).map((row: any) => {
                  if (reportType === "sales") {
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2 text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-900">{row.invoice_no}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            {row.customers?.name ?? "সাধারণ গ্রাহক"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-bold text-[#0d5c46]">{money(row.total)}</p>
                          {Number(row.due ?? 0) > 0 && (
                            <p className="text-[10px] text-rose-600">বাকি: {money(row.due)}</p>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (reportType === "purchase") {
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2 text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-900">{row.po_number}</p>
                          <p className="truncate text-[11px] text-slate-500">
                            {row.suppliers?.name ?? "—"}
                          </p>
                        </div>
                        <p className="shrink-0 font-bold text-slate-900">{money(row.total)}</p>
                      </div>
                    );
                  }
                  if (reportType === "customer_due") {
                    return (
                      <div key={row.customer_id} className="flex items-center justify-between py-2 text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-900">{row.name}</p>
                          <p className="text-[11px] text-slate-500">{row.phone ?? "—"}</p>
                        </div>
                        <p className="shrink-0 font-bold text-rose-600">{money(row.net_due)}</p>
                      </div>
                    );
                  }
                  if (reportType === "supplier_due") {
                    return (
                      <div key={row.id} className="flex items-center justify-between py-2 text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-900">{row.name}</p>
                          <p className="text-[11px] text-slate-500">{row.phone ?? "—"}</p>
                        </div>
                        <p className="shrink-0 font-bold text-rose-600">{money(row.due_balance)}</p>
                      </div>
                    );
                  }
                  // stock
                  const val = Number(row.qty_on_hand ?? 0) * Number(row.purchase_price ?? 0);
                  return (
                    <div key={row.id} className="flex items-center justify-between py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-bold text-slate-900">{row.products?.name ?? "পণ্য"}</p>
                        <p className="text-[11px] text-slate-500">
                          ব্যাচ: {row.batch_no ?? "—"} · মেয়াদ: {row.expiry_date ?? "—"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-bold text-slate-900">{Number(row.qty_on_hand ?? 0)} পিস</p>
                        <p className="text-[10px] text-[#0d5c46]">{money(val)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </PhoneCard>
        )}
      </div>

      {/* Printable Report Portal */}
      {typeof document !== "undefined" &&
        createPortal(
          <div id="register-close-print">
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
              {tenantName}
            </div>
            <div style={{ textAlign: "center", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              {t(activeMeta.key)}
            </div>
            <div style={{ textAlign: "center", fontSize: 11, marginBottom: 8 }}>
              {isDateReport ? `সময়কাল: ${dateLabel}` : `তারিখ: ${bdToday}`}
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />
            {reportType === "pnl" && k ? (
              <table style={{ width: "100%", fontSize: 12 }}>
                <tbody>
                  <tr><td>মোট বিক্রি</td><td style={{ textAlign: "right" }}>{money(k.todaySales)}</td></tr>
                  <tr><td>নগদ বিক্রি</td><td style={{ textAlign: "right" }}>{money(k.todayCashSale ?? 0)}</td></tr>
                  <tr><td>বাকি বিক্রি</td><td style={{ textAlign: "right" }}>{money(k.todayDueSale ?? 0)}</td></tr>
                  <tr><td>বাকি আদায়</td><td style={{ textAlign: "right" }}>{money(k.dueCollection)}</td></tr>
                  <tr><td>মোট খরচ</td><td style={{ textAlign: "right" }}>{money(k.todayExpense ?? 0)}</td></tr>
                  <tr><td>বিক্রি রিটার্ন</td><td style={{ textAlign: "right" }}>{money(k.todayReturn ?? 0)}</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>নিট লাভ</td><td style={{ textAlign: "right" }}>{money(k.todayProfit)}</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>দৈনিক হাতে ক্যাশ</td><td style={{ textAlign: "right" }}>{money(k.dailyCashInHand ?? 0)}</td></tr>
                  <tr><td>ইনভেন্টরি মূল্য</td><td style={{ textAlign: "right" }}>{money(k.inventoryValue)}</td></tr>
                </tbody>
              </table>
            ) : (
              <table style={{ width: "100%", fontSize: 11 }}>
                <tbody>
                  {(reportRows ?? []).map((row: any, idx: number) => {
                    if (reportType === "sales") {
                      return (
                        <tr key={row.id ?? idx}>
                          <td>{row.invoice_no} ({row.customers?.name ?? "সাধারণ"})</td>
                          <td style={{ textAlign: "right" }}>{money(row.total)}</td>
                        </tr>
                      );
                    }
                    if (reportType === "purchase") {
                      return (
                        <tr key={row.id ?? idx}>
                          <td>{row.po_number} ({row.suppliers?.name ?? "—"})</td>
                          <td style={{ textAlign: "right" }}>{money(row.total)}</td>
                        </tr>
                      );
                    }
                    if (reportType === "customer_due") {
                      return (
                        <tr key={row.customer_id ?? idx}>
                          <td>{row.name} ({row.phone ?? ""})</td>
                          <td style={{ textAlign: "right" }}>{money(row.net_due)}</td>
                        </tr>
                      );
                    }
                    if (reportType === "supplier_due") {
                      return (
                        <tr key={row.id ?? idx}>
                          <td>{row.name} ({row.phone ?? ""})</td>
                          <td style={{ textAlign: "right" }}>{money(row.due_balance)}</td>
                        </tr>
                      );
                    }
                    const val = Number(row.qty_on_hand ?? 0) * Number(row.purchase_price ?? 0);
                    return (
                      <tr key={row.id ?? idx}>
                        <td>{row.products?.name ?? "পণ্য"} ({Number(row.qty_on_hand ?? 0)} পিস)</td>
                        <td style={{ textAlign: "right" }}>{money(val)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>,
          document.body,
        )}
    </PhoneShell>
  );
}
