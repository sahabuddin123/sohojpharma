import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RouteErrorPanel } from "@/components/route-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";

export const Route = createFileRoute("/accounts/reports")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "GL Reports — SohojPharma" }] }),
  component: GLReportsPage,
});

const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0));

function GLReportsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId;
  const [warehouseId, setWarehouseId] = useState<string | null>(null);

  if (!tenantId) {
    return (
      <Alert>
        <AlertTitle>{t("acct.reports.noTenant")}</AlertTitle>
        <AlertDescription>{t("acct.reports.noTenantDesc")}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        title={t("acct.reports.title")}
        description={t("acct.reports.desc")}
        actions={<WarehouseFilter value={warehouseId} onChange={setWarehouseId} className="w-[220px]" />}
      />
      <Tabs defaultValue="trial-balance" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="trial-balance">{t("acct.reports.tabs.trialBalance")}</TabsTrigger>
          <TabsTrigger value="general-ledger">{t("acct.reports.tabs.generalLedger")}</TabsTrigger>
          <TabsTrigger value="balance-sheet">{t("acct.reports.tabs.balanceSheet")}</TabsTrigger>
          <TabsTrigger value="cash-flow">{t("acct.reports.tabs.cashFlow")}</TabsTrigger>
          <TabsTrigger value="equity">{t("acct.reports.tabs.equity")}</TabsTrigger>
          <TabsTrigger value="reconciliation">{t("acct.reports.tabs.reconciliation")}</TabsTrigger>
          <TabsTrigger value="backfill">{t("acct.reports.tabs.backfill")}</TabsTrigger>
        </TabsList>

        <TabsContent value="trial-balance"><TrialBalance tenantId={tenantId} warehouseId={warehouseId} /></TabsContent>
        <TabsContent value="general-ledger"><GeneralLedger tenantId={tenantId} warehouseId={warehouseId} /></TabsContent>
        <TabsContent value="balance-sheet"><BalanceSheet tenantId={tenantId} warehouseId={warehouseId} /></TabsContent>
        <TabsContent value="cash-flow"><CashFlow tenantId={tenantId} /></TabsContent>
        <TabsContent value="equity"><EquityChanges tenantId={tenantId} /></TabsContent>
        <TabsContent value="reconciliation"><Reconciliation tenantId={tenantId} /></TabsContent>
        <TabsContent value="backfill"><Backfill tenantId={tenantId} /></TabsContent>
      </Tabs>
    </>
  );
}

