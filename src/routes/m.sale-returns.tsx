import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Minus, Plus, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { buildProductDisplayName } from "@/lib/product-display";
import { processSaleReturn } from "@/lib/api/sale-returns.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/sale-returns")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "বিক্রি রিটার্ন — SohojPharma" },
      { name: "description", content: "মোবাইল থেকে ইনভয়েস অনুযায়ী বিক্রি রিটার্ন ও রিফান্ড প্রসেস করুন।" },
    ],
  }),
  component: MobileSaleReturns,
});

type SaleHit = {
  id: string;
  invoice_no: string;
  sale_date: string;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
  customer?: { name: string; phone: string | null } | null;
};

type SaleItem = {
  id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  discount: number;
  vat: number;
  line_total: number;
  returned_qty: number;
  product?: {
    name: string;
    strength?: string | null;
    medicine_type?: string | null;
    volume?: string | null;
    pack_size?: number | null;
  } | null;
};

type ReturnRow = {
  id: string;
  return_no: string;
  return_date: string;
  total: number;
  refunded_amount: number;
  refund_method: string;
  reason: string | null;
  sale?: { invoice_no: string } | null;
};

function MobileSaleReturns() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const [tab, setTab] = useState<"new" | "history">("new");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedSale, setSelectedSale] = useState<SaleHit | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [returnDeduction, setReturnDeduction] = useState("");
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const processReturnFn = useServerFn(processSaleReturn);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { data: hits = [], isLoading: hitsLoading } = useQuery({
    queryKey: ["m-return-search", tenantId, debounced],
    enabled: !!tenantId,
    queryFn: async () => {
      let qb = supabase
        .from("sales")
        .select("id,invoice_no,sale_date,subtotal,discount,total,status,customer:customers(name,phone)")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .order("created_at", { ascending: false })
        .limit(40);
      if (debounced) qb = qb.ilike("invoice_no", `%${debounced}%`);
      const { data, error } = await qb;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SaleHit[];
    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["m-return-items", selectedSale?.id],
    enabled: !!selectedSale?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id,product_id,qty,unit_price,discount,vat,line_total,returned_qty,product:products(name,strength,medicine_type,volume,pack_size)")
        .eq("sale_id", selectedSale!.id);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SaleItem[];
    },
  });

  const { data: recentReturns = [], isLoading: returnsLoading } = useQuery({
    queryKey: ["m-recent-returns", tenantId],
    enabled: !!tenantId && tab === "history",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select("id,return_no,return_date,total,refunded_amount,refund_method,reason,sale:sales(invoice_no)")
        .eq("tenant_id", tenantId)
        .order("return_date", { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ReturnRow[];
    },
  });

  useEffect(() => {
    if (selectedSale) {
      setReturnQty({});
      setReturnDeduction("");
      setReason("");
      setRefundMethod("cash");
    }
  }, [selectedSale?.id]);

  const refundPreview = useMemo(() => {
    let sub = 0;
    let vat = 0;
    for (const it of items) {
      const qty = returnQty[it.id] || 0;
      if (!qty) continue;
      sub += it.unit_price * qty - (it.discount * qty) / (it.qty || 1);
      vat += (it.vat * qty) / (it.qty || 1);
    }
    const invDisc = Number(selectedSale?.discount ?? 0);
    const invSub = Number(selectedSale?.subtotal ?? 0);
    const invDiscShare =
      invDisc > 0 && invSub > 0
        ? Math.round(sub * Math.min(1, invDisc / invSub) * 100) / 100
        : 0;
    const extraDed = Math.max(0, Number(returnDeduction) || 0);
    const total = Math.max(0, Math.round((sub + vat - invDiscShare - extraDed) * 100) / 100);
    return { sub, vat, invDiscShare, extraDed, total };
  }, [items, returnQty, selectedSale, returnDeduction]);

  const doReturn = useMutation({
    mutationFn: async () => {
      if (!selectedSale) throw new Error("ইনভয়েস নির্বাচন করুন");
      const payload = Object.entries(returnQty)
        .filter(([, qty]) => qty > 0)
        .map(([sale_item_id, qty]) => ({ sale_item_id, qty }));
      if (!payload.length) throw new Error("রিটার্নের পরিমাণ দিন");

      return await processReturnFn({
        data: {
          tenantId,
          saleId: selectedSale.id,
          items: payload,
          reason: reason.trim() || undefined,
          refundMethod,
          refundAmount: refundPreview.total,
          clientOpId: crypto.randomUUID(),
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`রিটার্ন সম্পন্ন — ${res.return_no}`);
      setSelectedSale(null);
      qc.invalidateQueries({ queryKey: ["m-return-search", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-recent-returns", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-home-kpi", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message || "রিটার্ন করা যায়নি"),
  });

  return (
    <PhoneShell title="বিক্রি রিটার্ন (Sale Return)" back>
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
              placeholder="ইনভয়েস নম্বর দিয়ে খুঁজুন (যেমন: INVOICE-1000)..."
              className="h-11 rounded-2xl border-slate-200 bg-white pl-9 text-sm shadow-xs"
            />
          </div>

          {hitsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d5c46]" />
            </div>
          ) : hits.length === 0 ? (
            <PhoneEmpty title="কোনো ইনভয়েস নেই" message="রিটার্ন করার মতো কোনো ইনভয়েস পাওয়া যায়নি" />
          ) : (
            hits.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSale(s)}
                className="w-full rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left shadow-[0_1px_3px_rgba(0,0,0,0.03)] active:scale-[0.99] transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{s.invoice_no}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {s.customer?.name ?? "সাধারণ গ্রাহক"} · {new Date(s.sale_date).toLocaleDateString("bn-BD")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-[#0d5c46]">{money(s.total)}</p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
                      <Undo2 className="h-3 w-3" /> রিটার্ন করুন
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2.5 pb-24">
          {returnsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d5c46]" />
            </div>
          ) : recentReturns.length === 0 ? (
            <PhoneEmpty title="কোনো রিটার্ন নেই" message="এখনো কোনো বিক্রি রিটার্ন রেকর্ড হয়নি" />
          ) : (
            recentReturns.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{r.return_no}</p>
                    <p className="text-xs text-slate-500">
                      ইনভয়েস: {r.sale?.invoice_no ?? "—"} · {new Date(r.return_date).toLocaleDateString("bn-BD")}
                    </p>
                    {r.reason && <p className="text-[11px] text-slate-500 mt-0.5">{r.reason}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-rose-600">{money(r.refunded_amount)}</p>
                    <p className="text-[10px] uppercase text-slate-500">{r.refund_method}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Return Modal */}
      <Dialog open={!!selectedSale} onOpenChange={(o) => !o && setSelectedSale(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-3xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#0d5c46]">
              <Undo2 className="h-5 w-5" />
              রিটার্ন: {selectedSale?.invoice_no}
            </DialogTitle>
          </DialogHeader>

          {itemsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d5c46]" />
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">পণ্য নির্বাচন করুন</span>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, number> = {};
                    items.forEach((it) => {
                      next[it.id] = Math.max(0, it.qty - it.returned_qty);
                    });
                    setReturnQty(next);
                  }}
                  className="text-xs font-bold text-[#0d5c46] underline"
                >
                  সব রিটার্ন করুন
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {items.map((it) => {
                  const maxRet = Math.max(0, it.qty - it.returned_qty);
                  const cur = returnQty[it.id] || 0;
                  const name = it.product ? buildProductDisplayName(it.product) : "—";
                  return (
                    <div
                      key={it.id}
                      className="rounded-xl border border-slate-200 p-2.5 text-xs space-y-2"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 break-words leading-snug">{name}</p>
                        <p className="text-[11px] text-slate-500">
                          বিক্রি: {it.qty} · বাকি রিটার্নযোগ্য: {maxRet} · ৳{it.unit_price}
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
                              setReturnQty((prev) => ({ ...prev, [it.id]: Math.max(0, cur - 1) }))
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
                              setReturnQty((prev) => ({ ...prev, [it.id]: v }));
                            }}
                            className="h-7 w-12 px-1 text-center text-xs font-bold"
                          />
                          <Button
                            type="button"
                            size="icon"
                            className="h-7 w-7 rounded-lg bg-[#0d5c46] text-white"
                            disabled={cur >= maxRet}
                            onClick={() =>
                              setReturnQty((prev) => ({ ...prev, [it.id]: Math.min(maxRet, cur + 1) }))
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

              <div className="space-y-1">
                <Label className="text-xs">রিটার্ন বাদ / ডিসকাউন্ট (৳)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={returnDeduction}
                  onChange={(e) => setReturnDeduction(e.target.value)}
                  placeholder="0"
                  inputMode="decimal"
                  className="h-10"
                />
              </div>

              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 space-y-1 text-xs">
                {refundPreview.invDiscShare > 0 && (
                  <div className="flex justify-between text-amber-800">
                    <span>পূর্বের ইনভয়েস ডিসকাউন্ট সমন্বয়:</span>
                    <span>− {money(refundPreview.invDiscShare)}</span>
                  </div>
                )}
                {refundPreview.extraDed > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>রিটার্ন বাদ / ডিসকাউন্ট:</span>
                    <span>− {money(refundPreview.extraDed)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-0.5">
                  <span className="font-semibold text-slate-700">মোট রিফান্ড:</span>
                  <span className="text-base font-extrabold text-rose-600">{money(refundPreview.total)}</span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">রিফান্ড মাধ্যম</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">নগদ (Cash)</SelectItem>
                    <SelectItem value="bkash">বিকাশ (bKash)</SelectItem>
                    <SelectItem value="nagad">নগদ অ্যাপ (Nagad)</SelectItem>
                    <SelectItem value="bank">ব্যাংক (Bank)</SelectItem>
                    <SelectItem value="card">কার্ড (Card)</SelectItem>
                    <SelectItem value="store_credit">স্টোর ক্রেডিট</SelectItem>
                    <SelectItem value="due">বাকি সমন্বয় (Due Adjustment)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">রিটার্নের কারণ (ঐচ্ছিক)</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="যেমন: ভুল ওষুধ / মেয়াদ কাছাকাছি..."
                  className="h-10"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setSelectedSale(null)}>
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={() => doReturn.mutate()}
              disabled={doReturn.isPending || refundPreview.total <= 0}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {doReturn.isPending ? "প্রসেস হচ্ছে..." : "রিটার্ন সম্পন্ন করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
}
