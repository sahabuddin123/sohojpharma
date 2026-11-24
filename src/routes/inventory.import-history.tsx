import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Download, RotateCcw, FileSpreadsheet, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { listImportHistory, getImportErrors, rollbackProductImport } from "@/lib/api/product-management.functions";

export const Route = createFileRoute("/inventory/import-history")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Import History — SohojPharma" }, { name: "description", content: "Audit every product import run with rollback support." }] }),
  component: ImportHistoryPage,
});

type Row = {
  id: string;
  file_name: string;
  import_batch_id: string | null;
  total_rows: number;
  imported_rows: number;
  updated_rows: number;
  failed_rows: number;
  skipped_rows: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  rolled_back_at: string | null;
  created_at: string;
  created_by: string | null;
};

function fmtDuration(ms: number | null) {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}m ${r}s`;
}

function withinRollbackWindow(r: Row) {
  if (r.rolled_back_at) return false;
  if (!r.finished_at) return false;
  return Date.now() - new Date(r.finished_at).getTime() < 24 * 60 * 60 * 1000;
}

function ImportHistoryPage() {
  const { currentTenantId: tenantId } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listImportHistory);
  const errorsFn = useServerFn(getImportErrors);
  const rollbackFn = useServerFn(rollbackProductImport);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [rollbackTarget, setRollbackTarget] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["import-history", tenantId, page],
    queryFn: () => listFn({ data: { tenantId: tenantId!, page, pageSize } }),
    enabled: !!tenantId,
  });

  const downloadErrors = async (r: Row) => {
    try {
      const rows = await errorsFn({ data: { tenantId: tenantId!, importLogId: r.id } });
      if (!rows.length) { toast.info("No errors recorded for this import."); return; }
      const ws = XLSX.utils.json_to_sheet(rows.map((e) => ({
        Row: e.row_number, Product: e.product_name ?? "", Company: e.company_name ?? "",
        Barcode: e.barcode ?? "", Error: e.error_message,
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Errors");
      XLSX.writeFile(wb, `import-errors-${r.id.slice(0, 8)}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load errors");
    }
  };

  const downloadDuplicates = async (r: Row) => {
    try {
      const rows = await errorsFn({ data: { tenantId: tenantId!, importLogId: r.id } });
      const dupes = rows.filter((e) => /duplicate/i.test(e.error_message));
      if (!dupes.length) { toast.info("No duplicates in this import."); return; }
      const ws = XLSX.utils.json_to_sheet(dupes.map((e) => ({
        Row: e.row_number, Product: e.product_name ?? "", Company: e.company_name ?? "",
        Barcode: e.barcode ?? "", Reason: e.error_message,
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Duplicates");
      XLSX.writeFile(wb, `import-duplicates-${r.id.slice(0, 8)}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load duplicates");
    }
  };

  const rollback = useMutation({
    mutationFn: async (batchId: string) => rollbackFn({ data: { tenantId: tenantId!, importBatchId: batchId } }),
    onSuccess: (res) => {
      toast.success(`Rolled back: ${res.products} products, ${res.batches} batches, ${res.barcodes} barcodes`);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Rollback failed"),
    onSettled: () => setRollbackTarget(null),
  });

  const rows = (data?.rows ?? []) as Row[];
  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / pageSize));

  return (
    <AppShell variant="store" title="Import History">
      <PageHeader title="Import History" description="Every product import run with rollback support (24 hours)." />
      <Card>
        <CardHeader><CardTitle>Recent imports</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !rows.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Imported</TableHead>
                    <TableHead className="text-right">Updated</TableHead>
                    <TableHead className="text-right">Skipped</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={r.file_name}>{r.file_name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.import_batch_id?.slice(0, 8) ?? "—"}</TableCell>
                      <TableCell className="text-right">{r.total_rows}</TableCell>
                      <TableCell className="text-right text-emerald-600">{r.imported_rows}</TableCell>
                      <TableCell className="text-right">{r.updated_rows}</TableCell>
                      <TableCell className="text-right text-amber-600">{r.skipped_rows}</TableCell>
                      <TableCell className="text-right text-rose-600">{r.failed_rows}</TableCell>
                      <TableCell className="text-xs">{fmtDuration(r.duration_ms)}</TableCell>
                      <TableCell>
                        {r.rolled_back_at ? <Badge variant="destructive">Rolled back</Badge>
                          : r.status === "completed" ? <Badge variant="default">Completed</Badge>
                          : r.status === "failed" ? <Badge variant="destructive">Failed</Badge>
                          : <Badge variant="secondary">{r.status}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => downloadErrors(r)} title="Download Error Report"><Download className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadDuplicates(r)} title="Download Duplicate Report"><FileSpreadsheet className="h-4 w-4" /></Button>
                          <Button
                            size="sm" variant="ghost"
                            disabled={!withinRollbackWindow(r) || !r.import_batch_id || rollback.isPending}
                            onClick={() => setRollbackTarget(r)}
                            title={withinRollbackWindow(r) ? "Rollback this import" : "Rollback window expired"}
                          ><RotateCcw className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between pt-4 text-xs text-muted-foreground">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!rollbackTarget} onOpenChange={(v) => !v && setRollbackTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollback this import?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete every product, batch and barcode created by import
              <span className="font-mono"> {rollbackTarget?.import_batch_id?.slice(0, 8)}</span>
              {" "}and reset its opening stock. <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rollbackTarget?.import_batch_id && rollback.mutate(rollbackTarget.import_batch_id)}
              disabled={rollback.isPending}
            >{rollback.isPending ? "Rolling back..." : "Rollback"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
