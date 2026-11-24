import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowDownCircle, TrendingUp, Loader2, Pencil, Trash2, Check, X } from "lucide-react";
import { listIncomes, createIncome, updateIncome, deleteIncome, listAccounts, upsertAccount } from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { toast } from "sonner";

export const Route = createFileRoute("/accounts/income")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Income — SohojPharma" }] }),
  component: IncomePage,
});

type IncomeRow = {
  id: string;
  income_no: string;
  income_date: string;
  amount: number | string;
  payment_method: "cash" | "bank" | "bkash" | "nagad" | "rocket" | "card" | "cheque" | "adjustment";
  source: string | null;
  reference_no: string | null;
  notes: string | null;
  account_id: string;
  chart_of_accounts: { code: string; name: string } | null;
};

const defaultAccountForMethod = (method: string) => {
  switch (method) {
    case "bank": return "1010";
    case "bkash": return "1020";
    case "nagad": return "1030";
    case "rocket": return "1040";
    case "card": return "1050";
    default: return "1000";
  }
};

function IncomePage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listIncomes);
  const deleteFn = useServerFn(deleteIncome);
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeRow | null>(null);

  const { data: incomes = [], isLoading } = useQuery({
    queryKey: ["incomes", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenant_id: tenantId, limit: 200 } }),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { tenant_id: tenantId, branch_id: branchId ?? undefined, id } }),
    onSuccess: () => {
      toast.success("আয় মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["incomes", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (r: IncomeRow) => {
    if (!window.confirm(`"${r.income_no}" (৳ ${Number(r.amount).toLocaleString()}) মুছে ফেলতে চান?`)) return;
    delMutation.mutate(r.id);
  };

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (r: IncomeRow) => {
    setEditing(r);
    setDialogOpen(true);
  };

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const typedIncomes = incomes as unknown as IncomeRow[];
  const todayTotal = typedIncomes.filter((e) => e.income_date === today).reduce((s, e) => s + Number(e.amount), 0);
  const monthTotal = typedIncomes.filter((e) => (e.income_date ?? "").startsWith(month)).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      <PageHeader
        title={t("acct.income.title")}
        description={t("acct.income.desc")}
        actions={
          <Button disabled={!tenantId || !branchId} onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> {t("acct.income.newIncome")}
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label={t("acct.common.today")} value={`৳ ${todayTotal.toLocaleString()}`} icon={ArrowDownCircle} tone="success" />
        <StatCard label={t("acct.common.thisMonth")} value={`৳ ${monthTotal.toLocaleString()}`} icon={TrendingUp} tone="success" />
        <StatCard label={t("acct.common.entries")} value={String(typedIncomes.length)} icon={ArrowDownCircle} tone="primary" />
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("acct.income.incomeEntries")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}
            </div>
          ) : typedIncomes.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("acct.income.noIncome")}</div>
          ) : (
            <>
              {/* Phone: cards */}
              <ul className="divide-y divide-border lg:hidden">
                {typedIncomes.map((r) => {
                  const acc = r.chart_of_accounts;
                  return (
                    <li key={r.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{acc ? acc.name : r.income_no}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.source || r.notes || "-"}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {r.income_date} · <span className="capitalize">{r.payment_method}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="mr-1 text-sm font-bold text-success">৳ {Number(r.amount).toLocaleString()}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)} title="এডিট">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r)} disabled={delMutation.isPending} title="ডিলিট">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {/* Desktop: table */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("acct.common.date")}</TableHead>
                      <TableHead>{t("acct.common.no")}</TableHead>
                      <TableHead>আয়ের খাত</TableHead>
                      <TableHead>প্রদানকারী / উৎস</TableHead>
                      <TableHead>{t("acct.common.method")}</TableHead>
                      <TableHead className="text-right">{t("acct.common.amount")}</TableHead>
                      <TableHead className="text-right">অ্যাকশন</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typedIncomes.map((r) => {
                      const acc = r.chart_of_accounts;
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{r.income_date}</TableCell>
                          <TableCell className="font-mono text-xs">{r.income_no}</TableCell>
                          <TableCell className="font-medium">{acc ? `${acc.code} · ${acc.name}` : "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{r.source || r.notes || "-"}</TableCell>
                          <TableCell className="capitalize">{r.payment_method}</TableCell>
                          <TableCell className="text-right font-semibold text-success">৳ {Number(r.amount).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} title="এডিট">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(r)} disabled={delMutation.isPending} title="ডিলিট">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <IncomeDialog
        tenantId={tenantId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </>
  );
}

function IncomeDialog({
  tenantId,
  open,
  onOpenChange,
  editing,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: IncomeRow | null;
}) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    income_no: `INC-${Date.now().toString().slice(-6)}`,
    income_date: new Date().toISOString().slice(0, 10),
    account_code: "4100",
    payment_account_code: "1000",
    amount: 0,
    payment_method: "cash" as "cash" | "bank" | "bkash" | "nagad" | "rocket" | "card",
    source: "",
    notes: "",
  });

  const [addingHead, setAddingHead] = useState(false);
  const [newHeadName, setNewHeadName] = useState("");

  useEffect(() => {
    if (!open) {
      setAddingHead(false);
      setNewHeadName("");
      return;
    }
    if (editing) {
      const m = (editing.payment_method || "cash") as typeof form.payment_method;
      setForm({
        income_no: editing.income_no,
        income_date: editing.income_date,
        account_code: editing.chart_of_accounts?.code ?? "4100",
        payment_account_code: defaultAccountForMethod(m),
        amount: Number(editing.amount),
        payment_method: m,
        source: editing.source ?? "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm({
        income_no: `INC-${Date.now().toString().slice(-6)}`,
        income_date: new Date().toISOString().slice(0, 10),
        account_code: "4100",
        payment_account_code: "1000",
        amount: 0,
        payment_method: "cash",
        source: "",
        notes: "",
      });
    }
  }, [open, editing]);

  const listAccFn = useServerFn(listAccounts);
  const upsertAccFn = useServerFn(upsertAccount);
  const createFn = useServerFn(createIncome);
  const updateFn = useServerFn(updateIncome);

  const { data: incomeAccounts = [] } = useQuery({
    queryKey: ["accounts", tenantId, "income"],
    enabled: !!tenantId && open,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "income" } }),
  });

  const { data: assetAccounts = [] } = useQuery({
    queryKey: ["accounts", tenantId, "asset"],
    enabled: !!tenantId && open,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "asset" } }),
  });

  const paymentAccounts = useMemo(() => {
    const filtered = assetAccounts.filter((a) => a.code.startsWith("10"));
    return filtered.length > 0 ? filtered : assetAccounts;
  }, [assetAccounts]);

  const addHeadMutation = useMutation({
    mutationFn: async () => {
      const name = newHeadName.trim();
      if (!name) throw new Error("খাতের নাম লিখুন");
      const existingNums = incomeAccounts
        .map((a) => parseInt(a.code, 10))
        .filter((n) => !Number.isNaN(n) && n >= 4000 && n < 5000);
      const nextCode = String(existingNums.length > 0 ? Math.max(...existingNums) + 1 : 4101);
      return upsertAccFn({
        data: {
          tenant_id: tenantId,
          code: nextCode,
          name,
          type: "income",
          is_active: true,
        },
      });
    },
    onSuccess: (created) => {
      toast.success("নতুন আয়ের খাত যোগ হয়েছে");
      qc.invalidateQueries({ queryKey: ["accounts", tenantId, "income"] });
      if (created?.code) {
        setForm((prev) => ({ ...prev, account_code: created.code }));
      }
      setNewHeadName("");
      setAddingHead(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।");
      const payload = {
        tenant_id: tenantId,
        branch_id: branchId,
        income_no: form.income_no,
        income_date: form.income_date,
        account_code: form.account_code,
        payment_account_code: form.payment_account_code,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        source: form.source.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        return updateFn({ data: { ...payload, id: editing.id } });
      }
      return createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(editing ? "আয় আপডেট হয়েছে" : t("acct.income.recorded"));
      qc.invalidateQueries({ queryKey: ["incomes", tenantId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const labelForPaymentAcc = (a: { code: string; name: string }) => {
    if (a.code === "1000") return `${a.code} · দোকানের ক্যাশ (${a.name})`;
    if (a.code === "1010") return `${a.code} · ব্যাংক (${a.name})`;
    if (a.code === "1020") return `${a.code} · বিকাশ (${a.name})`;
    if (a.code === "1030") return `${a.code} · নগদ (${a.name})`;
    return `${a.code} · ${a.name}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "আয় এডিট করুন" : t("acct.income.addIncome")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("acct.common.no")}</Label><Input value={form.income_no} onChange={(e) => setForm({ ...form, income_no: e.target.value })} /></div>
            <div><Label>{t("acct.common.date")}</Label><Input type="date" value={form.income_date} onChange={(e) => setForm({ ...form, income_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("acct.common.amount")}</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div>
              <Label>{t("acct.common.method")}</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) => {
                  const m = v as typeof form.payment_method;
                  setForm({ ...form, payment_method: m, payment_account_code: defaultAccountForMethod(m) });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("acct.paymentMethod.cash")}</SelectItem>
                  <SelectItem value="bank">{t("acct.paymentMethod.bank")}</SelectItem>
                  <SelectItem value="bkash">{t("acct.paymentMethod.bkash")}</SelectItem>
                  <SelectItem value="nagad">{t("acct.paymentMethod.nagad")}</SelectItem>
                  <SelectItem value="rocket">রকেট</SelectItem>
                  <SelectItem value="card">{t("acct.paymentMethod.card")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>আয়ের খাত</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setAddingHead((v) => !v)}
              >
                <Plus className="mr-1 h-3 w-3" /> নতুন খাত যোগ
              </Button>
            </div>
            {addingHead && (
              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-border bg-muted/40 p-2">
                <Input
                  placeholder="নতুন আয়ের খাতের নাম লিখুন"
                  value={newHeadName}
                  onChange={(e) => setNewHeadName(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={!newHeadName.trim() || addHeadMutation.isPending}
                  onClick={() => addHeadMutation.mutate()}
                  title="সংরক্ষণ"
                >
                  {addHeadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => { setAddingHead(false); setNewHeadName(""); }}
                  title="বাতিল"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <Select value={form.account_code} onValueChange={(v) => setForm({ ...form, account_code: v })}>
              <SelectTrigger><SelectValue placeholder="আয়ের খাত নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {incomeAccounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>প্রদানকারী / উৎস</Label>
            <Input
              placeholder="যিনি বা যেখান থেকে টাকা এসেছে"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </div>

          <div>
            <Label>অ্যাকাউন্ট (টাকা কোন অ্যাকাউন্টে জমা হয়েছে)</Label>
            <Select value={form.payment_account_code} onValueChange={(v) => setForm({ ...form, payment_account_code: v })}>
              <SelectTrigger><SelectValue placeholder="অ্যাকাউন্ট নির্বাচন করুন" /></SelectTrigger>
              <SelectContent>
                {paymentAccounts.map((a) => (
                  <SelectItem key={a.code} value={a.code}>{labelForPaymentAcc(a)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div><Label>{t("acct.common.notes")}</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!form.amount || !form.account_code || !branchId || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "আপডেট করুন" : t("acct.income.saveIncome")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
