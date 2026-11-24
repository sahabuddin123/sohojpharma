import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Save, AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { buildProductDisplayName } from "@/lib/product-display";
import { createPurchaseReturn, getReturnableLines } from "@/lib/api/purchase-returns.functions";
import { getProcurementSettings } from "@/lib/api/procurement-control.functions";

export const Route = createFileRoute("/purchases/returns/new")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "New Purchase Return — SohojPharma" }] }),
  component: NewPurchaseReturnPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => `৳ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

type SelectedQty = Record<string, { qty: number; reason: string }>; // key=batch_id

function NewPurchaseReturnPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const fetchLines = useServerFn(getReturnableLines);
  const createReturn = useServerFn(createPurchaseReturn);
  const settingsFn = useServerFn(getProcurementSettings);
  const { data: settings } = useQuery({
    queryKey: ["proc-settings", tenantId], enabled: !!tenantId,
    queryFn: () => settingsFn({ data: { tenantId } }),
  });
  const needsApproval = !!settings?.require_purchase_return_approval;

  const [supplierId, setSupplierId] = useState("");
  const [poId, setPoId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [returnDate, setReturnDate] = useState(today());
  const [allowExpired, setAllowExpired] = useState(false);
  const [picks, setPicks] = useState<SelectedQty>({});
  const [saving, setSaving] = useState(false);

  // Suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active", tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name,phone,due_balance")
        .eq("tenant_id", tenantId).eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  // POs for selected supplier
  const { data: pos = [] } = useQuery({
    queryKey: ["pos-by-supplier", supplierId, tenantId],
    enabled: !!tenantId && !!supplierId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id,po_number,order_date,status,total")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", supplierId)
        .in("status", ["received", "partially_received"])
        .order("order_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => { setPoId(""); setPicks({}); }, [supplierId]);
  useEffect(() => { setPicks({}); }, [poId]);

  // Returnable lines for chosen PO
  const { data: poData } = useQuery({
    queryKey: ["po-returnable", poId, tenantId],
    enabled: !!tenantId && !!poId,
    queryFn: () => fetchLines({ data: { tenantId, poId } }),
  });
  const lines = poData?.lines ?? [];

  const activeLines = useMemo(
    () => lines
      .filter((l) => (picks[l.batch_id]?.qty ?? 0) > 0)
      .map((l) => ({ ...l, qty: picks[l.batch_id].qty, lineReason: picks[l.batch_id].reason })),
    [lines, picks],
  );
  const totalValue = activeLines.reduce((s, l) => s + l.qty * l.unit_cost, 0);

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!supplierId) e.push("Select a supplier");
    if (!poId) e.push("Select a purchase order");
    if (!activeLines.length) e.push("Select at least one batch with qty > 0");
    const t = today();
    activeLines.forEach((l, i) => {
      if (l.qty > l.qty_available) e.push(`Row ${i + 1}: Return quantity exceeds available stock.`);
      if (l.is_recalled) e.push(`Row ${i + 1}: batch is recalled`);
      if (!allowExpired && l.expiry_date && l.expiry_date < t) e.push(`Row ${i + 1}: batch expired (toggle override)`);
    });
    return e;
  }, [supplierId, poId, activeLines, allowExpired]);

  async function handleSave() {
    if (errors.length || !tenantId) { toast.error(errors[0] ?? "Cannot save"); return; }
    if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
    setSaving(true);
    try {
      const res = await createReturn({
        data: {
          tenantId, branch_id: branchId, supplierId, poId,
          returnDate, reason: reason || undefined, notes: notes || undefined,
          allowExpired,
          lines: activeLines.map((l) => ({
            batch_id: l.batch_id, product_id: l.product_id,
            qty: l.qty, unit_cost: l.unit_cost,
            reason: l.lineReason || undefined,
          })),
        },
      });
      toast.success(res.needsApproval
        ? `Return ${res.returnNo} submitted — awaiting approval`
        : `Return ${res.returnNo} posted — stock, ledger & journal updated`);
      navigate({ to: "/purchases/returns" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save return");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell variant="store" title="New purchase return">
      <PageHeader
        title="New purchase return"
        description="Pick a supplier and source PO, then select batch quantities to return. Posts to inventory, supplier ledger, and accounting journal."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/purchases/returns"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
            </Button>
            <Button onClick={handleSave} disabled={saving || !branchId || !!errors.length}>
              <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : needsApproval ? "Submit for approval" : "Post return"}
            </Button>
          </>
        }
      />

      {needsApproval && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Approval required — stock, supplier ledger and journal will post only after an approver accepts this return.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Source</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Supplier *</Label>
                <div className="flex gap-2">
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder={suppliers.length ? "Select supplier" : "No suppliers yet"} /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => setSupplierDialogOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add
                  </Button>
                </div>
                {selectedSupplier && (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mt-1">
                    <Badge variant="outline">Due: {fmt(Number(selectedSupplier.due_balance ?? 0))}</Badge>
                    {selectedSupplier.phone && <Badge variant="outline">📞 {selectedSupplier.phone}</Badge>}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Purchase order *</Label>
                <Select value={poId} onValueChange={setPoId} disabled={!supplierId}>
                  <SelectTrigger><SelectValue placeholder={supplierId ? "Select PO" : "Select supplier first"} /></SelectTrigger>
                  <SelectContent>
                    {pos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.po_number} · {p.order_date} · {fmt(Number(p.total))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Return date</Label>
                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Reason</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="near_expiry">Near expiry</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="wrong_product">Wrong product</SelectItem>
                    <SelectItem value="quality_issue">Quality issue</SelectItem>
                    <SelectItem value="overstock">Overstock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <Checkbox id="allowExpired" checked={allowExpired} onCheckedChange={(v) => setAllowExpired(!!v)} />
                <Label htmlFor="allowExpired" className="cursor-pointer">Allow returning expired batches</Label>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Returnable batches</CardTitle></CardHeader>
            <CardContent>
              {!poId && <div className="text-sm text-muted-foreground py-6 text-center">Select a purchase order to load batches.</div>}
              {poId && !lines.length && (
                <div className="text-sm text-muted-foreground py-6 text-center">No returnable batches for this PO.</div>
              )}
              {poId && lines.length > 0 && (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Returned</TableHead>
                        <TableHead className="w-24 text-right">Return qty</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((l) => {
                        const pick = picks[l.batch_id]?.qty ?? 0;
                        const t = today();
                        const expired = !!(l.expiry_date && l.expiry_date < t);
                        const blocked = l.is_recalled || (expired && !allowExpired);
                        return (
                          <TableRow key={l.batch_id} className={blocked ? "opacity-60" : ""}>
                            <TableCell>
                              <div className="font-medium text-sm">{l.product ? buildProductDisplayName(l.product) : "—"}</div>
                              <div className="text-xs text-muted-foreground">{l.product?.sku ?? ""}</div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{l.batch_no}</TableCell>
                            <TableCell className="text-xs">
                              {l.expiry_date}
                              {l.is_recalled && <Badge variant="destructive" className="ml-1">Recalled</Badge>}
                              {expired && <Badge variant="outline" className="ml-1 border-amber-500 text-amber-600">Expired</Badge>}
                            </TableCell>
                            <TableCell className="text-right">{fmt(l.unit_cost)}</TableCell>
                            <TableCell className="text-right">{l.qty_on_hand}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{l.qty_returned}</TableCell>
                            <TableCell>
                              <Input
                                type="number" min="0" max={l.qty_available}
                                className="h-8 text-right" disabled={blocked || l.qty_available <= 0}
                                value={pick || ""}
                                onChange={(e) => {
                                  const v = Math.max(0, Math.min(l.qty_available, Number(e.target.value) || 0));
                                  setPicks((p) => ({ ...p, [l.batch_id]: { qty: v, reason: p[l.batch_id]?.reason ?? "" } }));
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-right font-medium">{fmt(pick * l.unit_cost)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit shadow-card">
          <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Lines</span><span>{activeLines.length}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Total qty</span><span>{activeLines.reduce((s, l) => s + l.qty, 0)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Return value</span><span className="text-primary">{fmt(totalValue)}</span>
            </div>
            <div className="rounded-md border bg-muted/30 p-2 text-xs space-y-1">
              <div className="font-medium">Will post:</div>
              <div>• Reduce batch stock</div>
              <div>• Stock movement (purchase_return)</div>
              <div>• Supplier ledger debit</div>
              <div>• Reduce supplier due balance</div>
              <div>• Journal: DR 2000 / CR 1200</div>
            </div>
            {errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive space-y-1">
                <div className="flex items-center gap-1 font-medium"><AlertCircle className="h-3.5 w-3.5" /> Fix before saving</div>
                <ul className="list-disc pl-4">
                  {errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            )}
            <Button className="w-full" onClick={handleSave} disabled={saving || !branchId || !!errors.length}>
              <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : needsApproval ? "Submit for approval" : "Post return"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
          <SupplierQuickForm
            tenantId={tenantId}
            onSaved={(id) => {
              setSupplierId(id);
              setSupplierDialogOpen(false);
              qc.invalidateQueries({ queryKey: ["suppliers-active", tenantId] });
            }}
            onCancel={() => setSupplierDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SupplierQuickForm({
  tenantId, onSaved, onCancel,
}: { tenantId: string; onSaved: (id: string) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "" });
  const mut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const { data, error } = await supabase.from("suppliers").insert({
        tenant_id: tenantId,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        email: form.email.trim() || null,
        is_active: true,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => { toast.success("Supplier added"); onSaved(id); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Name *</Label>
          <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Address</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Saving…" : "Save supplier"}
        </Button>
      </DialogFooter>
    </>
  );
}
