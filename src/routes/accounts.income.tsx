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
import { Plus, ArrowDownCircle, TrendingUp, Loader2 } from "lucide-react";
import { listIncomes, createIncome, listAccounts } from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { toast } from "sonner";

export const Route = createFileRoute("/accounts/income")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Income — SohojPharma" }] }),
  component: IncomePage,
});

function IncomePage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listIncomes);

  const { data: incomes = [], isLoading } = useQuery({
    queryKey: ["incomes", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenant_id: tenantId, limit: 200 } }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todayTotal = incomes.filter((e) => e.income_date === today).reduce((s, e) => s + Number(e.amount), 0);
  const monthTotal = incomes.filter((e) => (e.income_date ?? "").startsWith(month)).reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      <PageHeader title={t("acct.income.title")} description={t("acct.income.desc")} actions={<IncomeDialog tenantId={tenantId} />} />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("acct.common.today")} value={`৳ ${todayTotal.toLocaleString()}`} icon={ArrowDownCircle} tone="success" />
        <StatCard label={t("acct.common.thisMonth")} value={`৳ ${monthTotal.toLocaleString()}`} icon={TrendingUp} tone="success" />
        <StatCard label={t("acct.common.entries")} value={String(incomes.length)} icon={ArrowDownCircle} tone="primary" />
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("acct.income.incomeEntries")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}
            </div>
          ) : incomes.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("acct.income.noIncome")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("acct.common.date")}</TableHead>
                  <TableHead>{t("acct.common.no")}</TableHead>
                  <TableHead>{t("acct.common.account")}</TableHead>
                  <TableHead>{t("acct.common.source")}</TableHead>
                  <TableHead>{t("acct.common.method")}</TableHead>
                  <TableHead className="text-right">{t("acct.common.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomes.map((r) => {
                  const acc = (r as unknown as { chart_of_accounts: { code: string; name: string } | null }).chart_of_accounts;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.income_date}</TableCell>
                      <TableCell className="font-mono text-xs">{r.income_no}</TableCell>
                      <TableCell className="font-medium">{acc ? `${acc.code} · ${acc.name}` : "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.source ?? r.notes ?? "-"}</TableCell>
                      <TableCell className="capitalize">{r.payment_method}</TableCell>
                      <TableCell className="text-right font-semibold text-success">৳ {Number(r.amount).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function IncomeDialog({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    income_no: `INC-${Date.now().toString().slice(-6)}`,
    income_date: new Date().toISOString().slice(0, 10),
    account_code: "4100",
    amount: 0,
    payment_method: "cash" as const,
    source: "",
    notes: "",
  });
  const listAccFn = useServerFn(listAccounts);
  const createFn = useServerFn(createIncome);
  const qc = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", tenantId, "income"],
    enabled: !!tenantId && open,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "income" } }),
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।");
      return createFn({ data: { tenant_id: tenantId, branch_id: branchId, ...form, amount: Number(form.amount) } });
    },
    onSuccess: () => {
      toast.success(t("acct.income.recorded"));
      qc.invalidateQueries({ queryKey: ["incomes", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={!tenantId || !branchId}><Plus className="mr-1.5 h-4 w-4" /> {t("acct.income.newIncome")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("acct.income.addIncome")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("acct.common.no")}</Label><Input value={form.income_no} onChange={(e) => setForm({ ...form, income_no: e.target.value })} /></div>
            <div><Label>{t("acct.common.date")}</Label><Input type="date" value={form.income_date} onChange={(e) => setForm({ ...form, income_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("acct.common.amount")}</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div>
              <Label>{t("acct.common.method")}</Label>
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
            <Label>{t("acct.income.incomeAccount")}</Label>
            <Select value={form.account_code} onValueChange={(v) => setForm({ ...form, account_code: v })}>
              <SelectTrigger><SelectValue placeholder={t("acct.common.selectAccount")} /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>{t("acct.common.source")}</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
          <div><Label>{t("acct.common.notes")}</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!form.amount || !form.account_code || !branchId || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("acct.income.saveIncome")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
