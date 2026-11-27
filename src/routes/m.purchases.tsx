import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Calendar, Eye, Loader2, Pencil, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneCard,
  PhoneEmpty,
  PhoneKpi,
  PhoneKpiGrid,
  PhoneRow,
  money,
} from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { deletePurchaseOrder, getPurchaseOrder } from "@/lib/api/procurement.functions";
import { cachePurchases, getCachedPurchase, listCachedPurchases } from "@/lib/offline/db";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/purchases")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "ক্রয় রেকর্ড — SohojPharma" },
      { name: "description", content: "ক্রয় অর্ডার, তারিখ ফিল্টার, বিস্তারিত, এডিট ও ডিলিট।" },
      { property: "og:title", content: "ক্রয় রেকর্ড — SohojPharma" },
      { property: "og:description", content: "মোবাইল থেকে ক্রয় তালিকা দেখুন ও পরিচালনা করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobilePurchaseRecord,
});

type DatePreset = "today" | "yesterday" | "7d" | "30d" | "all" | "custom";

type PoRow = {
  id: string;
  po_number: string | null;
  status: string | null;
  order_date: string | null;
  total: number | null;
  created_at: string;
  pendingSync?: boolean;
  suppliers: { name: string | null } | null;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function statusBadge(status: string | null): { label: string; cls: string } {
  switch (status) {
    case "received":
      return { label: "রিসিভড", cls: "bg-emerald-50 text-[#0d5c46]" };
    case "partially_received":
      return { label: "আংশিক", cls: "bg-sky-50 text-sky-700" };
    case "approved":
      return { label: "অনুমোদিত", cls: "bg-indigo-50 text-indigo-700" };
    case "cancelled":
      return { label: "বাতিল", cls: "bg-slate-100 text-slate-600" };
    default:
      return { label: status ?? "পেন্ডিং", cls: "bg-amber-50 text-amber-700" };
  }
}

function MobilePurchaseRecord() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const loadPOFn = useServerFn(getPurchaseOrder);
  const deletePOFn = useServerFn(deletePurchaseOrder);

  const todayStr = toYmd(new Date());
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PoRow | null>(null);

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (preset === "today") return { from: todayStr, to: todayStr };
    if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toYmd(y);
      return { from: yStr, to: yStr };
    }
    if (preset === "7d") {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { from: toYmd(s), to: todayStr };
    }
    if (preset === "30d") {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { from: toYmd(s), to: todayStr };
    }
    if (preset === "all") return { from: "", to: "" };
    return { from: customFrom || todayStr, to: customTo || customFrom || todayStr };
  }, [preset, todayStr, customFrom, customTo]);

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ["m-purchases", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: async () => {
      const mapCached = (list: Awaited<ReturnType<typeof listCachedPurchases>>): PoRow[] =>
        list.map((c) => ({
          id: c.id,
          po_number: c.po_number,
          status: c.status,
          order_date: c.order_date,
          total: c.total,
          created_at: c.created_at,
          pendingSync: c.pendingSync,
          suppliers: c.supplier_name ? { name: c.supplier_name } : null,
        }));

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return mapCached(await listCachedPurchases(tenantId, { from, to }));
      }
      try {
        let q = supabase
          .from("purchase_orders")
          .select("id,po_number,status,order_date,total,created_at,suppliers(name)")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(300);
        if (from) q = q.gte("created_at", `${from}T00:00:00+06:00`);
        if (to) q = q.lte("created_at", `${to}T23:59:59.999+06:00`);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as unknown as PoRow[];
        void cachePurchases(
          tenantId,
          rows.map((po) => ({
            id: po.id,
            po_number: po.po_number ?? "",
            status: po.status ?? "draft",
            order_date: po.order_date ?? po.created_at,
            created_at: po.created_at,
            total: Number(po.total ?? 0),
            supplier_name: po.suppliers?.name ?? null,
            pendingSync: false,
          })),
        ).catch(() => {});

        const cachedAll = await listCachedPurchases(tenantId, { from, to }).catch(() => []);
        const pendingLocal = mapCached(cachedAll.filter((c) => c.pendingSync));
        const seen = new Set(rows.map((r) => r.id));
        return [...pendingLocal.filter((p) => !seen.has(p.id)), ...rows];
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return mapCached(await listCachedPurchases(tenantId, { from, to }));
        }
        throw err;
      }
    },
  });

  const { data: viewDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["m-purchase-view", tenantId, viewId],
    enabled: !!viewId,
    queryFn: async () => {
      const loadCachedDetail = async () => {
        const c = await getCachedPurchase(tenantId, viewId!);
        if (!c) return null;
        return {
          po: {
            po_number: c.po_number,
            status: c.status,
            order_date: c.order_date,
            created_at: c.created_at,
            total: c.total,
            notes: c.pendingSync ? "অফলাইনে সংরক্ষিত (সিঙ্ক বাকি)" : null,
            suppliers: c.supplier_name ? { name: c.supplier_name } : null,
          },
          items: (c.items ?? []).map((it, idx) => ({
            id: `${it.product_id}-${idx}`,
            qty_ordered: it.qty,
            qty_received: it.qty,
            unit_cost: it.unit_cost,
            discount: 0,
            products: { name: it.name },
          })),
        };
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await loadCachedDetail();
      }
      try {
        return await loadPOFn({ data: { id: viewId! } });
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await loadCachedDetail();
        }
        throw err;
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePOFn({ data: { id } }),
    onSuccess: () => {
      toast.success("ক্রয় অর্ডার মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["m-purchases", tenantId] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => {
      const msg = e.message || "";
      toast.error(
        msg.trimStart().startsWith("<") || /<!doctype\s+html/i.test(msg)
          ? "সার্ভার আপডেট হয়েছে — পেজ রিফ্রেশ করে আবার চেষ্টা করুন"
          : msg || "মুছে ফেলা যায়নি",
      );
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (p) =>
        (p.po_number?.toLowerCase().includes(q) ?? false) ||
        (p.suppliers?.name?.toLowerCase().includes(q) ?? false),
    );
  }, [data, search]);

  const stats = useMemo(() => {
    let total = 0, pending = 0, received = 0;
    for (const p of filtered) {
      const t = Number(p.total ?? 0);
      total += t;
      if (p.status === "received") received += t;
      else if (p.status !== "cancelled") pending += t;
    }
    return { total, pending, received };
  }, [filtered]);

  const detailPo = viewDetail?.po as
    | {
        po_number?: string;
        status?: string;
        order_date?: string;
        created_at?: string;
        total?: number;
        notes?: string | null;
        suppliers?: { name?: string | null } | null;
      }
    | undefined;
  const detailItems = (viewDetail?.items ?? []) as Array<{
    id: string;
    qty_ordered: number | string;
    qty_received?: number | string | null;
    unit_cost: number | string;
    discount?: number | string | null;
    products?: { name?: string | null } | null;
  }>;

  return (
    <PhoneShell title={t("m.purchases.title")} back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" value={money(stats.total)} label={t("m.home.newPurchase")} />
        <PhoneKpi tone="sky" accent="danger" value={money(stats.pending)} label={t("m.purchases.badgePending")} />
        <PhoneKpi tone="lilac" value={money(stats.received)} label={t("m.purchases.badgeReceived")} />
        <PhoneKpi tone="mint" value={filtered.length} label={t("m.purchases.title")} />
      </PhoneKpiGrid>

      {/* Date Filter + Search */}
      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <Calendar className="mr-0.5 h-3.5 w-3.5 shrink-0 text-[#0d5c46]" />
          {(
            [
              ["today", t("m.presets.today")],
              ["yesterday", t("m.presets.yesterday")],
              ["7d", t("m.presets.7d")],
              ["30d", t("m.presets.30d")],
              ["all", t("m.presets.all")],
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
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium text-slate-500">{t("m.presets.start")}</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || todayStr}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium text-slate-500">{t("m.presets.end")}</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={todayStr}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
              />
            </label>
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("m.purchases.searchPlaceholder")}
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>
      </div>

      <div className={cn("mt-3 space-y-3 transition-opacity", isFetching && "opacity-60")}>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">{t("m.common.loading")}</p>}
        {!isLoading && filtered.length === 0 && (
          <PhoneEmpty message="নির্বাচিত তারিখে কোনো ক্রয় পাওয়া যায়নি" />
        )}
        {filtered.map((p) => {
          const badge = statusBadge(p.status);
          const locked = ["received", "partially_received", "cancelled"].includes(p.status ?? "");
          return (
            <PhoneCard key={p.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="truncate font-bold text-[#0d5c46]">{p.po_number ?? p.id.slice(0, 8)}</p>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", badge.cls)}>
                    {badge.label}
                  </span>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {new Date(p.order_date ?? p.created_at).toLocaleDateString("en-GB")}
                </p>
              </div>
              <div className="mt-2 border-t border-border pt-2">
                <PhoneRow label="সরবরাহকারী" value={p.suppliers?.name ?? "—"} />
                <PhoneRow label="মোট বিল" value={money(p.total)} />
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
                <button
                  type="button"
                  onClick={() => setViewId(p.id)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Eye className="h-3.5 w-3.5" />
                  দেখুন
                </button>
                {!locked ? (
                  <>
                    <Link
                      to="/m/purchase/$id"
                      params={{ id: p.id }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/70 py-2 text-xs font-semibold text-[#0d5c46] hover:bg-emerald-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      এডিট
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(p)}
                      className="flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      মুছুন
                    </button>
                  </>
                ) : (
                  <Link
                    to={"/m/purchase-returns" as never}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-amber-200 bg-amber-50/70 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    রিটার্ন
                  </Link>
                )}
              </div>
            </PhoneCard>
          );
        })}
      </div>

      {/* View Purchase Details Modal */}
      <Dialog open={!!viewId} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              ক্রয় বিস্তারিত {detailPo?.po_number ? `· ${detailPo.po_number}` : ""}
            </DialogTitle>
          </DialogHeader>
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8 text-xs text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> লোড হচ্ছে...
            </div>
          ) : detailPo ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">সরবরাহকারী:</span>
                  <span className="font-bold text-slate-900">{detailPo.suppliers?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">তারিখ:</span>
                  <span>{new Date(detailPo.order_date ?? detailPo.created_at ?? Date.now()).toLocaleDateString("en-GB")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">অবস্থা:</span>
                  <span className="font-semibold">{statusBadge(detailPo.status ?? null).label}</span>
                </div>
                {detailPo.notes && (
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">নোট:</span>
                    <span className="text-right text-slate-700">{detailPo.notes}</span>
                  </div>
                )}
              </div>

              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {detailItems.map((it) => {
                  const qty = Number(it.qty_ordered ?? 0);
                  const cost = Number(it.unit_cost ?? 0);
                  const disc = Number(it.discount ?? 0);
                  const lineTotal = Math.max(0, qty * cost - disc);
                  return (
                    <div key={it.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="truncate font-semibold text-slate-900">{it.products?.name ?? "পণ্য"}</p>
                        <p className="text-[11px] text-slate-500">
                          {qty} × {money(cost)}
                          {disc > 0 ? ` (−${money(disc)})` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold text-[#0d5c46]">{money(lineTotal)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between rounded-xl bg-emerald-50/70 px-3 py-2.5 text-sm font-extrabold text-[#0d5c46]">
                <span>সর্বমোট বিল</span>
                <span>{money(detailPo.total ?? 0)}</span>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewId(null)}>
              বন্ধ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>ক্রয় অর্ডার মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.po_number ?? ""} স্থায়ীভাবে মুছে ফেলা হবে। এটি আর ফিরিয়ে আনা যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>না</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleteMut.isPending ? "মুছে ফেলা হচ্ছে..." : "হ্যাঁ, মুছুন"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PhoneShell>
  );
}
