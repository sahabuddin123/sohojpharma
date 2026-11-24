import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { supabase } from "@/integrations/supabase/client";
import { dueDashboard, recordPayment } from "@/lib/api/collections.functions";

export const Route = createFileRoute("/dues/collections")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Due Collections — SohojPharma" }] }),
  component: CollectionsPage,
});

function CollectionsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(dueDashboard);
  const { data } = useQuery({
    queryKey: ["due-dashboard", tenantId],
    queryFn: () => fn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  return (
    <AppShell variant="store" title={t("sections.dues.collTitle")}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("sections.dues.collTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("sections.dues.collDesc")}</p>
          </div>
          <RecordPaymentDialog tenantId={tenantId} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("sections.dues.totalDue")} value={data?.totalDue ?? 0} />
          <Stat label={t("sections.dues.collectedToday")} value={data?.collectedToday ?? 0} accent />
          <Stat label={t("sections.dues.collectedMonth")} value={data?.collectedThisMonth ?? 0} />
          <Stat label={t("sections.dues.custWithDue")} value={data?.totalCustomersWithDue ?? 0} />
        </div>

        <Card>
          <CardHeader><CardTitle>{t("sections.dues.overdue")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("sections.dues.customer")}</TableHead>
                  <TableHead>{t("sections.dues.phone")}</TableHead>
                  <TableHead className="text-right">{t("sections.dues.creditLimit")}</TableHead>
                  <TableHead className="text-right">{t("sections.dues.dueBalance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.overdueCustomers ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(c.credit_limit ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">{Number(c.due_balance).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {(!data?.overdueCustomers?.length) && (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{t("sections.dues.noOutstanding")}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("sections.dues.byMethod")}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Object.entries(data?.byMethod ?? {}).map(([m, amt]) => (
                <div key={m} className="rounded border p-3">
                  <p className="text-xs uppercase text-muted-foreground">{m}</p>
                  <p className="text-lg font-semibold">{Number(amt).toLocaleString()}</p>
                </div>
              ))}
              {Object.keys(data?.byMethod ?? {}).length === 0 && (
                <p className="col-span-full py-4 text-center text-sm text-muted-foreground">{t("sections.dues.noCollections")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${accent ? "text-emerald-600" : ""}`}>{Number(value).toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

function RecordPaymentDialog({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash"|"bkash"|"nagad"|"rocket"|"bank"|"card"|"other">("cash");
  const [ref, setRef] = useState("");
  const [customers, setCustomers] = useState<{ id: string; name: string; due_balance: number }[]>([]);

  const fn = useServerFn(recordPayment);
  const mut = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(t("sections.dues.paymentRecorded"));
      qc.invalidateQueries({ queryKey: ["due-dashboard"] });
      qc.invalidateQueries({ queryKey: ["customer-ledger"] });
      setOpen(false); setAmount(""); setRef("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  async function load() {
    const { data } = await supabase
      .from("v_customer_due")
      .select("id:customer_id,name,due_balance")
      .eq("tenant_id", tenantId)
      .gt("due_balance", 0)
      .order("due_balance", { ascending: false })
      .limit(200);
    setCustomers((data ?? [])
      .filter((c) => c.id && c.name)
      .map((c) => ({ id: c.id!, name: c.name!, due_balance: Number(c.due_balance ?? 0) })));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) void load(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1.5 h-4 w-4" /> {t("sections.dues.recordPayment")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("sections.dues.recordCustomerPayment")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("sections.dues.customer")}</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("sections.dues.selectDash")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({t("sections.dues.due").toLowerCase()} {Number(c.due_balance).toLocaleString()})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>{t("sections.dues.amount")}</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div>
              <Label>{t("sections.dues.method")}</Label>
              <select className="w-full rounded-md border bg-background px-3 py-2" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="cash">{t("sections.dues.cash")}</option>
                <option value="bkash">{t("sections.dues.bkash")}</option>
                <option value="nagad">{t("sections.dues.nagad")}</option>
                <option value="rocket">{t("sections.dues.rocket")}</option>
                <option value="bank">{t("sections.dues.bank")}</option>
                <option value="card">{t("sections.dues.card")}</option>
                <option value="other">{t("sections.dues.other")}</option>
              </select>
            </div>
          </div>
          <div><Label>{t("sections.dues.refTxn")}</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button
            disabled={!customerId || !amount || mut.isPending}
            onClick={() => mut.mutate({ data: {
              tenantId, branchId: branchId!, customer_id: customerId,
              amount: Number(amount), method, reference: ref || undefined,
            } })}
          ><Wallet className="mr-1.5 h-4 w-4" /> {t("sections.dues.record")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
