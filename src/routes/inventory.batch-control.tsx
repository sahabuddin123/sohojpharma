import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { ArrowRightLeft, GitMerge, Ban, RefreshCw, Loader2, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  batchControlKpis, listActionableBatches, listRecalls,
  transferBatch, adjustBatch, mergeBatches, splitBatch, recallBatch, recallSupplierBatches,
  updateBatchExpiry,
} from "@/lib/api/batch-control.functions";
import { buildProductDisplayName } from "@/lib/product-display";
import { ExpiryMonthInput, formatMonthYear, formatFullDate } from "@/components/inventory/expiry-month-input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CompanyReturnsTab } from "@/components/inventory/company-returns-tab";

export const Route = createFileRoute("/inventory/batch-control")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Batch Control — SohojPharma" },
      { name: "description", content: "Transfer, adjust, merge, split, and recall batches with full audit trail." },
    ],
  }),
  component: BatchControlPage,
});

type BatchRow = {
  id: string; batch_no: string; expiry_date: string; mfg_date: string | null;
  qty_on_hand: number; purchase_price: number; mrp: number | null; status: string;
  branch_id: string | null; supplier_id: string | null; warehouse_id: string | null;
  product_id: string; created_at: string; updated_at: string;
  warehouse_name: string | null; supplier_name: string | null;
  products: { name?: string; sku?: string; barcode?: string; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null; sale_price?: number | null; generic_name?: string | null; manufacturer_name?: string | null } | null;
};

type SortKey = "nearest_expiry" | "latest_expiry" | "stock_desc" | "stock_asc" | "newest" | "oldest";

type PageSize = 50 | 100 | 250 | 500;

function expiryTone(expiry: string | null | undefined): "healthy" | "soon" | "expired" {
  if (!expiry) return "healthy";
  const d = new Date(expiry + "T00:00:00");
  const now = new Date();
  const days = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return "expired";
  if (days < 30) return "soon";
  return "healthy";
}

function BatchControlPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("nearest_expiry");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [selected, setSelected] = useState<BatchRow | null>(null);
  const [dialog, setDialog] = useState<"edit-expiry" | "transfer" | "adjust" | "merge" | "split" | "recall" | "supplier-recall" | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const kpisFn = useServerFn(batchControlKpis);
  const batchesFn = useServerFn(listActionableBatches);
  const recallsFn = useServerFn(listRecalls);

  const kpis = useQuery({
    queryKey: ["batch-kpis", tenantId],
    queryFn: () => kpisFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });
  const batches = useQuery({
    queryKey: ["actionable-batches", tenantId, search, sort, page, pageSize],
    queryFn: () => batchesFn({ data: { tenantId, search: search || undefined, sort, page, pageSize } }),
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
  });
  const recalls = useQuery({
    queryKey: ["recalls", tenantId],
    queryFn: () => recallsFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  const rows = batches.data?.rows ?? [];
  const totalCount = batches.data?.totalCount ?? 0;
  const totalPages = batches.data?.totalPages ?? 0;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["batch-kpis"] });
    qc.invalidateQueries({ queryKey: ["actionable-batches"] });
    qc.invalidateQueries({ queryKey: ["recalls"] });
  };

  const refreshRow = async (batchId: string, patch: Partial<BatchRow>) => {
    qc.setQueriesData<{ rows: BatchRow[]; totalCount: number; page: number; pageSize: number; totalPages: number } | undefined>(
      { queryKey: ["actionable-batches"] },
      (prev) => prev ? { ...prev, rows: prev.rows.map(r => r.id === batchId ? { ...r, ...patch } : r) } : prev,
    );
  };

  const pageStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalCount);

  return (
    <AppShell variant="store">
      <PageHeader title={`Batch Control${totalCount ? ` (${totalCount.toLocaleString()})` : ""}`} description="Transfer · Adjust · Merge · Split · Recall · Edit Expiry" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Ban} label="Recalled batches" value={String(kpis.data?.recalledBatches ?? 0)} />
        <StatCard icon={Ban} label="Locked batches" value={String(kpis.data?.lockedBatches ?? 0)} />
        <StatCard icon={RefreshCw} label="Adjusted units (30d)" value={String(kpis.data?.adjustedUnits30d ?? 0)} />
        <StatCard icon={ArrowRightLeft} label="Transferred units (30d)" value={String(kpis.data?.transferredUnits30d ?? 0)} />
      </div>

      <Tabs defaultValue="company-returns">
        <TabsList>
          <TabsTrigger value="company-returns">মেয়াদ ও ফেরত (Company Returns)</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
          <TabsTrigger value="recalls">Recall log</TabsTrigger>
        </TabsList>

        <TabsContent value="company-returns">
          <CompanyReturnsTab batches={rows as any} tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="batches">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle>Batches</CardTitle>
              <div className="flex gap-2 flex-wrap items-center">
                <Input
                  placeholder="Search product / generic / manufacturer / SKU / barcode / batch"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-80"
                />
                <Select value={sort} onValueChange={(v) => { setSort(v as SortKey); setPage(1); }}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nearest_expiry">Nearest expiry</SelectItem>
                    <SelectItem value="latest_expiry">Latest expiry</SelectItem>
                    <SelectItem value="stock_desc">Stock: High → Low</SelectItem>
                    <SelectItem value="stock_asc">Stock: Low → High</SelectItem>
                    <SelectItem value="newest">Newest batch</SelectItem>
                    <SelectItem value="oldest">Oldest batch</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v) as PageSize); setPage(1); }}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[50, 100, 250, 500].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setDialog("supplier-recall")}>Supplier recall</Button>
              </div>
            </CardHeader>
            <CardContent>
              {batches.isLoading && !batches.data ? <Loader2 className="animate-spin" /> : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Generic</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Barcode</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">Purchase</TableHead>
                        <TableHead className="text-right">Sale</TableHead>
                        <TableHead className="text-right">MRP</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((b) => {
                        const tone = expiryTone(b.expiry_date);
                        const toneCls = tone === "expired" ? "text-red-600 font-medium"
                          : tone === "soon" ? "text-orange-600 font-medium"
                          : "text-emerald-700";
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="max-w-[220px]">
                              <div className="truncate">{b.products ? buildProductDisplayName({ name: b.products.name ?? "—", strength: b.products.strength, medicine_type: b.products.medicine_type, volume: b.products.volume, pack_size: b.products.pack_size }) : "—"}</div>
                              <div className="text-xs text-muted-foreground truncate">{b.products?.manufacturer_name ?? ""}</div>
                            </TableCell>
                            <TableCell className="text-xs">{b.products?.generic_name ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{b.products?.sku ?? "—"}</TableCell>
                            <TableCell className="font-mono text-xs">{b.products?.barcode ?? "—"}</TableCell>
                            <TableCell className="font-mono">{b.batch_no}</TableCell>
                            <TableCell className="text-right tabular-nums">{b.purchase_price != null ? Number(b.purchase_price).toFixed(2) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{b.products?.sale_price != null ? Number(b.products.sale_price).toFixed(2) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{b.mrp != null ? Number(b.mrp).toFixed(2) : "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{Number(b.qty_on_hand).toLocaleString()}</TableCell>
                            <TableCell className={toneCls}>
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">{formatMonthYear(b.expiry_date)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>{formatFullDate(b.expiry_date)}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell className="text-xs">{b.supplier_name ?? "—"}</TableCell>
                            <TableCell className="text-xs">{b.warehouse_name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={b.status === "active" ? "secondary" : "destructive"}>{b.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1 flex-wrap">
                                <Button size="sm" variant="outline" onClick={() => { setSelected(b); setDialog("edit-expiry"); }}>
                                  <Pencil className="w-3.5 h-3.5 mr-1" />Edit Expiry
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setSelected(b); setDialog("transfer"); }}>Transfer</Button>
                                <Button size="sm" variant="outline" onClick={() => { setSelected(b); setDialog("adjust"); }}>Adjust</Button>
                                <Button size="sm" variant="outline" onClick={() => { setSelected(b); setDialog("split"); }}>Split</Button>
                                <Button size="sm" variant="outline" onClick={() => { setSelected(b); setDialog("merge"); }}>Merge</Button>
                                <Button size="sm" variant="destructive" onClick={() => { setSelected(b); setDialog("recall"); }}>Recall</Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {rows.length === 0 && !batches.isFetching && (
                        <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">No batches found.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>


                  <div className="flex items-center justify-between mt-4 text-sm">
                    <div className="text-muted-foreground">
                      {totalCount > 0 ? <>Showing <b>{pageStart.toLocaleString()}</b>–<b>{pageEnd.toLocaleString()}</b> of <b>{totalCount.toLocaleString()}</b></> : "No results"}
                      {batches.isFetching && <Loader2 className="inline w-3 h-3 ml-2 animate-spin" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={page <= 1 || batches.isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                        <ChevronLeft className="w-4 h-4" /> Prev
                      </Button>
                      <span>Page <b>{page}</b> / {Math.max(1, totalPages)}</span>
                      <Button size="sm" variant="outline" disabled={page >= totalPages || batches.isFetching} onClick={() => setPage((p) => p + 1)}>
                        Next <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recalls">
          <Card><CardContent className="pt-4">
            {recalls.isLoading ? <Loader2 className="animate-spin" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Batch</TableHead>
                  <TableHead>Reason</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {recalls.data?.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.recall_date}</TableCell>
                      <TableCell>{r.batches?.products ? buildProductDisplayName(r.batches.products) : "—"}</TableCell>
                      <TableCell className="font-mono">{r.batches?.batch_no}</TableCell>
                      <TableCell>{r.recall_reason}</TableCell>
                      <TableCell>{r.recall_source}</TableCell>
                      <TableCell className="text-right">{Number(r.qty_locked).toLocaleString()}</TableCell>
                      <TableCell><Badge>{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {selected && dialog === "edit-expiry" && (
        <EditExpiryDialog
          tenantId={tenantId}
          batch={selected}
          onClose={() => setDialog(null)}
          onSaved={(newExpiry) => { void refreshRow(selected.id, { expiry_date: newExpiry }); }}
        />
      )}
      {selected && dialog === "transfer" && (
        <TransferDialog tenantId={tenantId} batch={selected} onClose={() => setDialog(null)} onDone={invalidateAll} />
      )}
      {selected && dialog === "adjust" && (
        <AdjustDialog tenantId={tenantId} batch={selected} onClose={() => setDialog(null)} onDone={invalidateAll} />
      )}
      {selected && dialog === "split" && (
        <SplitDialog tenantId={tenantId} batch={selected} onClose={() => setDialog(null)} onDone={invalidateAll} />
      )}
      {selected && dialog === "merge" && (
        <MergeDialog tenantId={tenantId} batch={selected} all={rows} onClose={() => setDialog(null)} onDone={invalidateAll} />
      )}
      {selected && dialog === "recall" && (
        <RecallDialog tenantId={tenantId} batch={selected} onClose={() => setDialog(null)} onDone={invalidateAll} />
      )}
      {dialog === "supplier-recall" && (
        <SupplierRecallDialog tenantId={tenantId} onClose={() => setDialog(null)} onDone={invalidateAll} />
      )}
    </AppShell>
  );
}

function EditExpiryDialog({ tenantId, batch, onClose, onSaved }: { tenantId: string; batch: BatchRow; onClose: () => void; onSaved: (newExpiry: string) => void }) {
  const [expiry, setExpiry] = useState(batch.expiry_date ?? "");
  const [reason, setReason] = useState("");
  const fn = useServerFn(updateBatchExpiry);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const minDate = batch.mfg_date && batch.mfg_date > today ? batch.mfg_date : today;

  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, batchId: batch.id, newExpiry: expiry, reason: reason || undefined } }),
    onSuccess: () => { toast.success("Expiry updated successfully"); onSaved(expiry); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const invalid = !expiry || expiry < today || (batch.mfg_date && expiry <= batch.mfg_date);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Batch Expiry</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><div className="text-muted-foreground text-xs">Product</div><div>{batch.products?.name ?? "—"}</div></div>
            <div><div className="text-muted-foreground text-xs">Batch #</div><div className="font-mono">{batch.batch_no}</div></div>
            <div><div className="text-muted-foreground text-xs">Current expiry</div><div>{formatMonthYear(batch.expiry_date)}</div></div>
            <div><div className="text-muted-foreground text-xs">Stock</div><div>{Number(batch.qty_on_hand).toLocaleString()}</div></div>
            <div><div className="text-muted-foreground text-xs">Purchase price</div><div>{batch.purchase_price ?? "—"}</div></div>
            <div><div className="text-muted-foreground text-xs">MRP</div><div>{batch.mrp ?? "—"}</div></div>
            <div><div className="text-muted-foreground text-xs">Sale price</div><div>{batch.products?.sale_price ?? "—"}</div></div>
            <div><div className="text-muted-foreground text-xs">Warehouse</div><div>{batch.warehouse_name ?? "—"}</div></div>
            <div className="col-span-2"><div className="text-muted-foreground text-xs">Supplier</div><div>{batch.supplier_name ?? "—"}</div></div>
          </div>

          <div className="pt-2">
            <Label>New expiry (MM/YYYY)</Label>
            <ExpiryMonthInput
              value={expiry}
              onChange={setExpiry}
              onEnter={() => { if (!invalid) m.mutate(); }}
              minISO={minDate}
              autoFocus
            />
            {expiry && <p className="text-xs text-muted-foreground mt-1">Saves as {formatFullDate(expiry)}.</p>}
            {batch.mfg_date && <p className="text-xs text-muted-foreground mt-1">Must be after manufacture date ({formatMonthYear(batch.mfg_date)}).</p>}
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. corrected from label" onKeyDown={(e) => { if (e.key === "Enter" && !invalid) m.mutate(); }} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !!invalid}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}




function TransferDialog({ tenantId, batch, onClose, onDone }: { tenantId: string; batch: BatchRow; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState("");
  const [toBranch, setToBranch] = useState(""); // free-text uuid; branches selector wired in app shell elsewhere
  const [notes, setNotes] = useState("");
  const fn = useServerFn(transferBatch);
  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, batchId: batch.id, qty: Number(qty), fromBranchId: batch.branch_id, toBranchId: toBranch || null, notes } }),
    onSuccess: () => { toast.success("Transferred"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Transfer batch {batch.batch_no}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Quantity (max {batch.qty_on_hand})</Label>
          <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Label>Destination branch ID</Label>
          <Input placeholder="warehouse / branch UUID (blank = main)" value={toBranch} onChange={(e) => setToBranch(e.target.value)} />
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !qty}>Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ tenantId, batch, onClose, onDone }: { tenantId: string; batch: BatchRow; onClose: () => void; onDone: () => void }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<"damage" | "shrinkage" | "found" | "manual">("manual");
  const [notes, setNotes] = useState("");
  const fn = useServerFn(adjustBatch);
  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, batchId: batch.id, delta: Number(delta), reason, notes } }),
    onSuccess: () => { toast.success("Adjusted"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adjust batch {batch.batch_no}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Delta (use negative to reduce; current {batch.qty_on_hand})</Label>
          <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
          <Label>Reason</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as never)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="damage">Damage</SelectItem>
              <SelectItem value="shrinkage">Shrinkage</SelectItem>
              <SelectItem value="found">Found stock</SelectItem>
              <SelectItem value="manual">Manual correction</SelectItem>
            </SelectContent>
          </Select>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !delta}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitDialog({ tenantId, batch, onClose, onDone }: { tenantId: string; batch: BatchRow; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState("");
  const [newNo, setNewNo] = useState("");
  const fn = useServerFn(splitBatch);
  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, batchId: batch.id, qty: Number(qty), newBatchNo: newNo || undefined } }),
    onSuccess: () => { toast.success("Split done"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Split batch {batch.batch_no}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Split off qty (max {batch.qty_on_hand - 1})</Label>
          <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Label>New batch # (optional)</Label>
          <Input value={newNo} onChange={(e) => setNewNo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !qty}>Split</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ tenantId, batch, all, onClose, onDone }: { tenantId: string; batch: BatchRow; all: BatchRow[]; onClose: () => void; onDone: () => void }) {
  const [dst, setDst] = useState("");
  const candidates = all.filter((b) => b.id !== batch.id && b.product_id === batch.product_id && b.expiry_date === batch.expiry_date && Number(b.purchase_price) === Number(batch.purchase_price));
  const fn = useServerFn(mergeBatches);
  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, srcBatchId: batch.id, dstBatchId: dst } }),
    onSuccess: () => { toast.success("Merged"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Merge batch {batch.batch_no} into…</DialogTitle></DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No compatible batches (same product, expiry, cost).</p>
        ) : (
          <Select value={dst} onValueChange={setDst}>
            <SelectTrigger><SelectValue placeholder="Pick destination batch" /></SelectTrigger>
            <SelectContent>
              {candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.batch_no} · qty {c.qty_on_hand}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !dst}><GitMerge className="w-4 h-4 mr-1" />Merge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecallDialog({ tenantId, batch, onClose, onDone }: { tenantId: string; batch: BatchRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [source, setSource] = useState<"manufacturer" | "supplier" | "regulator" | "internal" | "other">("manufacturer");
  const [notes, setNotes] = useState("");
  const fn = useServerFn(recallBatch);
  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, batchId: batch.id, reason, source, notes } }),
    onSuccess: () => { toast.success("Batch recalled & locked"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Recall batch {batch.batch_no}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          <Label>Source</Label>
          <Select value={source} onValueChange={(v) => setSource(v as never)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manufacturer">Manufacturer</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
              <SelectItem value="regulator">Regulator</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending || reason.length < 2}>Lock & recall</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupplierRecallDialog({ tenantId, onClose, onDone }: { tenantId: string; onClose: () => void; onDone: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const fn = useServerFn(recallSupplierBatches);
  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, supplierId, reason, source: "supplier", notes } }),
    onSuccess: (r) => { toast.success(`Recalled ${r.recalled} batches`); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Supplier-wide recall</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>Supplier ID</Label>
          <Input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="supplier UUID" />
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => m.mutate()} disabled={m.isPending || !supplierId || reason.length < 2}>Recall all batches</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
