import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, AlertTriangle, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { listExpiryProducts } from "@/lib/api/product-management.functions";
import { RouteErrorPanel } from "@/components/route-error";
import { buildProductDisplayName } from "@/lib/product-display";

export const Route = createFileRoute("/products/expired")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Expired Products — SohojPharma" }, { name: "description", content: "Track expired and near-expiry medicines." }] }),
  component: ExpiredPage,
});

type Row = { id: string; batch_no: string | null; expiry_date: string; qty_on_hand: number; purchase_price: number | null; products: { id: string; name: string; sku: string | null; barcode: string | null; strength: string | null; medicine_type: string | null; volume: string | null; pack_size: number | null } | null };
const PAGE = 50;
const WINDOWS: Record<string, number> = { expired: -1, "30": 30, "60": 60, "90": 90 };

function ExpiredPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const list = useServerFn(listExpiryProducts);
  const [tab, setTab] = useState<"expired" | "30" | "60" | "90">("90");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["expired-products", tenantId, tab, page],
    enabled: !!tenantId,
    queryFn: () => list({ data: { tenantId, page, pageSize: PAGE, windowDays: WINDOWS[tab] } }),
  });
  const rows = (q.data?.rows ?? []) as Row[];
  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  function exportXlsx() {
    const data = rows.map((r) => ({ Product: r.products?.name, SKU: r.products?.sku, Batch: r.batch_no, Expiry: r.expiry_date, Qty: r.qty_on_hand, "Purchase Price": r.purchase_price, Value: (r.qty_on_hand * (r.purchase_price ?? 0)).toFixed(2) }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expired");
    XLSX.writeFile(wb, `expired-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <AppShell variant="store" title="Expired Products">
      <PageHeader title="Expired & Near Expiry" description={`${total} batches in selected window`} actions={<Button variant="outline" onClick={exportXlsx}><Download className="mr-2 h-4 w-4" />Export</Button>} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as never); setPage(1); }}>
            <TabsList>
              <TabsTrigger value="expired"><AlertTriangle className="mr-1 h-3 w-3 text-destructive" />Expired</TabsTrigger>
              <TabsTrigger value="30">30 Days</TabsTrigger>
              <TabsTrigger value="60">60 Days</TabsTrigger>
              <TabsTrigger value="90">90 Days</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Batch</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No items</TableCell></TableRow>
                ) : rows.map((r) => {
                  const today = new Date();
                  const exp = new Date(r.expiry_date);
                  const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
                  const badge = days < 0 ? { label: "Expired", v: "destructive" as const } : days <= 30 ? { label: `${days}d`, v: "destructive" as const } : days <= 60 ? { label: `${days}d`, v: "default" as const } : { label: `${days}d`, v: "secondary" as const };
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.products ? buildProductDisplayName(r.products) : "—"}<div className="text-xs text-muted-foreground">{r.products?.sku}</div></TableCell>
                      <TableCell>{r.batch_no || "—"}</TableCell>
                      <TableCell>{r.expiry_date}</TableCell>
                      <TableCell className="text-right">{r.qty_on_hand}</TableCell>
                      <TableCell className="text-right">৳ {(r.qty_on_hand * (r.purchase_price ?? 0)).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={badge.v}>{badge.label}</Badge></TableCell>
                    </TableRow>
                  );
                })}
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
    </AppShell>
  );
}
