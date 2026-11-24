import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileDown, Filter } from "lucide-react";
import * as XLSX from "xlsx";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { buildProductDisplayName } from "@/lib/product-display";
import { purchaseReturnReportData } from "@/lib/api/purchase-returns.functions";

export const Route = createFileRoute("/reports/purchase-returns")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Purchase Return Report — SohojPharma" }] }),
  component: PurchaseReturnReport,
});

const fmt = (n: number) => `৳ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

function PurchaseReturnReport() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const reportFn = useServerFn(purchaseReturnReportData);

  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [supplierId, setSupplierId] = useState<string>("");

  const { data: suppliers = [] } = useQuery({
    queryKey: ["pr-rpt-suppliers", tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["pr-report", tenantId, from, to, supplierId],
    enabled: !!tenantId,
    queryFn: () => reportFn({ data: { tenantId, from, to, supplierId: supplierId || undefined } }),
  });

  const kpis = data?.kpis;
  const trend = data?.trend ?? [];
  const topProducts = data?.topProducts ?? [];
  const topSuppliers = data?.topSuppliers ?? [];
  const headers = data?.headers ?? [];

  const exportRows = useMemo(() => (data?.items ?? []).map((it) => {
    const p = (it as { products?: { name: string; strength?: string | null; medicine_type?: string | null; volume?: string | null } | null }).products;
    const b = (it as { batches?: { batch_no?: string | null } | null }).batches;
    return {
      return_id: (it as { return_id: string }).return_id,
      product: p ? buildProductDisplayName(p) : "",
      batch: b?.batch_no ?? "",
      qty: Number((it as { qty: number | string }).qty ?? 0),
      unit_cost: Number((it as { unit_cost: number | string }).unit_cost ?? 0),
      line_total: Number((it as { line_total: number | string }).line_total ?? 0),
    };
  }), [data]);

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(headers.map((h) => ({
      return_no: h.return_no, return_date: h.return_date, supplier: (h as { suppliers?: { name?: string } | null }).suppliers?.name ?? "", total: Number(h.total_value ?? 0),
    }))), "Returns");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportRows), "Line items");
    XLSX.writeFile(wb, `purchase-returns_${from}_${to}.xlsx`);
  }

  return (
    <AppShell variant="store" title="Purchase return report">
      <PageHeader
        title="Purchase Return Report"
        description="Trends, top products, top suppliers, and full line-item drill-down."
        actions={
          <>
            <Button variant="outline" onClick={exportExcel} disabled={!headers.length}>
              <Download className="mr-1.5 h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!headers.length}>
              <FileDown className="mr-1.5 h-4 w-4" /> PDF
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 sm:grid-cols-4 p-4">
          <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">All suppliers</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => refetch()} className="w-full"><Filter className="mr-1.5 h-4 w-4" /> Apply</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        {[
          { label: "Today's value", value: fmt(kpis?.todayValue ?? 0) },
          { label: "Month value", value: fmt(kpis?.monthValue ?? 0) },
          { label: "Period value", value: fmt(kpis?.totalValue ?? 0) },
          { label: "Returned qty", value: String(kpis?.totalQty ?? 0) },
        ].map((k) => (
          <Card key={k.label} className="shadow-card">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-xl font-bold">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Return trend</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top returned products</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Top suppliers (by return value)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Returns</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!topSuppliers.length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No data</TableCell></TableRow>}
              {topSuppliers.map((s) => (
                <TableRow key={s.name}><TableCell>{s.name}</TableCell><TableCell className="text-right">{s.count}</TableCell><TableCell className="text-right">{fmt(s.value)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Returns in period {isLoading && "…"}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Return #</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Value</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!headers.length && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No returns in selected period</TableCell></TableRow>}
              {headers.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="font-mono text-xs">{h.return_no}</TableCell>
                  <TableCell>{h.return_date}</TableCell>
                  <TableCell>{(h as { suppliers?: { name?: string } | null }).suppliers?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(Number(h.total_value))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
