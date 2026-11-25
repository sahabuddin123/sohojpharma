import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Minus, Plus, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { buildProductDisplayName } from "@/lib/product-display";
import {
  createPurchaseReturn,
  getReturnableLines,
  listPurchaseReturns,
  purchaseReturnKpis,
} from "@/lib/api/purchase-returns.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/purchase-returns")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "ক্রয় রিটার্ন — SohojPharma" },
      { name: "description", content: "মোবাইল থেকে সরবরাহকারীর কাছে ক্রয় রিটার্ন প্রসেস করুন।" },
    ],
  }),
  component: MobilePurchaseReturns,
});

type PoHit = {
  id: string;
  po_number: string;
  order_date: string;
  total: number;
  supplier_id: string;
  suppliers: { name: string | null; phone: string | null } | null;
};

function MobilePurchaseReturns() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();

  const kpisFn = useServerFn(purchaseReturnKpis);
  const listFn = useServerFn(listPurchaseReturns);
  const linesFn = useServerFn(getReturnableLines);
  const createFn = useServerFn(createPurchaseReturn);

  const [tab, setTab] = useState<"new" | "history">("new");
  const [q, setQ] = useState("");
  const [selectedPo, setSelectedPo] = useState<PoHit | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const { data: kpis } = useQuery({
    queryKey: ["m-pr-kpis", tenantId],
    enabled: !!tenantId,
    queryFn: () => kpisFn({ data: { tenantId } }),
  });

  const { data: pos = [], isLoading: posLoading } = useQuery({
    queryKey: ["m-pr-pos", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id,po_number,order_date,total,supplier_id,suppliers(name,phone)")
        .eq("tenant_id", tenantId)
        .eq("status", "received")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as PoHit[];
    },
  });

  const filteredPos = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return pos;
    return pos.filter(
      (p) =>
        p.po_number.toLowerCase().includes(term) ||
        (p.suppliers?.name?.toLowerCase().includes(term) ?? false),
    );
  }, [pos, q]);

  const { data: poData, isLoading: linesLoading } = useQuery({
    queryKey: ["m-pr-lines", selectedPo?.id],
    enabled: !!selectedPo?.id && !!tenantId,
    queryFn: () => linesFn({ data: { tenantId, poId: selectedPo!.id } }),
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ["m-pr-history", tenantId],
    enabled: !!tenantId && tab === "history",
    queryFn: () => listFn({ data: { tenantId } }),
  });

  useEffect(() => {
    if (selectedPo) {
      setReturnQty({});
      setReason("");
      setNotes("");
    }
  }, [selectedPo?.id]);

  const returnLines = poData?.lines ?? [];

  const totalReturnValue = useMemo(() => {
    let sum = 0;
    for (const l of returnLines) {
      const qty = returnQty[l.batch_id] || 0;
      if (qty > 0) sum += qty * Number(l.unit_cost || 0);
    }
    return Math.round(sum * 100) / 100;
  }, [returnLines, returnQty]);

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!selectedPo || !tenantId) throw new Error("ক্রয় অর্ডার নির্বাচন করুন");
      const chosen = returnLines
        .filter((l) => (returnQty[l.batch_id] || 0) > 0)
        .map((l) => ({
          batch_id: l.batch_id,
          product_id: l.product_id,
          qty: returnQty[l.batch_id],
          unit_cost: Number(l.unit_cost || 0),
          reason: reason.trim() || undefined,
        }));
      if (!chosen.length) throw new Error("রিটার্নের পরিমাণ দিন");

      return await createFn({
        data: {
          tenantId,
          branch_id: branchId || undefined,
          supplierId: selectedPo.supplier_id,
          poId: selectedPo.id,
          reason: reason.trim() || undefined,
          notes: notes.trim() || undefined,
          allowExpired: true,
          lines: chosen,
        },
      });
    },
    onSuccess: () => {
      toast.success("ক্রয় রিটার্ন সফলভাবে সম্পন্ন হয়েছে!");
      setSelectedPo(null);
      qc.invalidateQueries({ queryKey: ["m-pr-kpis", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-pr-history", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-pr-pos", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message || "রিটার্ন করা যায়নি"),
  });

  return (
    <PhoneShell title="ক্রয় রিটার্ন (Purchase Return)" back>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-xs">
          <p className="text-[11px] text-slate-500">আজকের রিটার্ন</p>
          <p className="mt-0.5 text-base font-extrabold text-[#0d5c46]">
            {money(kpis?.today ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-xs">
          <p className="text-[11px] text-slate-500">এই মাসের রিটার্ন</p>
          <p className="mt-0.5 text-base font-extrabold text-slate-900">
            {money(kpis?.month ?? 0)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="phone-grid-keep grid grid-cols-2 rounded-full bg-[#e9eeea] p-1">
        <button
          type="button"
          onClick={() => setTab("new")}
          className={cn(
            "rounded-full py-1.5 text-xs font-semibold transition",
            tab === "new" ? "bg-[#0d5c46] text-white shadow-xs" : "text-slate-600",
          )}
        >
          নতুন রিটার্ন
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={cn(
            "rounded-full py-1.5 text-xs font-semibold transition",
            tab === "history" ? "bg-[#0d5c46] text-white shadow-xs" : "text-slate-600",
          )}
        >
          রিটার্ন তালিকা
        </button>
      </div>

      {tab === "new" ? (
        <div className="mt-3 space-y-3 pb-24">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="PO নম্বর বা সরবরাহকারীর নাম খুঁজুন..."
              className="h-11 rounded-2xl border-slate-200 bg-white pl-9 text-sm shadow-xs"
            />
          </div>

          {posLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d5c46]" />
            </div>
          ) : filteredPos.length === 0 ? (
            <PhoneEmpty title="কোনো ক্রয় অর্ডার নেই" message="রিসিভ করা কোনো ক্রয় অর্ডার পাওয়া যায়নি" />
          ) : (
            filteredPos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPo(p)}
                className="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.03)] active:scale-[0.99] transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{p.po_number}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {p.suppliers?.name ?? "—"} · {new Date(p.order_date).toLocaleDateString("bn-BD")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-[#0d5c46]">{money(p.total)}</p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <RotateCcw className="h-3 w-3" /> রিটার্ন করুন
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2.5 pb-24">
          {histLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d5c46]" />
            </div>
          ) : history.length === 0 ? (
            <PhoneEmpty title="কোনো রিটার্ন নেই" message="এখনো কোনো ক্রয় রিটার্ন রেকর্ড হয়নি" />
          ) : (
            history.map((r: any) => (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{r.return_no}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {r.suppliers?.name ?? "—"} · {r.return_date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-amber-700">{money(r.total_value)}</p>
                    <p className="text-[10px] uppercase text-slate-500">{r.status}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Return Modal */}
      <Dialog open={!!selectedPo} onOpenChange={(o) => !o && setSelectedPo(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-3xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#0d5c46]">
              <RotateCcw className="h-5 w-5" />
              ক্রয় রিটার্ন: {selectedPo?.po_number}
            </DialogTitle>
          </DialogHeader>

          {linesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d5c46]" />
            </div>
          ) : returnLines.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">রিটার্নযোগ্য কোনো ব্যাচ পাওয়া যায়নি</p>
          ) : (
            <div className="space-y-3 py-1">
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {returnLines.map((l: any) => {
                  const maxRet = Math.max(0, Number(l.qty_available ?? 0));
                  const cur = returnQty[l.batch_id] || 0;
                  const name = l.product ? buildProductDisplayName(l.product) : "—";
                  return (
                    <div
                      key={l.batch_id}
                      className="rounded-xl border border-slate-200 p-2.5 text-xs space-y-2"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 break-words leading-snug">{name}</p>
                        <p className="text-[11px] text-slate-500">
                          ব্যাচ: {l.batch_no} · মেয়াদ: {l.expiry_date} · স্টক: {maxRet} · ৳{l.unit_cost}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] font-medium text-slate-500">রিটার্ন পরিমাণ</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 rounded-lg"
                            disabled={cur <= 0}
                            onClick={() =>
                              setReturnQty((prev) => ({ ...prev, [l.batch_id]: Math.max(0, cur - 1) }))
                            }
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min={0}
                            max={maxRet}
                            value={cur}
                            onChange={(e) => {
                              const v = Math.min(maxRet, Math.max(0, Number(e.target.value) || 0));
                              setReturnQty((prev) => ({ ...prev, [l.batch_id]: v }));
                            }}
                            className="h-7 w-12 px-1 text-center text-xs font-bold"
                          />
                          <Button
                            type="button"
                            size="icon"
                            className="h-7 w-7 rounded-lg bg-[#0d5c46] text-white"
                            disabled={cur >= maxRet}
                            onClick={() =>
                              setReturnQty((prev) => ({ ...prev, [l.batch_id]: Math.min(maxRet, cur + 1) }))
                            }
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
                <span className="text-xs font-semibold text-slate-700">মোট রিটার্ন মূল্য:</span>
                <span className="text-base font-extrabold text-amber-800">{money(totalReturnValue)}</span>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">রিটার্নের কারণ</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="যেমন: মেয়াদোত্তীর্ণ / ক্ষতিগ্রস্ত..."
                  className="h-10"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">নোট (ঐচ্ছিক)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="অতিরিক্ত নোট..."
                  className="h-10"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setSelectedPo(null)}>
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={() => submitMut.mutate()}
              disabled={submitMut.isPending || totalReturnValue <= 0}
              className="bg-[#0d5c46] hover:bg-[#094735] text-white"
            >
              {submitMut.isPending ? "প্রসেস হচ্ছে..." : "ক্রয় রিটার্ন সম্পন্ন করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
}
