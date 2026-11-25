import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Loader2, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";
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
  createExpense,
  deleteExpense,
  listAccounts,
  listExpenses,
  updateExpense,
} from "@/lib/api/finance.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/expenses")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "খরচ — SohojPharma" },
      { name: "description", content: "দৈনিক ও মাসিক খরচ যোগ, এডিট ও ট্র্যাক করুন।" },
    ],
  }),
  component: MobileExpenses,
});

type DatePreset = "today" | "yesterday" | "7d" | "month" | "all" | "custom";
type Method = "cash" | "bank" | "bkash" | "nagad" | "card";

type ExpenseRow = {
  id: string;
  expense_no: string;
  expense_date: string;
  amount: number;
  payment_method: string;
  vendor: string | null;
  reference_no: string | null;
  notes: string | null;
  account_id: string;
  chart_of_accounts: { code: string; name: string } | null;
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function methodLabel(m: string): string {
  const k = m.toLowerCase();
  if (k === "cash") return "নগদ";
  if (k === "bkash") return "বিকাশ";
  if (k === "nagad") return "নগদ অ্যাপ";
  if (k === "bank") return "ব্যাংক";
  if (k === "card") return "কার্ড";
  return m.toUpperCase();
}

function MobileExpenses() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();

  const listFn = useServerFn(listExpenses);
  const listAccFn = useServerFn(listAccounts);
  const createFn = useServerFn(createExpense);
  const updateFn = useServerFn(updateExpense);
  const deleteFn = useServerFn(deleteExpense);

  const bdToday = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [preset, setPreset] = useState<DatePreset>("month");
  const [customFrom, setCustomFrom] = useState(bdToday);
  const [customTo, setCustomTo] = useState(bdToday);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [delTarget, setDelTarget] = useState<ExpenseRow | null>(null);

  const [form, setForm] = useState({
    expense_no: `EXP-${Date.now().toString().slice(-6)}`,
    expense_date: bdToday,
    account_code: "",
    amount: "",
    payment_method: "cash" as Method,
    vendor: "",
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

  const { data: expenses = [], isLoading, isFetching } = useQuery({
    queryKey: ["m-expenses", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: async () =>
      (await listFn({
        data: { tenant_id: tenantId, from: from || undefined, to: to || undefined, limit: 250 },
      })) as unknown as ExpenseRow[],
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["m-expense-accounts", tenantId],
    enabled: !!tenantId && formOpen,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "expense" } }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter(
      (e) =>
        (e.chart_of_accounts?.name?.toLowerCase().includes(q) ?? false) ||
        (e.notes?.toLowerCase().includes(q) ?? false) ||
        (e.vendor?.toLowerCase().includes(q) ?? false) ||
        (e.expense_no?.toLowerCase().includes(q) ?? false),
    );
  }, [expenses, search]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    [filtered],
  );

  const openNew = () => {
    setEditing(null);
    setForm({
      expense_no: `EXP-${Date.now().toString().slice(-6)}`,
      expense_date: bdToday,
      account_code: accounts[0]?.code ?? "",
      amount: "",
      payment_method: "cash",
      vendor: "",
      notes: "",
    });
    setFormOpen(true);
  };

  const openEdit = (r: ExpenseRow) => {
    setEditing(r);
    setForm({
      expense_no: r.expense_no,
      expense_date: r.expense_date,
      account_code: r.chart_of_accounts?.code ?? "",
      amount: String(Number(r.amount ?? 0)),
      payment_method: (r.payment_method as Method) || "cash",
      vendor: r.vendor ?? "",
      notes: r.notes ?? "",
    });
    setFormOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const amt = Number(form.amount);
      if (!amt || amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      const accCode = form.account_code || accounts[0]?.code;
      if (!accCode) throw new Error("খরচের খাত নির্বাচন করুন");
      if (editing) {
        return await updateFn({
          data: {
            id: editing.id,
            tenant_id: tenantId,
            branch_id: branchId || undefined,
            expense_no: form.expense_no,
            expense_date: form.expense_date,
            account_code: accCode,
            amount: amt,
            payment_method: form.payment_method,
            vendor: form.vendor.trim() || undefined,
            notes: form.notes.trim() || undefined,
          },
        });
      }
      return await createFn({
        data: {
          tenant_id: tenantId,
          branch_id: branchId || undefined,
          expense_no: form.expense_no,
          expense_date: form.expense_date,
          account_code: accCode,
          amount: amt,
          payment_method: form.payment_method,
          vendor: form.vendor.trim() || undefined,
          notes: form.notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "খরচ আপডেট হয়েছে" : "নতুন খরচ যোগ হয়েছে");
      qc.invalidateQueries({ queryKey: ["m-expenses", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-home-kpi", tenantId] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setFormOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "সেভ করা যায়নি"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { tenant_id: tenantId, id, branch_id: branchId || undefined } }),
    onSuccess: () => {
      toast.success("খরচ মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["m-expenses", tenantId] });
      qc.invalidateQueries({ queryKey: ["m-home-kpi", tenantId] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      setDelTarget(null);
    },
    onError: (e: Error) => toast.error(e.message || "মুছে ফেলা যায়নি"),
  });

  return (
    <PhoneShell title="খরচ (ব্যয়)" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="rose" accent="danger" value={money(totalAmount)} label="মোট খরচ" />
        <PhoneKpi tone="sky" value={filtered.length} label="মোট এন্ট্রি" />
      </PhoneKpiGrid>

      <button
        type="button"
        onClick={openNew}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d5c46] py-3 text-sm font-bold text-white shadow-xs hover:bg-[#094735] active:scale-[0.98] transition"
      >
        <Plus className="h-4 w-4" />
        নতুন খরচ যোগ করুন
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
            placeholder="খরচের খাত, নোট বা নম্বর খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>
      </div>

      <div className={cn("mt-3 space-y-2.5 transition-opacity", isFetching && "opacity-60")}>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && filtered.length === 0 && (
          <PhoneEmpty message="নির্বাচিত সময়ে কোনো খরচ পাওয়া যায়নি" />
        )}
        {filtered.map((r) => (
          <div
            key={r.id}
            className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">
                    {r.chart_of_accounts?.name ?? "খরচ"}
                  </p>
                  {(r.notes || r.vendor) && (
                    <p className="truncate text-xs text-slate-600">{r.notes || r.vendor}</p>
                  )}
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span>{new Date(r.expense_date).toLocaleDateString("en-GB")}</span>
                    <span>·</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {methodLabel(r.payment_method)}
                    </span>
                  </div>
                </div>
              </div>
              <p className="shrink-0 text-sm font-extrabold text-rose-600">{money(r.amount)}</p>
            </div>
            <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => openEdit(r)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Pencil className="h-3.5 w-3.5" /> এডিট
              </button>
              <button
                type="button"
                onClick={() => setDelTarget(r)}
                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" /> মুছুন
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Expense Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing ? "খরচ এডিট করুন" : "নতুন খরচ যোগ করুন"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">খরচের খাত *</Label>
              <Select
                value={form.account_code || accounts[0]?.code || ""}
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
                  value={form.expense_date}
                  onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
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
              <Label className="text-xs">নোট / বিবরণ (ঐচ্ছিক)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="যেমন: দোকান ভাড়া / বিদ্যুৎ বিল..."
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
            <AlertDialogTitle>খরচ মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              {delTarget ? `${delTarget.chart_of_accounts?.name ?? "খরচ"} (${money(delTarget.amount)}) স্থায়ীভাবে মুছে ফেলা হবে।` : ""}
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
