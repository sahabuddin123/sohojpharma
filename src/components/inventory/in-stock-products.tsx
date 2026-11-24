import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUpDown, Loader2, Package, Pencil, SlidersHorizontal, Search, Zap, Box, Camera } from "lucide-react";
import { CartonScannerDialog } from "@/components/inventory/carton-scanner-dialog";
import { BatchManagementDialog } from "@/components/inventory/batch-management-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { updateProductPricing } from "@/lib/api/product-management.functions";
import { adjustBatch } from "@/lib/api/batch-control.functions";
import {
  listInventoryInStockProducts,
  type InventoryInStockRow,
  type InventoryInStockSortBy,
  type InventoryInStockSortDir,
} from "@/lib/api/inventory.functions";

type Row = InventoryInStockRow;

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const;
const PAGE_SIZE_STORAGE_KEY = "inventory-in-stock-page-size";
function pageWindow(page: number, totalPages: number) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function InStockProductsSection({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listInventoryInStockProducts);
  const updateFn = useServerFn(updateProductPricing);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === "undefined") return 50;
    const saved = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
    return PAGE_SIZE_OPTIONS.includes(saved as (typeof PAGE_SIZE_OPTIONS)[number]) ? saved : 50;
  });
  const [sortBy, setSortBy] = useState<InventoryInStockSortBy>("name");
  const [sortDir, setSortDir] = useState<InventoryInStockSortDir>("asc");
  const [jumpPage, setJumpPage] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "low" | "expiring">("all");
  const [cartonOpen, setCartonOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["in-stock-products", tenantId, search, page, pageSize, sortBy, sortDir],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenantId, search, page, pageSize, sortBy, sortDir } }),
    placeholderData: (previous) => previous,
  });

  const rows = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const currentPage = data?.currentPage ?? page;
  const totalPages = data?.totalPages ?? 1;
  const pages = pageWindow(currentPage, totalPages);

  useEffect(() => {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
  }, [pageSize]);

  const changeSort = (nextSort: InventoryInStockSortBy) => {
    if (sortBy === nextSort) {
      setSortDir((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortBy(nextSort);
      setSortDir("asc");
    }
    setPage(1);
  };

  const goToPage = (nextPage: number) => {
    const bounded = Math.min(Math.max(1, nextPage), totalPages);
    setPage(bounded);
  };

  const submitJump = () => {
    const next = Number(jumpPage);
    if (Number.isFinite(next)) goToPage(Math.trunc(next));
    setJumpPage("");
  };

  const [editing, setEditing] = useState<Row | null>(null);
  const [adjustFor, setAdjustFor] = useState<Row | null>(null);
  const [quickFor, setQuickFor] = useState<Row | null>(null);
  const [batchFor, setBatchFor] = useState<Row | null>(null);
  const [pPrice, setPPrice] = useState("");
  const [rPrice, setRPrice] = useState("");

  const openEdit = (r: Row) => {
    setEditing(r);
    setPPrice(String(r.purchase_price ?? 0));
    setRPrice(String(r.retail_price ?? 0));
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      await updateFn({
        data: {
          tenantId,
          id: editing.id,
          purchase_price: Number(pPrice) || 0,
          retail_price: Number(rPrice) || 0,
        },
      });
    },
    onSuccess: () => {
      toast.success("Price updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["in-stock-products"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update price"),
  });

  return (
    <>
      <Card className="mt-6 shadow-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">In-Stock Products ({totalCount.toLocaleString()})</CardTitle>
              {/* Filter Tabs: [সব] [কম (Low)] [মেয়াদ (Expiring)] */}
              <div className="inline-flex rounded-lg bg-muted/80 p-0.5 border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setFilterTab("all")}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${filterTab === "all" ? "bg-emerald-700 text-white shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
                >
                  সব ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab("low")}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${filterTab === "low" ? "bg-amber-600 text-white shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
                >
                  কম (Low Stock)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab("expiring")}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${filterTab === "expiring" ? "bg-rose-600 text-white shadow-2xs" : "text-muted-foreground hover:text-foreground"}`}
                >
                  মেয়াদ (Expiring)
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()} · Showing only this page
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCartonOpen(true)}
              className="gap-1.5 text-xs font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 shrink-0"
            >
              <Camera className="h-3.5 w-3.5" /> কার্টন স্ক্যান
            </Button>
            <div className="relative flex-1 sm:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search product, Bangla name, SKU, barcode, batch..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : totalCount === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No in-stock products found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Product" active={sortBy === "name"} dir={sortDir} onClick={() => changeSort("name")} />
                  <SortableHead label="SKU" active={sortBy === "sku"} dir={sortDir} onClick={() => changeSort("sku")} />
                  <TableHead>Barcode</TableHead>
                  <SortableHead label="Manufacturer" active={sortBy === "manufacturer"} dir={sortDir} onClick={() => changeSort("manufacturer")} />
                  <SortableHead label="Generic" active={sortBy === "generic"} dir={sortDir} onClick={() => changeSort("generic")} />
                  <SortableHead label="Stock (পাতা • পিস)" align="right" active={sortBy === "stock"} dir={sortDir} onClick={() => changeSort("stock")} />
                  <TableHead className="text-right">মূল্য ও লাভ (TP · MRP · Profit %)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows
                  .filter((r) => {
                    if (filterTab === "low") return (r.stock ?? 0) <= 20;
                    return true;
                  })
                  .map((r) => {
                    const tp = Number(r.purchase_price ?? 0);
                    const mrp = Number(r.retail_price ?? r.mrp ?? 0);
                    const profitPct = mrp > tp && mrp > 0 ? Math.round(((mrp - tp) / mrp) * 100) : 0;
                    const totalPcs = Number(r.stock ?? 0);
                    const pata = Math.floor(totalPcs / 10);
                    const extraPcs = totalPcs % 10;
                    const stockFormatted = totalPcs > 10 ? `${pata} পাতা + ${extraPcs} (${totalPcs} পিস)` : `${totalPcs} পিস`;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.name}</div>
                          {(r.name_bn || r.category_name || r.medicine_type_name) && (
                            <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                              {[r.name_bn, r.category_name, r.medicine_type_name].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.sku ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.barcode ?? "-"}</TableCell>
                        <TableCell>{r.manufacturer_name ?? "-"}</TableCell>
                        <TableCell>{r.generic_name ?? "-"}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="font-semibold text-xs">
                            {stockFormatted}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-bold text-foreground">MRP ৳{mrp.toFixed(2)}</span>
                            <span className="text-[11px] text-muted-foreground">TP ৳{tp.toFixed(2)}</span>
                            {profitPct > 0 && (
                              <span className="mt-0.5 inline-block text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded-sm">
                                {profitPct}% লাভ
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => setQuickFor(r)}>
                              <Zap className="mr-1 h-3.5 w-3.5" /> Quick Edit
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setBatchFor(r)}>
                              <Package className="mr-1 h-3.5 w-3.5" /> Batch
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setAdjustFor(r)}>
                              <SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> Adjust
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" /> Price
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}

          <CartonScannerDialog
            open={cartonOpen}
            onOpenChange={setCartonOpen}
            onDataDetected={(data) => {
              toast.success(`কার্টন স্ক্যান সফল: ব্যাচ ${data.batchNo}, মেয়াদ ${data.expiry}, MRP ৳${data.mrp}`);
            }}
          />

          <div className="mt-4 flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
                </SelectContent>
              </Select>
              <span>Total pages: {totalPages.toLocaleString()}</span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="outline" disabled={currentPage <= 1 || isLoading} onClick={() => goToPage(currentPage - 1)}>Previous</Button>
              {pages[0] > 1 && (
                <>
                  <Button size="sm" variant="ghost" disabled={isLoading} onClick={() => goToPage(1)}>1</Button>
                  {pages[0] > 2 && <span className="px-1 text-muted-foreground">…</span>}
                </>
              )}
              {pages.map((p) => (
                <Button key={p} size="sm" variant={p === currentPage ? "default" : "outline"} disabled={isLoading} onClick={() => goToPage(p)}>
                  {p}
                </Button>
              ))}
              {pages[pages.length - 1] < totalPages && (
                <>
                  {pages[pages.length - 1] < totalPages - 1 && <span className="px-1 text-muted-foreground">…</span>}
                  <Button size="sm" variant="ghost" disabled={isLoading} onClick={() => goToPage(totalPages)}>{totalPages.toLocaleString()}</Button>
                </>
              )}
              <Button size="sm" variant="outline" disabled={currentPage >= totalPages || isLoading} onClick={() => goToPage(currentPage + 1)}>Next</Button>
              <div className="flex items-center gap-2 pl-0 sm:pl-2">
                <Input
                  className="h-9 w-24"
                  inputMode="numeric"
                  placeholder="Page"
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") submitJump(); }}
                />
                <Button size="sm" variant="outline" disabled={!jumpPage || isLoading} onClick={submitJump}>Go</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Price — {editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Purchase Price</Label>
              <Input type="number" min="0" step="0.01" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
            </div>
            <div>
              <Label>Retail Price</Label>
              <Input type="number" min="0" step="0.01" value={rPrice} onChange={(e) => setRPrice(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {adjustFor && (
        <AdjustStockDialog
          tenantId={tenantId}
          product={adjustFor}
          onClose={() => setAdjustFor(null)}
          onDone={() => {
            setAdjustFor(null);
            qc.invalidateQueries({ queryKey: ["in-stock-products"] });
            qc.invalidateQueries({ queryKey: ["inventory-overview"] });
          }}
        />
      )}

      {quickFor && (
        <QuickEditDialog
          tenantId={tenantId}
          product={quickFor}
          onClose={() => setQuickFor(null)}
          onDone={() => {
            setQuickFor(null);
            qc.invalidateQueries({ queryKey: ["in-stock-products"] });
            qc.invalidateQueries({ queryKey: ["inventory-overview"] });
          }}
        />
      )}

      {batchFor && (
        <BatchManagementDialog
          tenantId={tenantId}
          productId={batchFor.id}
          productName={batchFor.name}
          open={!!batchFor}
          onOpenChange={(o) => { if (!o) setBatchFor(null); }}
        />
      )}
    </>
  );
}

function SortableHead({
  label, active, dir, onClick, align = "left",
}: {
  label: string;
  active: boolean;
  dir: InventoryInStockSortDir;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={align === "right" ? "ml-auto h-8 px-2" : "h-8 px-2"}
        onClick={onClick}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <ArrowUpDown className="ml-1 h-3.5 w-3.5" />
        {active && <span className="ml-1 text-xs">{dir === "asc" ? "↑" : "↓"}</span>}
      </Button>
    </TableHead>
  );
}

type BatchOpt = { id: string; batch_no: string; qty_on_hand: number; expiry_date: string | null };

function AdjustStockDialog({
  tenantId, product, onClose, onDone,
}: { tenantId: string; product: Row; onClose: () => void; onDone: () => void }) {
  const adjustFn = useServerFn(adjustBatch);
  const [batchId, setBatchId] = useState<string>("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<"damage" | "shrinkage" | "found" | "manual">("manual");
  const [notes, setNotes] = useState("");

  const { data: batches, isLoading } = useQuery({
    queryKey: ["adjust-batches", tenantId, product.id],
    queryFn: async (): Promise<BatchOpt[]> => {
      const { data, error } = await supabase
        .from("batches")
        .select("id,batch_no,qty_on_hand,expiry_date")
        .eq("tenant_id", tenantId)
        .eq("product_id", product.id)
        .gt("qty_on_hand", 0)
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BatchOpt[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const d = Number(delta);
      if (!batchId) throw new Error("Select a batch");
      if (!d || Number.isNaN(d)) throw new Error("Enter a non-zero delta");
      await adjustFn({ data: { tenantId, batchId, delta: d, reason, notes: notes || undefined } });
    },
    onSuccess: () => { toast.success("Stock adjusted"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const selected = batches?.find((b) => b.id === batchId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Stock — {product.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading batches...
          </div>
        ) : !batches || batches.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No active batches found.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Batch</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_no} — Qty {b.qty_on_hand}{b.expiry_date ? ` · exp ${b.expiry_date}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Delta (use negative to reduce{selected ? `, current ${selected.qty_on_hand}` : ""})</Label>
              <Input type="number" step="1" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 10 or -5" />
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="shrinkage">Shrinkage</SelectItem>
                  <SelectItem value="found">Found</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !batchId}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickEditDialog({
  tenantId, product, onClose, onDone,
}: { tenantId: string; product: Row; onClose: () => void; onDone: () => void }) {
  const adjustFn = useServerFn(adjustBatch);
  const updateFn = useServerFn(updateProductPricing);
  const [stock, setStock] = useState(String(product.stock));
  const [pPrice, setPPrice] = useState(String(product.purchase_price ?? 0));
  const [rPrice, setRPrice] = useState(String(product.retail_price ?? 0));

  const { data: batches, isLoading } = useQuery({
    queryKey: ["quick-batches", tenantId, product.id],
    queryFn: async (): Promise<BatchOpt[]> => {
      const { data, error } = await supabase
        .from("batches")
        .select("id,batch_no,qty_on_hand,expiry_date")
        .eq("tenant_id", tenantId)
        .eq("product_id", product.id)
        .order("qty_on_hand", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BatchOpt[];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const newStock = Number(stock);
      const delta = newStock - product.stock;
      if (delta !== 0) {
        const target = batches?.find((b) => b.qty_on_hand > 0) ?? batches?.[0];
        if (!target) throw new Error("No batch exists. Add opening stock from Product Edit first.");
        if (delta < 0 && Math.abs(delta) > target.qty_on_hand) {
          throw new Error(`Cannot reduce more than batch qty (${target.qty_on_hand})`);
        }
        await adjustFn({ data: { tenantId, batchId: target.id, delta, reason: "manual", notes: "Quick edit" } });
      }
      await updateFn({
        data: {
          tenantId,
          id: product.id,
          purchase_price: Number(pPrice) || 0,
          retail_price: Number(rPrice) || 0,
        },
      });
    },
    onSuccess: () => { toast.success("Updated"); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick Edit — {product.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Opening Stock (current: {product.stock})</Label>
              <Input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Adjusts the largest active batch by the difference.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Purchase Price</Label>
                <Input type="number" min="0" step="0.01" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
              </div>
              <div>
                <Label>Selling Price</Label>
                <Input type="number" min="0" step="0.01" value={rPrice} onChange={(e) => setRPrice(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || isLoading}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
