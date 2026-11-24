import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Receipt, TrendingDown, Loader2 } from "lucide-react";
import { listExpenses, createExpense, listAccounts } from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { toast } from "sonner";

export const Route = createFileRoute("/accounts/expenses")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Expenses — SohojPharma" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listExpenses);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenant_id: tenantId, limit: 200 } }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todayTotal = expenses.filter((e) => e.expense_date === today).reduce((s, e) => s + Number(e.amount), 0);
  const monthTotal = expenses.filter((e) => (e.expense_date ?? "").startsWith(month)).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      <PageHeader title={t("acct.expenses.title")} description={t("acct.expenses.desc")} actions={<ExpenseDialog tenantId={tenantId} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label={t("acct.expenses.todayExpense")} value={`৳ ${todayTotal.toLocaleString()}`} icon={Receipt} tone="warning" />
        <StatCard label={t("acct.common.thisMonth")} value={`৳ ${monthTotal.toLocaleString()}`} icon={TrendingDown} tone="warning" />
        <StatCard label={t("acct.common.entries")} value={String(expenses.length)} icon={Receipt} tone="secondary" />
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("acct.expenses.recentExpenses")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("acct.expenses.noExpenses")}</div>
          ) : (
            <>
              {/* Phone: cards */}
              <ul className="divide-y divide-border lg:hidden">
                {expenses.map((e) => {
                  const acc = (e as unknown as { chart_of_accounts: { code: string; name: string } | null }).chart_of_accounts;
                  return (
                    <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{acc ? acc.name : e.expense_no}</p>
                        <p className="truncate text-xs text-muted-foreground">{e.vendor ?? e.notes ?? "-"}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {e.expense_date} · <span className="capitalize">{e.payment_method}</span>
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-bold">৳ {Number(e.amount).toLocaleString()}</span>
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
                      <TableHead>{t("acct.common.account")}</TableHead>
                      <TableHead>{t("acct.expenses.vendorNotes")}</TableHead>
                      <TableHead>{t("acct.common.method")}</TableHead>
                      <TableHead className="text-right">{t("acct.common.amount")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((e) => {
                      const acc = (e as unknown as { chart_of_accounts: { code: string; name: string } | null }).chart_of_accounts;
                      return (
                        <TableRow key={e.id}>
                          <TableCell>{e.expense_date}</TableCell>
                          <TableCell className="font-mono text-xs">{e.expense_no}</TableCell>
                          <TableCell className="font-medium">{acc ? `${acc.code} · ${acc.name}` : "-"}</TableCell>
                          <TableCell className="text-muted-foreground">{e.vendor ?? e.notes ?? "-"}</TableCell>
                          <TableCell className="capitalize">{e.payment_method}</TableCell>
                          <TableCell className="text-right font-semibold">৳ {Number(e.amount).toLocaleString()}</TableCell>
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
    </>
  );
}

function ExpenseDialog({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    expense_no: `EXP-${Date.now().toString().slice(-6)}`,
    expense_date: new Date().toISOString().slice(0, 10),
    account_code: "6900",
    amount: 0,
    payment_method: "cash" as const,
    vendor: "",
    notes: "",
  });
  const listAccFn = useServerFn(listAccounts);
  const createFn = useServerFn(createExpense);
  const qc = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", tenantId, "expense"],
    enabled: !!tenantId && open,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "expense" } }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।");
      return createFn({ data: { tenant_id: tenantId, branch_id: branchId, ...form, amount: Number(form.amount) } });
    },
    onSuccess: () => {
      toast.success(t("acct.expenses.recorded"));
      qc.invalidateQueries({ queryKey: ["expenses", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!tenantId || !branchId}><Plus className="mr-1.5 h-4 w-4" /> {t("acct.expenses.newExpense")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("acct.expenses.addExpense")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("acct.expenses.expenseNo")}</Label><Input value={form.expense_no} onChange={(e) => setForm({ ...form, expense_no: e.target.value })} /></div>
            <div><Label>{t("acct.common.date")}</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("acct.common.amount")}</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div>
              <Label>{t("acct.expenses.paymentMethod")}</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v as typeof form.payment_method })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t("acct.paymentMethod.cash")}</SelectItem>
                  <SelectItem value="bank">{t("acct.paymentMethod.bank")}</SelectItem>
                  <SelectItem value="bkash">{t("acct.paymentMethod.bkash")}</SelectItem>
                  <SelectItem value="nagad">{t("acct.paymentMethod.nagad")}</SelectItem>
                  <SelectItem value="card">{t("acct.paymentMethod.card")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("acct.expenses.expenseAccount")}</Label>
            <Select value={form.account_code} onValueChange={(v) => setForm({ ...form, account_code: v })}>
              <SelectTrigger><SelectValue placeholder={t("acct.common.selectAccount")} /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>{t("acct.expenses.vendor")}</Label><Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
          <div><Label>{t("acct.common.notes")}</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!form.amount || !form.account_code || !branchId || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("acct.expenses.saveExpense")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
