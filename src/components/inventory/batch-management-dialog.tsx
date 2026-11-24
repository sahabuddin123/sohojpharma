import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format, differenceInDays, parseISO, isValid } from "date-fns";
import {
  CalendarIcon, Loader2, Lock, LockOpen, Pencil, Printer, Search,
  ShieldAlert, Trash2, X, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listProductBatches, updateBatchExpiry, setBatchStatus, softDeleteBatch,
  type ProductBatchRow,
} from "@/lib/api/product-batches.functions";
import { recallBatch } from "@/lib/api/batch-control.functions";
import { ExpiryMonthInput, formatMonthYear, formatFullDate } from "@/components/inventory/expiry-month-input";

type SortKey = "nearest" | "latest" | "highest_stock" | "lowest_stock" | "newest" | "oldest";

function expiryTone(expiry: string): { label: string; className: string } {
  const d = parseISO(expiry);
  if (!isValid(d)) return { label: "Unknown", className: "bg-muted text-muted-foreground" };
  const days = differenceInDays(d, new Date());
  if (days < 0) return { label: "Expired", className: "bg-red-100 text-red-700 border-red-200" };
  if (days <= 30) return { label: `${days}d left`, className: "bg-orange-100 text-orange-700 border-orange-200" };
  if (days <= 90) return { label: `${days}d left`, className: "bg-yellow-100 text-yellow-800 border-yellow-200" };
  return { label: "Healthy", className: "bg-green-100 text-green-700 border-green-200" };
}

