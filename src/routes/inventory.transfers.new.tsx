import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";
import { RouteErrorPanel } from "@/components/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { toast } from "sonner";
import { requestTransfer } from "@/lib/api/transfers.functions";

export const Route = createFileRoute("/inventory/transfers/new")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "New Transfer — SohojPharma" }] }),
  component: NewTransferPage,
});

type Line = { batch_id: string; product_id: string; product_name: string; batch_no: string; qty: number; available: number; unit_cost: number };

function NewTransferPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const submit = useServerFn(requestTransfer);

  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickBatch, setPickBatch] = useState<string>("");
  const [pickQty, setPickQty] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  const { data: batches = [] } = useQuery({
    enabled: !!tenantId && !!from,
    queryKey: ["transfer-source-batches", tenantId, from],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("id, batch_no, qty_on_hand, purchase_price, product_id, products:product_id(name)")
        .eq("tenant_id", tenantId).eq("warehouse_id", from!).gt("qty_on_hand", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; batch_no: string; qty_on_hand: number; purchase_price: number; product_id: string; products: { name: string } | null }>;
    },
  });

  function addLine() {
    const b = batches.find((x) => x.id === pickBatch);
    if (!b || pickQty <= 0 || pickQty > b.qty_on_hand) { toast.error("Invalid batch or quantity"); return; }
    if (lines.some((l) => l.batch_id === b.id)) { toast.error("Batch already added"); return; }
    setLines((p) => [...p, {
      batch_id: b.id, product_id: b.product_id, product_name: b.products?.name ?? "Product",
      batch_no: b.batch_no, qty: pickQty, available: Number(b.qty_on_hand), unit_cost: Number(b.purchase_price ?? 0),
    }]);
    setPickBatch(""); setPickQty(1);
  }

  async function onSubmit() {
    if (!branchId) { toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।"); return; }
    if (!from || !to) { toast.error("Pick source and destination"); return; }
    if (from === to) { toast.error("Source and destination must differ"); return; }
    if (lines.length === 0) { toast.error("Add at least one line"); return; }
    setSubmitting(true);
    try {
      const res = await submit({ data: {
        tenant_id: tenantId, branch_id: branchId, from_warehouse_id: from, to_warehouse_id: to, notes,
        items: lines.map((l) => ({ product_id: l.product_id, batch_id: l.batch_id, qty: l.qty, unit_cost: l.unit_cost })),
      }});
      toast.success("Transfer requested");
      navigate({ to: "/inventory/transfers/$id", params: { id: res.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSubmitting(false); }
  }

  return (
    <AppShell variant="store" title="New Transfer">
      <PageHeader title="New Stock Transfer" description="Request stock to move from one warehouse to another." />

      <Card>
        <CardHeader><CardTitle className="text-base">Source & Destination</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>From warehouse</Label><WarehouseFilter value={from} onChange={setFrom} allowAll={false} /></div>
          <div><Label>To warehouse</Label><WarehouseFilter value={to} onChange={setTo} allowAll={false} /></div>
          <div className="md:col-span-2"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">Lines</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div className="flex-1 min-w-[280px]">
              <Label>Batch</Label>
              <Select value={pickBatch} onValueChange={setPickBatch} disabled={!from}>
                <SelectTrigger><SelectValue placeholder={from ? "Choose batch" : "Pick a source warehouse first"} /></SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.products?.name ?? "Product"} — {b.batch_no} (avail {b.qty_on_hand})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32"><Label>Qty</Label><Input type="number" min={1} value={pickQty} onChange={(e) => setPickQty(Number(e.target.value))} /></div>
            <Button onClick={addLine} disabled={!pickBatch}><Plus className="h-4 w-4 mr-1" /> Add</Button>
          </div>

          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>Qty</TableHead><TableHead>Available</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No lines yet.</TableCell></TableRow>
              ) : lines.map((l) => (
                <TableRow key={l.batch_id}>
                  <TableCell>{l.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{l.batch_no}</TableCell>
                  <TableCell>{l.qty}</TableCell>
                  <TableCell>{l.available}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => setLines((p) => p.filter((x) => x.batch_id !== l.batch_id))}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/inventory/transfers" })}>Cancel</Button>
        <Button onClick={onSubmit} disabled={submitting || !branchId}>{submitting ? "Submitting…" : "Request Transfer"}</Button>
      </div>
    </AppShell>
  );
}
