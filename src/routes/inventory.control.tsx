import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarX, Ban, RotateCcw, History, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import {
  listBatches,
  expirySummary,
  createDamageEntry,
  createSupplierReturn,
  listMovements,
} from "@/lib/api/inventory-control.functions";
import { useTranslation } from "react-i18next";
import { buildProductDisplayName } from "@/lib/product-display";

type AnyP = { name?: string | null; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null };
const dn = (p: AnyP | null | undefined, fallback = "—") => p?.name ? buildProductDisplayName({ name: p.name, strength: p.strength, medicine_type: p.medicine_type, volume: p.volume, pack_size: p.pack_size }) : fallback;

export const Route = createFileRoute("/inventory/control")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Inventory Control — SohojPharma" },
      { name: "description", content: "Damage stock, expiry monitoring, supplier returns and stock movement timeline." },
    ],
  }),
  component: InventoryControlPage,
});

function useReasonLabels() {
  const { t } = useTranslation();
  return {
    broken: t("pinv.rBroken"), expired: t("pinv.rExpired"), water_damage: t("pinv.rWaterDamage"),
    packaging: t("pinv.rPackaging"), supplier_defect: t("pinv.rSupplierDefect"), other: t("pinv.rOther"),
    near_expiry: t("pinv.rNearExpiry"), damaged: t("pinv.rDamaged"), wrong_product: t("pinv.rWrongProduct"),
  } as Record<string, string>;
}

function fmtBDT(n: number) {
  return "৳ " + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

function InventoryControlPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  return (
    <AppShell variant="store" title={t("pinv.invControlTitle")}>
      <PageHeader title={t("pinv.invControlTitle")} description={t("pinv.invControlDesc")} />
      {!currentTenantId ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          {t("pinv.loadingWorkspace")}
        </CardContent></Card>
      ) : (
        <Tabs defaultValue="expiry" className="space-y-4">
          <TabsList>
            <TabsTrigger value="expiry"><CalendarX className="mr-1.5 h-4 w-4" />{t("pinv.tabExpiry")}</TabsTrigger>
            <TabsTrigger value="damage"><Ban className="mr-1.5 h-4 w-4" />{t("pinv.tabDamage")}</TabsTrigger>
            <TabsTrigger value="returns"><RotateCcw className="mr-1.5 h-4 w-4" />{t("pinv.tabSupplierReturns")}</TabsTrigger>
            <TabsTrigger value="timeline"><History className="mr-1.5 h-4 w-4" />{t("pinv.tabTimeline")}</TabsTrigger>
          </TabsList>
          <TabsContent value="expiry"><ExpiryTab tenantId={currentTenantId} /></TabsContent>
          <TabsContent value="damage"><DamageTab tenantId={currentTenantId} /></TabsContent>
          <TabsContent value="returns"><SupplierReturnTab tenantId={currentTenantId} /></TabsContent>
          <TabsContent value="timeline"><TimelineTab tenantId={currentTenantId} /></TabsContent>
        </Tabs>
      )}
    </AppShell>
  );
}