/* ---------------- Trial Balance ---------------- */
function TrialBalance({ tenantId, warehouseId }: { tenantId: string; warehouseId: string | null }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["v_trial_balance", tenantId, warehouseId],
    queryFn: async () => {
      if (warehouseId) {
        const { data, error } = await supabase
          .from("v_trial_balance_by_warehouse" as any)
          .select("account_code,account_name,account_type,total_debit,total_credit,balance,warehouse_id")
          .eq("tenant_id", tenantId)
          .eq("warehouse_id", warehouseId)
          .order("account_code");
        if (error) throw error;
        return (data ?? []) as any[];
      }
      const { data, error } = await supabase
        .from("v_trial_balance" as any)
        .select("account_code,account_name,account_type,total_debit,total_credit,balance")
        .eq("tenant_id", tenantId)
        .order("account_code");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const totals = useMemo(() => {
    const rows = q.data ?? [];
    return {
      debit: rows.reduce((s, r) => s + Number(r.total_debit || 0), 0),
      credit: rows.reduce((s, r) => s + Number(r.total_credit || 0), 0),
    };
  }, [q.data]);
  const balanced = Math.abs(totals.debit - totals.credit) < 0.01;

  return (
    <Card className="shadow-card mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("acct.reports.tb.title")}</CardTitle>
        <Badge variant={balanced ? "default" : "destructive"}>
          {balanced
            ? <><CheckCircle2 className="mr-1 h-3 w-3" />{t("acct.reports.tb.balanced")}</>
            : <><AlertTriangle className="mr-1 h-3 w-3" />{t("acct.reports.tb.outOfBalance")}</>}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <div className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("acct.reports.tb.code")}</TableHead>
              <TableHead>{t("acct.reports.tb.account")}</TableHead>
              <TableHead>{t("acct.reports.tb.type")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.tb.debit")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.tb.credit")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.tb.balance")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((r: any) => (
                <TableRow key={r.account_code + r.account_name}>
                  <TableCell className="font-mono text-xs">{r.account_code}</TableCell>
                  <TableCell>{r.account_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{r.account_type}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.total_debit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.total_credit)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmt(r.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold">
                <TableCell colSpan={3}>{t("acct.reports.tb.totals")}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.debit)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.credit)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(totals.debit - totals.credit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- General Ledger ---------------- */
function GeneralLedger({ tenantId, warehouseId }: { tenantId: string; warehouseId: string | null }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["v_general_ledger", tenantId, warehouseId],
    queryFn: async () => {
      let query = supabase
        .from("v_general_ledger" as any)
        .select("entry_no,entry_date,ref_table,ref_no,account_code,account_name,debit,credit,description,running_balance,warehouse_id")
        .eq("tenant_id", tenantId);
      if (warehouseId) query = query.eq("warehouse_id", warehouseId);
      const { data, error } = await query.order("entry_date", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  return (
    <Card className="shadow-card mt-4">
      <CardHeader><CardTitle className="text-base">{t("acct.reports.gl.title")}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <div className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("acct.reports.gl.date")}</TableHead>
              <TableHead>{t("acct.reports.gl.entry")}</TableHead>
              <TableHead>{t("acct.reports.gl.account")}</TableHead>
              <TableHead>{t("acct.reports.gl.ref")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.gl.debit")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.gl.credit")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.gl.running")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{r.entry_date}</TableCell>
                  <TableCell className="font-mono text-xs">{r.entry_no}</TableCell>
                  <TableCell><span className="font-mono text-xs mr-2">{r.account_code}</span>{r.account_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.ref_table} {r.ref_no}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.debit) ? fmt(r.debit) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.credit) ? fmt(r.credit) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.running_balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Balance Sheet ---------------- */
function BalanceSheet({ tenantId, warehouseId }: { tenantId: string; warehouseId: string | null }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["v_trial_balance_bs", tenantId, warehouseId],
    queryFn: async () => {
      if (warehouseId) {
        const { data, error } = await supabase
          .from("v_trial_balance_by_warehouse" as any)
          .select("account_code,account_name,account_type,balance,warehouse_id")
          .eq("tenant_id", tenantId)
          .eq("warehouse_id", warehouseId)
          .order("account_code");
        if (error) throw error;
        return (data ?? []) as any[];
      }
      const { data, error } = await supabase
        .from("v_trial_balance" as any)
        .select("account_code,account_name,account_type,balance")
        .eq("tenant_id", tenantId)
        .order("account_code");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const groups = useMemo(() => {
    const rows = q.data ?? [];
    const by = (t: string) => rows.filter((r: any) => r.account_type === t);
    const sum = (rs: any[]) => rs.reduce((s, r) => s + Number(r.balance || 0), 0);
    const assets = by("asset"), liab = by("liability"), equity = by("equity");
    const income = by("income"), cogs = by("cogs"), exp = by("expense");
    const net = sum(income) - sum(cogs) - sum(exp);
    return { assets, liab, equity, totalAssets: sum(assets), totalLiab: sum(liab), totalEquity: sum(equity) + net, netIncome: net };
  }, [q.data]);
  const diff = groups.totalAssets - (groups.totalLiab + groups.totalEquity);
  return (
    <div className="grid gap-4 md:grid-cols-2 mt-4">
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("acct.reports.bs.assets")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table><TableBody>
            {groups.assets.map((r: any) => (
              <TableRow key={r.account_code}>
                <TableCell><span className="font-mono text-xs mr-2">{r.account_code}</span>{r.account_name}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.balance)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell>{t("acct.reports.bs.totalAssets")}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(groups.totalAssets)}</TableCell>
            </TableRow>
          </TableBody></Table>
        </CardContent>
      </Card>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("acct.reports.bs.liabEquity")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table><TableBody>
            {groups.liab.map((r: any) => (
              <TableRow key={r.account_code}>
                <TableCell><span className="font-mono text-xs mr-2">{r.account_code}</span>{r.account_name}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.balance)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/30">
              <TableCell className="font-medium">{t("acct.reports.bs.subtotalLiab")}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(groups.totalLiab)}</TableCell>
            </TableRow>
            {groups.equity.map((r: any) => (
              <TableRow key={r.account_code}>
                <TableCell><span className="font-mono text-xs mr-2">{r.account_code}</span>{r.account_name}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.balance)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell>{t("acct.reports.bs.netIncome")}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(groups.netIncome)}</TableCell>
            </TableRow>
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell>{t("acct.reports.bs.totalLiabEquity")}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(groups.totalLiab + groups.totalEquity)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-xs text-muted-foreground">{t("acct.reports.bs.difference")}</TableCell>
              <TableCell className={"text-right tabular-nums text-xs " + (Math.abs(diff) < 0.01 ? "text-success" : "text-destructive")}>{fmt(diff)}</TableCell>
            </TableRow>
          </TableBody></Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Cash Flow ---------------- */
function CashFlow({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["v_cash_flow", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_cash_flow" as any)
        .select("month,account_code,account_name,inflow,outflow,net_change")
        .eq("tenant_id", tenantId)
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  return (
    <Card className="shadow-card mt-4">
      <CardHeader><CardTitle className="text-base">{t("acct.reports.cf.title")}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <div className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("acct.reports.cf.month")}</TableHead>
              <TableHead>{t("acct.reports.cf.account")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.cf.inflow")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.cf.outflow")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.cf.net")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{r.month}</TableCell>
                  <TableCell><span className="font-mono text-xs mr-2">{r.account_code}</span>{r.account_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.inflow)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.outflow)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmt(r.net_change)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Equity Changes ---------------- */
function EquityChanges({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["v_equity_changes", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_equity_changes" as any)
        .select("month,account_code,account_name,net_change")
        .eq("tenant_id", tenantId)
        .order("month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  return (
    <Card className="shadow-card mt-4">
      <CardHeader><CardTitle className="text-base">{t("acct.reports.eq.title")}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? <div className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("acct.reports.eq.month")}</TableHead>
              <TableHead>{t("acct.reports.eq.account")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.eq.netChange")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((r: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{r.month}</TableCell>
                  <TableCell><span className="font-mono text-xs mr-2">{r.account_code}</span>{r.account_name}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmt(r.net_change)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Reconciliation ---------------- */
function Reconciliation({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<any>(null);
  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reconcile_financials" as any, { _tenant_id: tenantId });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => { setResult(d); toast.success(t("acct.reports.rec.complete")); },
    onError: (e: any) => toast.error(e.message),
  });
  const rows = result ? [
    { label: t("acct.reports.rec.inventory"), ...result.inventory },
    { label: t("acct.reports.rec.ar"),        ...result.accounts_receivable },
    { label: t("acct.reports.rec.ap"),        ...result.accounts_payable },
    { label: t("acct.reports.rec.cash"),      ...result.cash },
  ] : [];
  return (
    <Card className="shadow-card mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("acct.reports.rec.title")}</CardTitle>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("acct.reports.rec.runBtn")}
        </Button>
      </CardHeader>
      <CardContent>
        {!result ? (
          <p className="text-sm text-muted-foreground">{t("acct.reports.rec.hint")}</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("acct.reports.rec.category")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.rec.subledger")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.rec.gl")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.rec.variance")}</TableHead>
              <TableHead>{t("acct.reports.rec.status")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r: any) => {
                const ok = Math.abs(Number(r.variance)) < 0.01;
                return (
                  <TableRow key={r.label}>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.subledger)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.gl)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.variance)}</TableCell>
                    <TableCell>
                      <Badge variant={ok ? "default" : "destructive"}>
                        {ok ? t("acct.reports.rec.ok") : t("acct.reports.rec.mismatch")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell colSpan={2}>{t("acct.reports.rec.vat")}</TableCell>
                <TableCell colSpan={3} className="text-right tabular-nums">{fmt(result.vat_output_payable)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Backfill ---------------- */
function Backfill({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<any>(null);
  const [committed, setCommitted] = useState<any>(null);

  const dryRun = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("backfill_historical_journals" as any, { _tenant_id: tenantId, _dry_run: true });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => { setPreview(d); setCommitted(null); toast.success(t("acct.reports.bf.dryRunComplete")); },
    onError: (e: any) => toast.error(e.message),
  });

  const commit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("backfill_historical_journals" as any, { _tenant_id: tenantId, _dry_run: false });
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => { setCommitted(d); setPreview(null); toast.success(t("acct.reports.bf.backfillComplete")); },
    onError: (e: any) => toast.error(e.message),
  });

  const pending = preview?.pending;
  const posted = committed?.posted;

  return (
    <Card className="shadow-card mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("acct.reports.bf.title")}</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => dryRun.mutate()} disabled={dryRun.isPending}>
            {dryRun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("acct.reports.bf.dryRun")}
          </Button>
          <Button onClick={() => commit.mutate()} disabled={commit.isPending || !preview}>
            {commit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("acct.reports.bf.commitBackfill")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert>
          <AlertTitle>{t("acct.reports.bf.howTitle")}</AlertTitle>
          <AlertDescription>{t("acct.reports.bf.howDesc")}</AlertDescription>
        </Alert>

        {pending && (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("acct.reports.bf.recordType")}</TableHead>
              <TableHead className="text-right">{t("acct.reports.bf.pending")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              <TableRow><TableCell>{t("acct.reports.bf.sales")}</TableCell><TableCell className="text-right tabular-nums">{pending.sales}</TableCell></TableRow>
              <TableRow><TableCell>{t("acct.reports.bf.salesReturns")}</TableCell><TableCell className="text-right tabular-nums">{pending.sales_returns}</TableCell></TableRow>
              <TableRow><TableCell>{t("acct.reports.bf.customerPayments")}</TableCell><TableCell className="text-right tabular-nums">{pending.customer_payments}</TableCell></TableRow>
              <TableRow><TableCell>{t("acct.reports.bf.goodsReceipts")}</TableCell><TableCell className="text-right tabular-nums">{pending.goods_receipts}</TableCell></TableRow>
              <TableRow><TableCell>{t("acct.reports.bf.purchaseReturns")}</TableCell><TableCell className="text-right tabular-nums">{pending.purchase_returns}</TableCell></TableRow>
              <TableRow className="bg-muted/40 font-semibold"><TableCell>{t("acct.reports.bf.total")}</TableCell><TableCell className="text-right tabular-nums">{pending.total}</TableCell></TableRow>
            </TableBody>
          </Table>
        )}

        {posted && (
          <>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("acct.reports.bf.recordType")}</TableHead>
                <TableHead className="text-right">{t("acct.reports.bf.posted")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell>{t("acct.reports.bf.sales")}</TableCell><TableCell className="text-right tabular-nums">{posted.sales}</TableCell></TableRow>
                <TableRow><TableCell>{t("acct.reports.bf.salesReturns")}</TableCell><TableCell className="text-right tabular-nums">{posted.sales_returns}</TableCell></TableRow>
                <TableRow><TableCell>{t("acct.reports.bf.customerPayments")}</TableCell><TableCell className="text-right tabular-nums">{posted.customer_payments}</TableCell></TableRow>
                <TableRow><TableCell>{t("acct.reports.bf.goodsReceipts")}</TableCell><TableCell className="text-right tabular-nums">{posted.goods_receipts}</TableCell></TableRow>
                <TableRow><TableCell>{t("acct.reports.bf.purchaseReturns")}</TableCell><TableCell className="text-right tabular-nums">{posted.purchase_returns}</TableCell></TableRow>
              </TableBody>
            </Table>
            {committed.error_count > 0 && (
              <Alert variant="destructive">
                <AlertTitle>{t("acct.reports.bf.errorCount", { count: committed.error_count })}</AlertTitle>
                <AlertDescription><pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">{JSON.stringify(committed.errors, null, 2)}</pre></AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
