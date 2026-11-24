import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Loader2, Check, X, PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { listRequisitions, createRequisition, updateRequisitionStatus, listBranchesForProducts, listProductsForManagement } from "@/lib/api/product-management.functions";
import { RouteErrorPanel } from "@/components/route-error";
import { buildProductDisplayName } from "@/lib/product-display";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/products/requisitions")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Requisitions — SohojPharma" }, { name: "description", content: "Branch-to-branch stock requisitions." }] }),
  component: ReqPage,
});

type Item = { id: string; requested_qty: number; approved_qty: number | null; received_qty: number | null; products: { name: string; sku: string | null } | null };
type Row = { id: string; requisition_no: string; status: string; notes: string | null; created_at: string; from_branch: { name: string } | null; to_branch: { name: string } | null; requisition_items: Item[] | null };
const PAGE = 25;
const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = { pending: "outline", approved: "default", received: "default", rejected: "destructive", cancelled: "secondary" };

function ReqPage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const list = useServerFn(listRequisitions);
  const updateStatus = useServerFn(updateRequisitionStatus);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["requisitions", tenantId, search, status, page],
    enabled: !!tenantId,
    queryFn: () => list({ data: { tenantId, search: search || undefined, status: status === "all" ? undefined : status, page, pageSize: PAGE } }),
  });
  const m = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "rejected" | "received" | "cancelled" }) => updateStatus({ data: { tenantId, ...v } }),
    onSuccess: () => { toast.success(t("toast.updated")); qc.invalidateQueries({ queryKey: ["requisitions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data?.rows ?? []) as Row[];
  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <AppShell variant="store" title="Requisitions">
      <PageHeader title="Requisitions" description={`${total} stock requisitions`} actions={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New Requisition</Button>} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search requisition no" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>Req No</TableHead><TableHead>From → To</TableHead><TableHead>Items</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No requisitions</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.requisition_no}</TableCell>
                    <TableCell className="text-sm">{r.from_branch?.name ?? "—"} → {r.to_branch?.name ?? "—"}</TableCell>
                    <TableCell>{r.requisition_items?.length ?? 0}</TableCell>
                    <TableCell><Badge variant={STATUS_COLORS[r.status] ?? "outline"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "pending" && <>
                        <Button size="icon" variant="ghost" title="Approve" onClick={() => m.mutate({ id: r.id, status: "approved" })}><Check className="h-4 w-4 text-emerald-600" /></Button>
                        <Button size="icon" variant="ghost" title="Reject" onClick={() => m.mutate({ id: r.id, status: "rejected" })}><X className="h-4 w-4 text-destructive" /></Button>
                      </>}
                      {r.status === "approved" && <Button size="icon" variant="ghost" title="Mark Received" onClick={() => m.mutate({ id: r.id, status: "received" })}><PackageCheck className="h-4 w-4 text-emerald-600" /></Button>}
                      {(r.status === "pending" || r.status === "approved") && <Button size="icon" variant="ghost" title="Cancel" onClick={() => m.mutate({ id: r.id, status: "cancelled" })}><Trash2 className="h-4 w-4" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <ReqDialog open={open} onOpenChange={setOpen} tenantId={tenantId} onSaved={() => qc.invalidateQueries({ queryKey: ["requisitions"] })} />
    </AppShell>
  );
}

function ReqDialog({ open, onOpenChange, tenantId, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; onSaved: () => void }) {
  const { t } = useTranslation();
  const branches = useServerFn(listBranchesForProducts);
  const listProds = useServerFn(listProductsForManagement);
  const create = useServerFn(createRequisition);
  const [fromBranchId, setFrom] = useState("");
  const [toBranchId, setTo] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ productId: string; requestedQty: number }[]>([{ productId: "", requestedQty: 1 }]);
  const [search, setSearch] = useState("");

  const br = useQuery({ queryKey: ["req-branches", tenantId], enabled: open && !!tenantId, queryFn: () => branches({ data: { tenantId } }) });
  const prods = useQuery({ queryKey: ["req-products", tenantId, search], enabled: open && !!tenantId, queryFn: () => listProds({ data: { tenantId, search: search || undefined, page: 1, pageSize: 50 } }) });

  const m = useMutation({
    mutationFn: () => create({ data: { tenantId, fromBranchId: fromBranchId || null, toBranchId: toBranchId || null, notes: notes || null, items: items.filter((i) => i.productId && i.requestedQty > 0) } }),
    onSuccess: () => { toast.success(t("toast.requisitionCreated")); onSaved(); onOpenChange(false); setFrom(""); setTo(""); setNotes(""); setItems([{ productId: "", requestedQty: 1 }]); },
    onError: (e: Error) => toast.error(e.message),
  });

  const validItems = items.filter((i) => i.productId && i.requestedQty > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t("dialog.newRequisition")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>From Branch</Label>
              <Select value={fromBranchId} onValueChange={setFrom}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(br.data ?? []).map((b: { id: string; name: string }) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>To Branch</Label>
              <Select value={toBranchId} onValueChange={setTo}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(br.data ?? []).map((b: { id: string; name: string }) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Search Products</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter..." /></div>
          <div className="space-y-2">
            <Label>Items</Label>
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_120px_40px] gap-2">
                <Select value={it.productId} onValueChange={(v) => setItems(items.map((x, i) => i === idx ? { ...x, productId: v } : x))}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{(prods.data?.rows ?? []).map((p: { id: string; name: string; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null }) => <SelectItem key={p.id} value={p.id}>{buildProductDisplayName(p)}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={1} value={it.requestedQty} onChange={(e) => setItems(items.map((x, i) => i === idx ? { ...x, requestedQty: Number(e.target.value) || 0 } : x))} />
                <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setItems([...items, { productId: "", requestedQty: 1 }])}><Plus className="mr-2 h-3 w-3" />Add Item</Button>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!validItems.length || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
