import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft, ChevronRight, MoreVertical, Plus, Printer, Search, Eye, Pencil, Trash2,
  CheckCircle2, XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  listPurchaseRequisitions, deletePurchaseRequisition, setRequisitionStatus,
  getPurchaseRequisition,
} from "@/lib/api/purchase-requisitions.functions";
import { getInvoiceSettings } from "@/lib/api/invoices.functions";
import { printRequisition } from "@/components/purchase-requisition/requisition-print";
import { getPrinterSettings, listPrinters } from "@/lib/api/printer-settings.functions";
import { ModernDateRangeFilter, useDateRangeFilter } from "@/components/common/date-range-filter";

export const Route = createFileRoute("/_authenticated/purchasing/requisition-list")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Purchase Requisitions — SohojPharma" }] }),
  component: RequisitionListPage,
});

const STATUSES = ["draft", "pending", "approved", "rejected", "completed", "cancelled"] as const;
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-zinc-100 text-zinc-700",
};

function dateRange(preset: string): { from: string | null; to: string | null } {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const toISO = (x: Date) => x.toISOString().slice(0, 10);
  const today = toISO(d);
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const y = new Date(d); y.setDate(y.getDate() - 1);
    return { from: toISO(y), to: toISO(y) };
  }
  if (preset === "week") {
    const s = new Date(d); s.setDate(s.getDate() - 6);
    return { from: toISO(s), to: today };
  }
  if (preset === "month") {
    const s = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from: toISO(s), to: today };
  }
  return { from: null, to: null };
}

function RequisitionListPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const { preset, from, to, setPreset, setCustom } = useDateRangeFilter("all");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const listFn = useServerFn(listPurchaseRequisitions);
  const { data, isLoading } = useQuery({
    queryKey: ["pr-list", tenantId, search, status, from, to, page],
    enabled: !!tenantId,
    queryFn: () => listFn({
      data: {
        tenantId, search: search || null,
        status: status === "all" ? null : status,
        date_from: from ?? null, date_to: to ?? null,
        limit: pageSize, offset: page * pageSize,
      },
    }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const deleteFn = useServerFn(deletePurchaseRequisition);
  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { tenantId, id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["pr-list"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const statusFn = useServerFn(setRequisitionStatus);
  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "rejected" | "cancelled" | "completed" }) =>
      statusFn({ data: { tenantId, id: v.id, status: v.status } }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["pr-list"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const getFn = useServerFn(getPurchaseRequisition);
  const settingsFn = useServerFn(getInvoiceSettings);
  const printerSettingsFn = useServerFn(getPrinterSettings);
  const printerProfilesFn = useServerFn(listPrinters);
  async function doPrint(id: string, paper: "A4" | "58mm" | "auto" = "auto") {
    try {
      const [res, s, ps, printers] = await Promise.all([
        getFn({ data: { tenantId, id } }),
        settingsFn({ data: { tenantId } }).catch(() => null),
        printerSettingsFn({ data: { tenant_id: tenantId } }).catch(() => null),
        printerProfilesFn({ data: { tenant_id: tenantId } }).catch(() => []),
      ]);
      const h = res.header as Record<string, unknown> & {
        pr_number: string; requisition_date: string; expected_date: string | null;
        remarks: string | null; suppliers?: { name: string } | null;
        warehouses?: { name: string } | null; supplier_id: string | null;
      };
      const set = (s ?? {}) as Record<string, unknown>;
      const defaultReceiptPrinter = printers.find((p) => p.id === ps?.default_receipt_printer);
      const resolvedPaper = paper === "auto" && (ps?.receipt_format === "58mm" || defaultReceiptPrinter?.printer_type === "thermal") ? "58mm" : paper;
      await printRequisition({
        companyName: String(set.company_name ?? "Company"),
        companyAddress: (set.address as string) ?? null,
        companyPhone: (set.phone as string) ?? null,
        companyEmail: (set.email as string) ?? null,
        companyLogoUrl: (set.logo_url as string) ?? null,
        prNumber: h.pr_number,
        requisitionDate: h.requisition_date,
        expectedDate: h.expected_date,
        supplierName: h.suppliers?.name ?? null,
        warehouseName: h.warehouses?.name ?? null,
        remarks: h.remarks,
        paper: resolvedPaper,
        tenantId,
        items: (res.items as Array<Record<string, unknown>>).map((it) => {
          const p = (it.products as { strength?: string | null; volume?: string | null } | null) ?? null;
          return {
            product_name: String(it.product_name ?? ""),
            sku: (it.sku as string) ?? null,
            unit: (it.unit as string) ?? null,
            requested_qty: Number(it.requested_qty ?? 0),
            remarks: (it.remarks as string) ?? null,
            strength: p?.strength ?? null,
            volume: p?.volume ?? null,
          };
        }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Print failed");
    }
  }

  return (
    <AppShell variant="store">
      <PageHeader
        title="Purchase Requisitions"
        description="Track all internal purchase requisitions. Approve, reject, print, or convert to a purchase order."
        actions={
          <Button asChild>
            <Link to="/purchasing/requisition" search={{ edit: undefined }}><Plus className="mr-1 h-4 w-4" /> New Requisition</Link>
          </Button>
        }
      />

      <Card className="mb-3">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search PR No, product, SKU, barcode…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="h-9 pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <ModernDateRangeFilter
            preset={preset}
            from={from}
            to={to}
            onPresetChange={(p) => { setPreset(p); setPage(0); }}
            onCustomChange={(f, t) => { setCustom(f, t); setPage(0); }}
          />
          <div className="ml-auto text-xs text-muted-foreground">
            {total.toLocaleString()} requisitions
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PR No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Estimated</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead className="w-14"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">No requisitions found.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-semibold">{r.pr_number}</TableCell>
                  <TableCell>{r.requisition_date}</TableCell>
                  <TableCell>{r.supplier_name ?? "—"}</TableCell>
                  <TableCell>{r.warehouse_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.total_items}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.total_qty).toLocaleString(undefined,{maximumFractionDigits:3})}</TableCell>
                  <TableCell className="text-right tabular-nums">৳{Number(r.estimated_amount).toFixed(2)}</TableCell>
                  <TableCell>
                    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase ${STATUS_COLORS[r.status] ?? ""}`}>{r.status}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.created_by_email ?? "—"}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate({ to: "/purchasing/requisition", search: { edit: r.id } })}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void doPrint(r.id, "auto")}>
                          <Printer className="mr-2 h-4 w-4" /> Print
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void doPrint(r.id, "58mm")}>
                          <Printer className="mr-2 h-4 w-4" /> Print 58mm Thermal
                        </DropdownMenuItem>
                        {r.status === "draft" && (
                          <>
                            <DropdownMenuItem onClick={() => navigate({ to: "/purchasing/requisition", search: { edit: r.id } })}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => {
                              if (confirm("Delete this draft?")) delMut.mutate(r.id);
                            }}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                        {(r.status === "pending" || r.status === "draft") && (
                          <>
                            <DropdownMenuItem onClick={() => statusMut.mutate({ id: r.id, status: "approved" })}>
                              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => statusMut.mutate({ id: r.id, status: "rejected" })}>
                              <XCircle className="mr-2 h-4 w-4 text-red-600" /> Reject
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-3 flex items-center justify-end gap-2">
        <div className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</div>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {/* Convert-to-PO stubbed via future ready architecture — approval already implemented. */}
      <div className="mt-2">
        <Badge variant="outline" className="text-xs">Convert to Purchase Order — coming soon (data model ready).</Badge>
      </div>
    </AppShell>
  );
}
