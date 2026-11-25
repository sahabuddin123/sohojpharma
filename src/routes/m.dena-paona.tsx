import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpenCheck, Eye, Loader2, Phone, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useAuth } from "@/hooks/use-auth";
import {
  addDenaPaonaTransaction,
  createDenaPaonaEntry,
  deleteDenaPaona,
  getDenaPaonaDetails,
  getDenaPaonaList,
} from "@/lib/api/dena-paona.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/dena-paona")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "দেনা-পাওনা — SohojPharma" },
      { name: "description", content: "মোবাইলে দেনা-পাওনা ও ঋণের হিসাব রাখুন।" },
    ],
  }),
  component: MobileDenaPaona,
});

type LoanRow = {
  id: string;
  type: "give" | "take";
  person_name: string;
  phone: string;
  address: string | null;
  total_principal: number;
  remaining_due: number;
  transaction_date: string;
  repayment_date: string | null;
};

function MobileDenaPaona() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const listFn = useServerFn(getDenaPaonaList);
  const createFn = useServerFn(createDenaPaonaEntry);
  const detailsFn = useServerFn(getDenaPaonaDetails);
  const addTxnFn = useServerFn(addDenaPaonaTransaction);
  const delFn = useServerFn(deleteDenaPaona);

  const bdToday = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [tab, setTab] = useState<"all" | "give" | "take">("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<LoanRow | null>(null);

  const [form, setForm] = useState({
    type: "give" as "give" | "take",
    person_name: "",
    phone: "",
    address: "",
    amount: "",
    transaction_date: bdToday,
    repayment_date: "",
    witness_1: "",
    witness_2: "",
    reason: "",
  });

  const [txnForm, setTxnForm] = useState({
    actionType: "repayment" as "repayment" | "more",
    amount: "",
    description: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["m-dena-paona", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenantId } }),
  });

  const givingList = ((data as { givingList?: LoanRow[] } | undefined)?.givingList ?? []) as LoanRow[];
  const takingList = ((data as { takingList?: LoanRow[] } | undefined)?.takingList ?? []) as LoanRow[];
  const givingDue = Number((data as { givingSummary?: { totalDue?: number } } | undefined)?.givingSummary?.totalDue ?? 0);
  const takingDue = Number((data as { takingSummary?: { totalDue?: number } } | undefined)?.takingSummary?.totalDue ?? 0);

  const rows = useMemo(() => {
    const all = [...givingList, ...takingList];
    const q = search.trim().toLowerCase();
    return all.filter((r) => {
      if (tab !== "all" && r.type !== tab) return false;
      if (!q) return true;
      return (
        r.person_name.toLowerCase().includes(q) ||
        r.phone.toLowerCase().includes(q) ||
        (r.address?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [givingList, takingList, tab, search]);

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["m-dena-paona-detail", tenantId, viewId],
    enabled: !!tenantId && !!viewId,
    queryFn: () => detailsFn({ data: { tenantId, id: viewId! } }),
  });

  const createMut = useMutation({
    mutationFn: () => {
      const amt = Number(form.amount);
      if (!form.person_name.trim()) throw new Error("নাম দিন");
      if (!form.phone.trim()) throw new Error("ফোন নম্বর দিন");
      if (!amt || amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      return createFn({
        data: {
          tenantId,
          type: form.type,
          person_name: form.person_name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || undefined,
          amount: amt,
          transaction_date: form.transaction_date,
          repayment_date: form.repayment_date || undefined,
          witness_1: form.witness_1.trim() || "স্বয়ং",
          witness_2: form.witness_2.trim() || "প্রযোজ্য নয়",
          reason: form.reason.trim() || "ব্যক্তিগত লেনদেন",
        },
      });
    },
    onSuccess: () => {
      toast.success("নতুন দেনা-পাওনা এন্ট্রি যোগ হয়েছে!");
      qc.invalidateQueries({ queryKey: ["m-dena-paona", tenantId] });
      setCreateOpen(false);
      setForm({
        type: "give",
        person_name: "",
        phone: "",
        address: "",
        amount: "",
        transaction_date: bdToday,
        repayment_date: "",
        witness_1: "",
        witness_2: "",
        reason: "",
      });
    },
    onError: (e: Error) => toast.error(e.message || "সেভ করা যায়নি"),
  });

  const txnMut = useMutation({
    mutationFn: () => {
      const amt = Number(txnForm.amount);
      if (!viewId || !amt || amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      return addTxnFn({
        data: {
          tenantId,
          loanId: viewId,
          actionType: txnForm.actionType,
          amount: amt,
          description: txnForm.description.trim() || undefined,
          transactionDate: bdToday,
        },
      });
    },
    onSuccess: () => {
      toast.success("লেনদেন আপডেট হয়েছে!");
      qc.invalidateQueries({ queryKey: ["m-dena-paona", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-dena-paona-detail", tenantId, viewId] });
      setTxnForm({ actionType: "repayment", amount: "", description: "" });
    },
    onError: (e: Error) => toast.error(e.message || "আপডেট করা যায়নি"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { tenantId, id } }),
    onSuccess: () => {
      toast.success("এন্ট্রি মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["m-dena-paona", tenantId] });
      setDelTarget(null);
    },
    onError: (e: Error) => toast.error(e.message || "মুছে ফেলা যায়নি"),
  });

  const detailLoan = (detail as { loan?: LoanRow } | undefined)?.loan;
  const detailTxns = ((detail as { transactions?: Array<{ id: string; action_type: string; amount: number; transaction_date: string; description: string | null }> } | undefined)?.transactions ?? []);

  return (
    <PhoneShell title="দেনা-পাওনা" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="mint" accent="success" value={money(givingDue)} label="পাওনা বাকি (দিয়েছি)" />
        <PhoneKpi tone="rose" accent="danger" value={money(takingDue)} label="দেনা বাকি (নিয়েছি)" />
      </PhoneKpiGrid>

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d5c46] py-3 text-sm font-bold text-white shadow-xs hover:bg-[#094735] active:scale-[0.98] transition"
      >
        <Plus className="h-4 w-4" />
        নতুন দেনা-পাওনা যোগ করুন
      </button>

      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="নাম, ফোন বা ঠিকানা দিয়ে খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>
        <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
          {(
            [
              ["all", "সব"],
              ["give", `পাওনা (${givingList.length})`],
              ["take", `দেনা (${takingList.length})`],
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
      </div>

      <div className="mt-3 space-y-2.5">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && rows.length === 0 && (
          <PhoneEmpty message="কোনো দেনা-পাওনা পাওয়া যায়নি" />
        )}
        {rows.map((r) => {
          const isGive = r.type === "give";
          return (
            <div
              key={r.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                      isGive ? "bg-emerald-50 text-[#0d5c46]" : "bg-rose-50 text-rose-600",
                    )}
                  >
                    <BookOpenCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-900">{r.person_name}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="h-3 w-3" /> {r.phone}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold",
                      isGive ? "bg-emerald-50 text-[#0d5c46]" : "bg-rose-50 text-rose-600",
                    )}
                  >
                    {isGive ? "পাওনা (দিয়েছি)" : "দেনা (নিয়েছি)"}
                  </span>
                  <p className={cn("mt-1 text-sm font-extrabold", r.remaining_due > 0 ? "text-rose-600" : "text-[#0d5c46]")}>
                    বাকি: {money(r.remaining_due)}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => setViewId(r.id)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/70 py-1.5 text-xs font-semibold text-[#0d5c46] hover:bg-emerald-100"
                >
                  <Eye className="h-3.5 w-3.5" /> দেখুন ও পরিশোধ
                </button>
                <button
                  type="button"
                  onClick={() => setDelTarget(r)}
                  className="flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" /> মুছুন
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">নতুন দেনা-পাওনা</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="phone-grid-keep grid grid-cols-2 gap-2">
              {(
                [
                  ["give", "টাকা দিচ্ছি (পাওনা)"],
                  ["take", "টাকা নিচ্ছি (দেনা)"],
                ] as const
              ).map(([tKey, tLabel]) => (
                <button
                  key={tKey}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: tKey }))}
                  className={cn(
                    "rounded-xl border py-2 text-xs font-bold transition",
                    form.type === tKey
                      ? "border-[#0d5c46] bg-[#0d5c46] text-white"
                      : "border-slate-200 bg-white text-slate-700",
                  )}
                >
                  {tLabel}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">নাম *</Label>
                <Input
                  value={form.person_name}
                  onChange={(e) => setForm((f) => ({ ...f, person_name: e.target.value }))}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ফোন *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="h-10"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">টাকার পরিমাণ *</Label>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="h-10 font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">তারিখ</Label>
                <Input
                  type="date"
                  value={form.transaction_date}
                  onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ঠিকানা (ঐচ্ছিক)</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">সাক্ষী ১ (ঐচ্ছিক)</Label>
                <Input
                  value={form.witness_1}
                  onChange={(e) => setForm((f) => ({ ...f, witness_1: e.target.value }))}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">সাক্ষী ২ (ঐচ্ছিক)</Label>
                <Input
                  value={form.witness_2}
                  onChange={(e) => setForm((f) => ({ ...f, witness_2: e.target.value }))}
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">কারণ / নোট (ঐচ্ছিক)</Label>
              <Textarea
                rows={2}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="bg-[#0d5c46] hover:bg-[#094735] text-white"
            >
              {createMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              সেভ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details & Repayment Modal */}
      <Dialog open={!!viewId} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detailLoan?.person_name ?? "দেনা-পাওনা বিস্তারিত"}
            </DialogTitle>
          </DialogHeader>
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8 text-xs text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> লোড হচ্ছে...
            </div>
          ) : detailLoan ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">মূল টাকা:</span>
                  <span className="font-bold">{money(detailLoan.total_principal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">বর্তমান বাকি:</span>
                  <span className="font-extrabold text-rose-600">{money(detailLoan.remaining_due)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3 space-y-2">
                <p className="text-xs font-bold text-slate-800">নতুন কিস্তি / পরিশোধ যোগ</p>
                <div className="phone-grid-keep grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTxnForm((f) => ({ ...f, actionType: "repayment" }))}
                    className={cn(
                      "rounded-lg border py-1.5 text-xs font-semibold",
                      txnForm.actionType === "repayment"
                        ? "border-[#0d5c46] bg-[#0d5c46] text-white"
                        : "border-slate-200 text-slate-600",
                    )}
                  >
                    পরিশোধ
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxnForm((f) => ({ ...f, actionType: "more" }))}
                    className={cn(
                      "rounded-lg border py-1.5 text-xs font-semibold",
                      txnForm.actionType === "more"
                        ? "border-[#0d5c46] bg-[#0d5c46] text-white"
                        : "border-slate-200 text-slate-600",
                    )}
                  >
                    আরও যোগ
                  </button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={txnForm.amount}
                  onChange={(e) => setTxnForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="টাকার পরিমাণ..."
                  className="h-10 font-bold"
                />
                <Input
                  value={txnForm.description}
                  onChange={(e) => setTxnForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="নোট (ঐচ্ছিক)..."
                  className="h-9 text-xs"
                />
                <Button
                  type="button"
                  onClick={() => txnMut.mutate()}
                  disabled={txnMut.isPending}
                  className="w-full h-9 bg-[#0d5c46] hover:bg-[#094735] text-white text-xs font-bold"
                >
                  {txnMut.isPending ? "সেভ হচ্ছে..." : "লেনদেন যোগ করুন"}
                </Button>
              </div>

              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {detailTxns.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <div>
                      <p className="font-semibold">{tx.action_type === "repayment" ? "পরিশোধ" : "গ্রহণ/প্রদান"}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(tx.transaction_date).toLocaleDateString("en-GB")}
                        {tx.description ? ` · ${tx.description}` : ""}
                      </p>
                    </div>
                    <span className="font-bold text-[#0d5c46]">{money(tx.amount)}</span>
                  </div>
                ))}
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
      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>এন্ট্রি মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              "{delTarget?.person_name}"-এর দেনা-পাওনা হিসাব স্থায়ীভাবে মুছে ফেলা হবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>না</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => delTarget && delMut.mutate(delTarget.id)}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              হ্যাঁ, মুছুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PhoneShell>
  );
}