// ─────────── EXPIRY ───────────
function ExpiryTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const fn = useServerFn(expirySummary);
  const batchesFn = useServerFn(listBatches);
  const [bucket, setBucket] = useState(30);

  const summary = useQuery({
    queryKey: ["expiry-summary", tenantId],
    queryFn: () => fn({ data: { tenantId } }),
  });
  const batches = useQuery({
    queryKey: ["expiry-batches", tenantId, bucket],
    queryFn: () => batchesFn({ data: { tenantId, maxDaysToExpiry: bucket, onlyInStock: true } }),
  });

  const s = summary.data ?? {};
  const expiredVal = s.expired?.value ?? 0;
  const d30Qty = (s.d7?.qty ?? 0) + (s.d15?.qty ?? 0) + (s.d30?.qty ?? 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("pinv.expiredStockValue")} value={fmtBDT(expiredVal)} icon={CalendarX} tone="warning" />
        <StatCard label={t("pinv.expiring30Qty")} value={String(d30Qty)} icon={AlertTriangle} tone="warning" />
        <StatCard label={t("pinv.expiring90Qty")} value={String(((s.d60?.qty ?? 0) + (s.d90?.qty ?? 0)))} icon={AlertTriangle} tone="secondary" />
        <StatCard label={t("pinv.safeStockValue")} value={fmtBDT(s.safe?.value ?? 0)} icon={CalendarX} tone="success" />
      </div>
      <Card className="mt-4 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("pinv.batchesExpiringSoon")}</CardTitle>
          <Select value={String(bucket)} onValueChange={(v) => setBucket(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7, 15, 30, 60, 90, 180].map((d) => <SelectItem key={d} value={String(d)}>{t("pinv.nextDaysTpl", { n: d })}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {batches.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("pinv.colProduct")}</TableHead><TableHead>{t("pinv.colBatch")}</TableHead>
                <TableHead>{t("pinv.colExpiry")}</TableHead><TableHead className="text-right">{t("pinv.colQty")}</TableHead>
                <TableHead className="text-right">{t("pinv.colValue")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(batches.data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    {t("pinv.noBatchesWindow")}
                  </TableCell></TableRow>
                ) : batches.data!.map((b: any) => {
                  const days = Math.floor((new Date(b.expiry_date).getTime() - Date.now()) / 86400000);
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{dn(b.products)}</TableCell>
                      <TableCell className="font-mono text-xs">{b.batch_no}</TableCell>
                      <TableCell>
                        <Badge className={days < 0 ? "bg-destructive/15 text-destructive" : days <= 30 ? "bg-warning/15 text-warning" : ""}>
                          {days < 0 ? t("pinv.expired") : `${days}d`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{b.qty_on_hand}</TableCell>
                      <TableCell className="text-right">{fmtBDT(Number(b.qty_on_hand) * Number(b.purchase_price))}</TableCell>
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

// ─────────── DAMAGE ───────────
function DamageTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const REASON_LABELS = useReasonLabels();
  const qc = useQueryClient();
  const batchesFn = useServerFn(listBatches);
  const damageFn = useServerFn(createDamageEntry);
  const movementsFn = useServerFn(listMovements);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ batchId: "", qty: "", reason: "broken", notes: "" });

  const batches = useQuery({
    queryKey: ["batches-all", tenantId],
    queryFn: () => batchesFn({ data: { tenantId, onlyInStock: true } }),
  });
  const damages = useQuery({
    queryKey: ["damage-list", tenantId],
    queryFn: () => movementsFn({ data: { tenantId, types: ["damage"], limit: 100 } }),
  });

  const mutate = useMutation({
    mutationFn: damageFn,
    onSuccess: (res: any) => {
      toast.success(t("pinv.damageRecordedTpl", { val: fmtBDT(res.lossValue) }));
      setOpen(false);
      setForm({ batchId: "", qty: "", reason: "broken", notes: "" });
      qc.invalidateQueries({ queryKey: ["damage-list", tenantId] });
      qc.invalidateQueries({ queryKey: ["batches-all", tenantId] });
      qc.invalidateQueries({ queryKey: ["expiry-summary", tenantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("pinv.damageEntries")}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Ban className="mr-1.5 h-4 w-4" />{t("pinv.recordDamage")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("dialog.recordDamagedStock")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("pinv.batchLbl")}</Label>
                <Select value={form.batchId} onValueChange={(v) => setForm({ ...form, batchId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("pinv.selectBatchPh")} /></SelectTrigger>
                  <SelectContent>
                    {(batches.data ?? []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {dn(b.products, "")} · {b.batch_no} · {b.qty_on_hand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("pinv.qtyLbl")}</Label>
                <Input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
              </div>
              <div><Label>{t("pinv.reasonLbl")}</Label>
                <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["broken","expired","water_damage","packaging","supplier_defect","other"].map((r) => (
                      <SelectItem key={r} value={r}>{REASON_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("pinv.notesLbl")}</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("pinv.cancelBtn")}</Button>
              <Button disabled={mutate.isPending || !form.batchId || !form.qty || !branchId}
                onClick={() => {
                  if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
                  mutate.mutate({ data: { tenantId, branch_id: branchId, batchId: form.batchId, qty: Number(form.qty), reason: form.reason as any, notes: form.notes || undefined } });
                }}>
                {mutate.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("pinv.saveBtn")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("pinv.colDate")}</TableHead><TableHead>{t("pinv.colProduct")}</TableHead>
            <TableHead className="text-right">{t("pinv.colQty")}</TableHead><TableHead>{t("pinv.colNotes")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(damages.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                {t("pinv.noDamageYet")}
              </TableCell></TableRow>
            ) : damages.data!.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs">{new Date(m.created_at).toLocaleString()}</TableCell>
                <TableCell>{dn(m.products)}</TableCell>
                <TableCell className="text-right">{Math.abs(Number(m.qty_change))}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─────────── SUPPLIER RETURNS ───────────
function SupplierReturnTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const { branchId } = useActiveBranch();
  const REASON_LABELS = useReasonLabels();
  const qc = useQueryClient();
  const batchesFn = useServerFn(listBatches);
  const retFn = useServerFn(createSupplierReturn);
  const movementsFn = useServerFn(listMovements);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ batchId: "", supplierId: "", qty: "", reason: "expired", notes: "" });
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const batches = useQuery({
    queryKey: ["batches-all", tenantId],
    queryFn: () => batchesFn({ data: { tenantId, onlyInStock: true } }),
  });
  const returns = useQuery({
    queryKey: ["returns-list", tenantId],
    queryFn: () => movementsFn({ data: { tenantId, types: ["purchase_return"], limit: 100 } }),
  });

  useMemo(() => {
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).eq("is_active", true)
        .then(({ data }) => setSuppliers(data ?? []));
    });
  }, [tenantId]);

  const mutate = useMutation({
    mutationFn: retFn,
    onSuccess: (res: any) => {
      toast.success(t("pinv.returnCreatedTpl", { ref: res.refNo, val: fmtBDT(res.returnValue) }));
      setOpen(false);
      setForm({ batchId: "", supplierId: "", qty: "", reason: "expired", notes: "" });
      qc.invalidateQueries({ queryKey: ["returns-list", tenantId] });
      qc.invalidateQueries({ queryKey: ["batches-all", tenantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t("pinv.supplierReturnsTitle")}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><RotateCcw className="mr-1.5 h-4 w-4" />{t("pinv.newReturn")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("dialog.returnToSupplier")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("pinv.supplierLbl")}</Label>
                <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("pinv.selectSupplierPh")} /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("pinv.batchLbl")}</Label>
                <Select value={form.batchId} onValueChange={(v) => setForm({ ...form, batchId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("pinv.selectBatchPh")} /></SelectTrigger>
                  <SelectContent>
                    {(batches.data ?? []).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{dn(b.products, "")} · {b.batch_no} · {b.qty_on_hand}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("pinv.qtyLbl")}</Label>
                <Input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
              </div>
              <div><Label>{t("pinv.reasonLbl")}</Label>
                <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["expired","near_expiry","damaged","wrong_product"].map((r) => (
                      <SelectItem key={r} value={r}>{REASON_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("pinv.notesLbl")}</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("pinv.cancelBtn")}</Button>
              <Button disabled={mutate.isPending || !form.batchId || !form.supplierId || !form.qty || !branchId}
                onClick={() => {
                  if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
                  mutate.mutate({ data: { tenantId, branch_id: branchId, batchId: form.batchId, supplierId: form.supplierId, qty: Number(form.qty), reason: form.reason as any, notes: form.notes || undefined } });
                }}>
                {mutate.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{t("pinv.saveCreditNote")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("pinv.colDate")}</TableHead><TableHead>{t("pinv.colRef")}</TableHead><TableHead>{t("pinv.colProduct")}</TableHead>
            <TableHead className="text-right">{t("pinv.colQty")}</TableHead><TableHead>{t("pinv.colNotes")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(returns.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">{t("pinv.noSupplierReturns")}</TableCell></TableRow>
            ) : returns.data!.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs">{new Date(m.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-xs">{m.reference_no}</TableCell>
                <TableCell>{dn(m.products)}</TableCell>
                <TableCell className="text-right">{Math.abs(Number(m.qty_change))}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─────────── TIMELINE ───────────
function TimelineTab({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const movementsFn = useServerFn(listMovements);
  const movs = useQuery({
    queryKey: ["all-movements", tenantId],
    queryFn: () => movementsFn({ data: { tenantId, limit: 200 } }),
  });
  return (
    <Card className="shadow-card">
      <CardHeader><CardTitle className="text-base">{t("pinv.stockMovementTimeline")}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("pinv.colDate")}</TableHead><TableHead>{t("pinv.colType")}</TableHead><TableHead>{t("pinv.colProduct")}</TableHead>
            <TableHead>{t("pinv.colRef")}</TableHead><TableHead className="text-right">{t("pinv.colQtyDelta")}</TableHead>
            <TableHead className="text-right">{t("pinv.colAfter")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(movs.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">{t("pinv.noMovements")}</TableCell></TableRow>
            ) : movs.data!.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs">{new Date(m.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{m.movement_type}</Badge></TableCell>
                <TableCell>{dn(m.products)}</TableCell>
                <TableCell className="font-mono text-xs">{m.reference_no ?? "—"}</TableCell>
                <TableCell className={`text-right font-medium ${Number(m.qty_change) < 0 ? "text-destructive" : "text-success"}`}>
                  {Number(m.qty_change) > 0 ? "+" : ""}{m.qty_change}
                </TableCell>
                <TableCell className="text-right">{m.qty_after ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