export function BatchManagementDialog({
  tenantId, productId, productName, open, onOpenChange,
}: {
  tenantId: string; productId: string; productName: string;
  open: boolean; onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProductBatches);
  const updExpFn = useServerFn(updateBatchExpiry);
  const statusFn = useServerFn(setBatchStatus);
  const deleteFn = useServerFn(softDeleteBatch);
  const recallFn = useServerFn(recallBatch);

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nearest");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIso, setEditIso] = useState<string>("");
  const [reason, setReason] = useState("");

  const queryKey = ["product-batches", tenantId, productId];
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    enabled: open && !!productId,
    queryFn: () => listFn({ data: { tenantId, productId } }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list: ProductBatchRow[] = rows;
    if (q) {
      list = list.filter((r) =>
        r.batch_no.toLowerCase().includes(q) ||
        (r.expiry_date ?? "").toLowerCase().includes(q) ||
        (r.warehouse_name ?? "").toLowerCase().includes(q) ||
        (r.supplier_name ?? "").toLowerCase().includes(q)
      );
    }
    const arr = [...list];
    switch (sortKey) {
      case "nearest": arr.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)); break;
      case "latest": arr.sort((a, b) => b.expiry_date.localeCompare(a.expiry_date)); break;
      case "highest_stock": arr.sort((a, b) => b.qty_on_hand - a.qty_on_hand); break;
      case "lowest_stock": arr.sort((a, b) => a.qty_on_hand - b.qty_on_hand); break;
      case "newest": arr.sort((a, b) => b.created_at.localeCompare(a.created_at)); break;
      case "oldest": arr.sort((a, b) => a.created_at.localeCompare(b.created_at)); break;
    }
    return arr;
  }, [rows, search, sortKey]);

  const summary = useMemo(() => {
    const now = new Date();
    let totalStock = 0, expired = 0;
    let nearest: string | null = null;
    for (const r of rows) {
      totalStock += r.qty_on_hand;
      const d = parseISO(r.expiry_date);
      if (isValid(d)) {
        if (d < now) expired += 1;
        if (!nearest || r.expiry_date < nearest) nearest = r.expiry_date;
      }
    }
    return { total: rows.length, totalStock, nearest, expired };
  }, [rows]);

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const updExp = useMutation({
    mutationFn: (v: { batchId: string; newExpiry: string; reason?: string }) =>
      updExpFn({ data: { tenantId, ...v } }),
    onSuccess: () => {
      toast.success("Expiry updated");
      setEditingId(null); setEditIso(""); setReason("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: (v: { batchId: string; status: "active" | "locked" }) =>
      statusFn({ data: { tenantId, ...v } }),
    onSuccess: () => { toast.success("Status updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (batchId: string) => deleteFn({ data: { tenantId, batchId } }),
    onSuccess: () => { toast.success("Batch deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const recall = useMutation({
    mutationFn: (batchId: string) => recallFn({ data: {
      tenantId, batchId, reason: "Manual recall from Batch Management",
      source: "internal",
    } }),
    onSuccess: () => { toast.success("Batch recalled"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (r: ProductBatchRow) => {
    setEditingId(r.id);
    setEditIso(r.expiry_date);
    setReason("");
  };

  const saveEdit = (r: ProductBatchRow) => {
    if (!editIso) { toast.error("Enter expiry as MM/YYYY"); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (editIso < today) { toast.error("Expiry must be in the future"); return; }
    if (r.mfg_date && editIso <= r.mfg_date) {
      toast.error("Expiry must be after manufacture date"); return;
    }
    updExp.mutate({ batchId: r.id, newExpiry: editIso, reason: reason || undefined });
  };

  const printLabel = (r: ProductBatchRow) => {
    const w = window.open("", "_blank", "width=420,height=280");
    if (!w) return;
    w.document.write(`<html><head><title>Batch ${r.batch_no}</title>
      <style>body{font-family:system-ui;padding:16px;font-size:12px}
      h1{font-size:14px;margin:0 0 8px} .row{margin:2px 0}</style></head>
      <body><h1>${productName}</h1>
      <div class="row"><b>Batch:</b> ${r.batch_no}</div>
      <div class="row"><b>Expiry:</b> ${r.expiry_date}</div>
      ${r.mfg_date ? `<div class="row"><b>Mfg:</b> ${r.mfg_date}</div>` : ""}
      <div class="row"><b>Qty:</b> ${r.qty_on_hand}</div>
      <div class="row"><b>MRP:</b> ${r.mrp ?? "-"}</div>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Batch Management — {productName}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Manage batches, expiry dates and stock for this product.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total Batches" value={summary.total} />
          <SummaryCard label="Total Stock" value={summary.totalStock} />
          <SummaryCard label="Nearest Expiry" value={summary.nearest ?? "—"} />
          <SummaryCard label="Expired Batches" value={summary.expired} tone={summary.expired > 0 ? "danger" : undefined} />
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search batch, expiry, warehouse, supplier"
              className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nearest">Nearest expiry</SelectItem>
              <SelectItem value="latest">Latest expiry</SelectItem>
              <SelectItem value="highest_stock">Highest stock</SelectItem>
              <SelectItem value="lowest_stock">Lowest stock</SelectItem>
              <SelectItem value="newest">Newest batch</SelectItem>
              <SelectItem value="oldest">Oldest batch</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 max-h-[55vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch No</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Mfg</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Purchase</TableHead>
                <TableHead className="text-right">MRP</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={12} className="py-8 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                  No batches
                </TableCell></TableRow>
              ) : filtered.map((r) => {
                const tone = expiryTone(r.expiry_date);
                const isEditing = editingId === r.id;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.batch_no}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex flex-col gap-1 min-w-[220px]">
                          <ExpiryMonthInput
                            value={editIso}
                            onChange={setEditIso}
                            onEnter={() => saveEdit(r)}
                            minISO={(r.mfg_date && r.mfg_date > new Date().toISOString().slice(0, 10)) ? r.mfg_date : new Date().toISOString().slice(0, 10)}
                            autoFocus
                          />
                          <div className="flex items-center gap-1">
                            <Input placeholder="Reason (optional)" value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(r); if (e.key === "Escape") { setEditingId(null); setEditIso(""); } }}
                              className="h-8 flex-1" />
                            <Button size="icon" variant="ghost" className="h-8 w-8"
                              disabled={updExp.isPending} onClick={() => saveEdit(r)}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8"
                              onClick={() => { setEditingId(null); setEditIso(""); }}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2" title={formatFullDate(r.expiry_date)}>
                          <span>{formatMonthYear(r.expiry_date)}</span>
                          <Badge variant="outline" className={cn("text-[10px]", tone.className)}>{tone.label}</Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{r.mfg_date ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.qty_on_hand}</TableCell>
                    <TableCell className="text-right">৳ {r.purchase_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">৳ {(r.mrp ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{r.warehouse_name ?? "—"}</TableCell>
                    <TableCell>{r.supplier_name ?? "—"}</TableCell>
                    <TableCell><Badge variant="secondary">{r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.created_at.slice(0, 10)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.updated_at.slice(0, 10)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {!isEditing && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit expiry"
                            onClick={() => startEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Print label"
                          onClick={() => printLabel(r)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8"
                          title={r.status === "locked" ? "Unlock" : "Lock"}
                          disabled={toggleStatus.isPending}
                          onClick={() => toggleStatus.mutate({
                            batchId: r.id, status: r.status === "locked" ? "active" : "locked",
                          })}>
                          {r.status === "locked" ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-orange-600" title="Recall"
                          disabled={recall.isPending || r.status === "recalled"}
                          onClick={() => {
                            if (confirm(`Recall batch ${r.batch_no}?`)) recall.mutate(r.id);
                          }}>
                          <ShieldAlert className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" title="Delete"
                          disabled={del.isPending}
                          onClick={() => {
                            if (confirm(`Delete batch ${r.batch_no}?`)) del.mutate(r.id);
                          }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone?: "danger" }) {
  return (
    <div className={cn("rounded-md border p-3", tone === "danger" && "border-red-200 bg-red-50")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
