import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Eye, Loader2, Pencil, PiggyBank, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useActiveBranch } from "@/hooks/use-active-branch";
import {
  createIncome,
  deleteIncome,
  listAccounts,
  listIncomes,
  updateIncome,
} from "@/lib/api/finance.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/income")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "আয় — SohojPharma" },
      { name: "description", content: "দৈনিক ও মাসিক অন্যান্য আয় যোগ, এডিট ও ট্র্যাক করুন।" },
    ],
  }),
  component: MobileIncome,
});

type DatePreset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";
type Method = "cash" | "bank" | "bkash" | "nagad" | "card";

type IncomeRow = {
  id: string;
  income_no: string;
  income_date: string;
  amount: number;
  payment_method: string;
  source: string | null;
  reference_no: string | null;
  notes: string | null;
  account_id: string;
  chart_of_accounts: { code: string; name: string } | null;
};

function methodLabel(m: string): string {
  const k = m.toLowerCase();
  if (k === "cash") return "নগদ";
  if (k === "bkash") return "বিকাশ";
  if (k === "nagad") return "নগদ অ্যাপ";
  if (k === "bank") return "ব্যাংক";
  if (k === "card") return "কার্ড";
  return m.toUpperCase();
}

function MobileIncome() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();

  const listFn = useServerFn(listIncomes);
  const listAccFn = useServerFn(listAccounts);
  const createFn = useServerFn(createIncome);
  const updateFn = useServerFn(updateIncome);
  const deleteFn = useServerFn(deleteIncome);

  const bdToday = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [preset, setPreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState(bdToday);
  const [customTo, setCustomTo] = useState(bdToday);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeRow | null>(null);
  const [viewTarget, setViewTarget] = useState<IncomeRow | null>(null);
  const [delTarget, setDelTarget] = useState<IncomeRow | null>(null);

  const [form, setForm] = useState({
    income_no: `INC-${Date.now().toString().slice(-6)}`,
    income_date: bdToday,
    account_code: "4100",
    amount: "",
    payment_method: "cash" as Method,
    source: "",
    notes: "",
  });

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
    if (preset === "all") return { from: "", to: "" };
    return { from: customFrom || bdToday, to: customTo || customFrom || bdToday };
  }, [preset, bdToday, customFrom, customTo]);

  const { data: incomes = [], isLoading, isFetching } = useQuery({
    queryKey: ["m-incomes", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: async () =>
      (await listFn({
        data: { tenant_id: tenantId, from: from || undefined, to: to || undefined, limit: 250 },
      })) as unknown as IncomeRow[],
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["m-income-accounts", tenantId],
    enabled: !!tenantId && formOpen,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "income" } }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return incomes;
    return incomes.filter(
      (r) =>
        (r.chart_of_accounts?.name?.toLowerCase().includes(q) ?? false) ||
        (r.source?.toLowerCase().includes(q) ?? false) ||
        (r.notes?.toLowerCase().includes(q) ?? false) ||
        (r.income_no?.toLowerCase().includes(q) ?? false),
    );
  }, [incomes, search]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [filtered],
  );

  const openNew = () => {
    setEditing(null);
    setForm({
      income_no: `INC-${Date.now().toString().slice(-6)}`,
      income_date: bdToday,
      account_code: accounts[0]?.code ?? "4100",
      amount: "",
      payment_method: "cash",
      source: "",
      notes: "",
    });
    setFormOpen(true);
  };

  const openEdit = (r: IncomeRow) => {
    setEditing(r);
    setForm({
      income_no: r.income_no,
      income_date: r.income_date,
      account_code: r.chart_of_accounts?.code ?? "4100",
      amount: String(Number(r.amount ?? 0)),
      payment_method: (r.payment_method as Method) || "cash",
      source: r.source ?? "",
      notes: r.notes ?? "",
    });
    setFormOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const amt = Number(form.amount);
      if (!amt || amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      const accCode = form.account_code || accounts[0]?.code || "4100";
      if (editing) {
        return await updateFn({
          data: {
            id: editing.id,
            tenant_id: tenantId,
            branch_id: branchId || undefined,
            income_no: form.income_no,
            income_date: form.income_date,
            account_code: accCode,
            amount: amt,
            payment_method: form.payment_method,
            source: form.source.trim() || undefined,
            notes: form.notes.trim() || undefined,
          },
        });
      }
      return await createFn({
        data: {
          tenant_id: tenantId,
          branch_id: branchId || undefined,
          income_no: form.income_no,
          income_date: form.income_date,
          account_code: accCode,
          amount: amt,
          payment_method: form.payment_method,
          source: form.source.trim() || undefined,
          notes: form.notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "আয় আপডেট হয়েছে" : "নতুন আয় যোগ হয়েছে");
      qc.invalidateQueries({ queryKey: ["m-incomes", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-home-kpi", tenantId] });
      qc.invalidateQueries({ queryKey: ["incomes"] });
      setFormOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "সেভ করা যায়নি"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { tenant_id: tenantId, id, branch_id: branchId || undefined } }),
    onSuccess: () => {
      toast.success("আয় মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["m-incomes", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-home-kpi", tenantId] });
      qc.invalidateQueries({ queryKey: ["incomes"] });
      setDelTarget(null);
    },
    onError: (e: Error) => toast.error(e.message || "মুছে ফেলা যায়নি"),
  });

  return (
    <PhoneShell title="আয় (অন্যান্য)" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="mint" accent="success" value={money(totalAmount)} label="মোট আয়" />
        <PhoneKpi tone="sky" value={filtered.length} label="মোট এন্ট্রি" />
      </PhoneKpiGrid>

      <button
        type="button"
        onClick={openNew}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d5c46] py-3 text-sm font-bold text-white shadow-xs hover:bg-[#094735] active:scale-[0.98] transition"
      >
        <Plus className="h-4 w-4" />
        নতুন আয় যোগ করুন
      </button>

      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <Calendar className="mr-0.5 h-3.5 w-3.5 shrink-0 text-[#0d5c46]" />
          {(
            [
              ["today", "আজ"],
              ["yesterday", "গতকাল"],
              ["7d", "৭ দিন"],
              ["month", "এই মাস"],
              ["all", "সব"],
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

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="আয়ের খাত, উৎস বা নম্বর খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>
      </div>

      <div className={cn("mt-3 space-y-2.5 transition-opacity", isFetching && "opacity-60")}>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && filtered.length === 0 && (
          <PhoneEmpty message="নির্বাচিত সময়ে কোনো আয় পাওয়া যায়নি" />
        )}
        {filtered.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[#0d5c46]">
                  <PiggyBank className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">
                    {r.chart_of_accounts?.name ?? "আয়"}
                  </p>
                  {(r.source || r.notes) && (
                    <p className="truncate text-xs text-slate-600">{r.source || r.notes}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span>{new Date(r.income_date).toLocaleDateString("en-GB")}</span>
                    <span>·</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {methodLabel(r.payment_method)}
                    </span>
                  </div>
                </div>
              </div>
              <p className="shrink-0 text-sm font-extrabold text-[#0d5c46]">{money(r.amount)}</p>
            </div>

            <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => setViewTarget(r)}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Eye className="h-3.5 w-3.5" /> দেখুন
              </button>
              <button
                type="button"
                onClick={() => openEdit(r)}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50/70 py-1.5 text-xs font-semibold text-[#0d5c46] hover:bg-emerald-100"
              >
                <Pencil className="h-3.5 w-3.5" /> এডিট
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
        ))}
      </div>

      {/* View Modal */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">আয় বিস্তারিত</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">নম্বর:</span>
                <span className="font-bold text-slate-900">{viewTarget.income_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">খাত:</span>
                <span className="font-bold">{viewTarget.chart_of_accounts?.name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">পরিমাণ:</span>
                <span className="font-extrabold text-[#0d5c46]">{money(viewTarget.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">মাধ্যম:</span>
                <span>{methodLabel(viewTarget.payment_method)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">তারিখ:</span>
                <span>{new Date(viewTarget.income_date).toLocaleDateString("en-GB")}</span>
              </div>
              {viewTarget.source && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">উৎস:</span>
                  <span className="text-right">{viewTarget.source}</span>
                </div>
              )}
              {viewTarget.notes && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">নোট:</span>
                  <span className="text-right text-slate-700">{viewTarget.notes}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewTarget(null)}>
              বন্ধ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing ? "আয় এডিট করুন" : "নতুন আয় যোগ করুন"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">আয়ের খাত *</Label>
              <Select
                value={form.account_code || accounts[0]?.code || "4100"}
                onValueChange={(v) => setForm((f) => ({ ...f, account_code: v }))}
              >
                <SelectTrigger className="h-10 rounded-xl text-xs">
                  <SelectValue placeholder="খাত নির্বাচন করুন" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a: { id: string; code: string; name: string }) => (
                    <SelectItem key={a.id} value={a.code}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  placeholder="0.00"
                  className="h-10 font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">তারিখ</Label>
                <Input
                  type="date"
                  value={form.income_date}
                  onChange={(e) => setForm((f) => ({ ...f, income_date: e.target.value }))}
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">পেমেন্ট মাধ্যম</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v as Method }))}
              >
                <SelectTrigger className="h-10 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">নগদ (Cash)</SelectItem>
                  <SelectItem value="bkash">বিকাশ (bKash)</SelectItem>
                  <SelectItem value="nagad">নগদ অ্যাপ (Nagad)</SelectItem>
                  <SelectItem value="bank">ব্যাংক (Bank)</SelectItem>
                  <SelectItem value="card">কার্ড (Card)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">উৎস (ঐচ্ছিক)</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="যেমন: মূলধন / কমিশন..."
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">নোট (ঐচ্ছিক)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="প্রয়োজনীয় নোট..."
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="bg-[#0d5c46] hover:bg-[#094735] text-white"
            >
              {saveMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {saveMut.isPending ? "সেভ হচ্ছে..." : "সেভ করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>আয় এন্ট্রি মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              {delTarget ? `${delTarget.chart_of_accounts?.name ?? "আয়"} (${money(delTarget.amount)}) স্থায়ীভাবে মুছে ফেলা হবে।` : ""}
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
