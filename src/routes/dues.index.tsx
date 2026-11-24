import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Users, Building2, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dueDashboard, recordPayment } from "@/lib/api/collections.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { toast } from "sonner";

export const Route = createFileRoute("/dues/")({
  validateSearch: z.object({
    view: z.string().optional(),
  }),
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Due Management — SohojPharma" },
      { name: "description", content: "Track customer and supplier dues with collection reports." },
    ],
  }),
  component: DuesDashboard,
});

function DuesDashboard() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const dashFn = useServerFn(dueDashboard);

  const { data, isLoading } = useQuery({
    queryKey: ["due-dashboard", tenantId],
    enabled: !!tenantId,
    queryFn: () => dashFn({ data: { tenantId } }),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["supplier-dues", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("suppliers")
        .select("id,name,phone,due_balance")
        .eq("tenant_id", tenantId).gt("due_balance", 0).order("due_balance", { ascending: false });
      return data ?? [];
    },
  });

  const [collectFor, setCollectFor] = useState<{ id: string; name: string; due: number } | null>(null);
  const totalSupplierDue = suppliers.reduce((s, x) => s + Number(x.due_balance ?? 0), 0);

  return (
    <AppShell variant="store" title={t("nav.dues")}>
      <PageHeader title={t("sections.dues.title")} description={t("sections.dues.desc")} />

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("common.loading")}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("sections.dues.customerDue")} value={`৳ ${Math.round(data.totalDue).toLocaleString()}`} icon={Users} tone="warning" />
            <StatCard label={t("sections.dues.supplierDue")} value={`৳ ${Math.round(totalSupplierDue).toLocaleString()}`} icon={Building2} tone="secondary" />
            <StatCard label={t("sections.dues.collectedToday")} value={`৳ ${Math.round(data.collectedToday).toLocaleString()}`} icon={ArrowDownToLine} tone="success" />
            <StatCard label={t("sections.dues.thisMonth")} value={`৳ ${Math.round(data.collectedThisMonth).toLocaleString()}`} icon={ArrowUpFromLine} tone="primary" />
          </div>

          <Card className="mt-6 shadow-card">
            <CardHeader><CardTitle className="text-base">{t("sections.dues.outstanding")}</CardTitle></CardHeader>
            <CardContent>
              <Tabs defaultValue="customer">
                <TabsList>
                  <TabsTrigger value="customer">{t("sections.dues.customerDueTab", { n: data.overdueCustomers.length })}</TabsTrigger>
                  <TabsTrigger value="supplier">{t("sections.dues.supplierDueTab", { n: suppliers.length })}</TabsTrigger>
                </TabsList>

                <TabsContent value="customer" className="mt-4">
                  {data.overdueCustomers.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">{t("sections.dues.noneCust")}</div>
                  ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("sections.dues.customer")}</TableHead><TableHead>{t("sections.dues.phone")}</TableHead>
                      <TableHead className="text-right">{t("sections.dues.due")}</TableHead>
                      <TableHead className="text-right">{t("sections.dues.action")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {data.overdueCustomers.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            <Link to="/customers/$id" params={{ id: c.id || "" }} className="hover:underline">{c.name}</Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{c.phone ?? "-"}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">৳ {Number(c.due_balance).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" onClick={() => c.id && setCollectFor({ id: c.id, name: c.name ?? "Customer", due: Number(c.due_balance) })}>
                              <Wallet className="mr-1 h-4 w-4" /> {t("sections.dues.collect")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  )}
                </TabsContent>

                <TabsContent value="supplier" className="mt-4">
                  {suppliers.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">{t("sections.dues.noneSupp")}</div>
                  ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("sections.dues.supplier")}</TableHead><TableHead>{t("sections.dues.phone")}</TableHead>
                      <TableHead className="text-right">{t("sections.dues.due")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {suppliers.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-muted-foreground">{s.phone ?? "-"}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">৳ {Number(s.due_balance).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      <CollectDialog tenantId={tenantId} target={collectFor} onClose={() => setCollectFor(null)} />
    </AppShell>
  );
}

function CollectDialog({ tenantId, target, onClose }: { tenantId: string; target: { id: string; name: string; due: number } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const recordFn = useServerFn(recordPayment);
  const qc = useQueryClient();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<"cash" | "bkash" | "nagad" | "rocket" | "bank" | "card" | "other">("cash");
  const [reference, setReference] = useState("");

  const mutation = useMutation({
    mutationFn: () => recordFn({ data: { tenantId, branchId: branchId!, customer_id: target!.id, amount: Number(amount), method, reference } }),
    onSuccess: () => {
      toast.success(t("sections.dues.paymentRecorded"));
      qc.invalidateQueries({ queryKey: ["due-dashboard", tenantId] });
      onClose(); setAmount(0); setReference("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("sections.dues.collectTitle", { name: target?.name ?? "" })}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="rounded-md bg-muted/40 p-3 text-sm">{t("sections.dues.outstandingLabel")}: <span className="font-semibold text-destructive">৳ {target?.due.toLocaleString()}</span></div>
          <div><Label>{t("sections.dues.amount")}</Label><Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div><Label>{t("sections.dues.method")}</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t("sections.dues.cash")}</SelectItem>
                <SelectItem value="bkash">{t("sections.dues.bkash")}</SelectItem>
                <SelectItem value="nagad">{t("sections.dues.nagad")}</SelectItem>
                <SelectItem value="rocket">{t("sections.dues.rocket")}</SelectItem>
                <SelectItem value="bank">{t("sections.dues.bank")}</SelectItem>
                <SelectItem value="card">{t("sections.dues.card")}</SelectItem>
                <SelectItem value="other">{t("sections.dues.other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>{t("sections.dues.reference")}</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!amount || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("sections.dues.record")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
