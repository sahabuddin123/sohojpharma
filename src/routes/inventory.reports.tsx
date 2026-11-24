import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { ArrowLeft, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";
import { buildProductDisplayName } from "@/lib/product-display";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";

const WarehouseCtx = createContext<string | null>(null);

export const Route = createFileRoute("/inventory/reports")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Inventory Reports — SohojPharma" },
      { name: "description", content: "Current stock, ledger, low stock, expiry and movement reports with PDF/Excel export." },
    ],
  }),
  component: InventoryReportsPage,
});

const currentStock = [
  { name: "Napa Extra 500mg", sku: "NPX-500", stock: 240, value: 600 },
  { name: "Sergel 20mg", sku: "SGL-20", stock: 12, value: 84 },
  { name: "Calbo D 500mg", sku: "CAL-500", stock: 180, value: 720 },
];

const ledger = [
  { date: "2026-06-12", ref: "PO-1042", type: "Stock in", qty: 100 },
  { date: "2026-06-13", ref: "INV-2231", type: "Stock out", qty: -22 },
  { date: "2026-06-13", ref: "ADJ-019", type: "Adjustment", qty: -2 },
];

function InventoryReportsPage() {
  const { t } = useTranslation();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  return (
    <WarehouseCtx.Provider value={warehouseId}>
    <AppShell variant="store" title={t("pinv.invReportsTitle")}>
      <PageHeader
        title={t("pinv.invReportsTitle")}
        description={t("pinv.invReportsDesc")}
        actions={
          <>
            <WarehouseFilter value={warehouseId} onChange={setWarehouseId} className="w-[200px]" />
            <Button variant="outline" asChild>
              <Link to="/inventory"><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("pinv.backBtn")}</Link>
            </Button>
            <Button variant="outline"><FileText className="mr-1.5 h-4 w-4" /> {t("pinv.pdfBtn")}</Button>
            <Button variant="outline"><FileSpreadsheet className="mr-1.5 h-4 w-4" /> {t("pinv.excelBtn")}</Button>
            <Button><Download className="mr-1.5 h-4 w-4" /> {t("pinv.csvBtn")}</Button>
          </>
        }
      />

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("pinv.reportsTitle")}</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="opening">
            <TabsList className="flex-wrap">
              <TabsTrigger value="opening">{t("pinv.tabOpeningRegister")}</TabsTrigger>
              <TabsTrigger value="valuation">{t("pinv.tabValuation")}</TabsTrigger>
              <TabsTrigger value="batch">{t("pinv.tabBatchRegister")}</TabsTrigger>
              <TabsTrigger value="aging">{t("pinv.tabAging")}</TabsTrigger>
              <TabsTrigger value="current">{t("pinv.tabCurrentStock")}</TabsTrigger>
              <TabsTrigger value="ledger">{t("pinv.tabStockLedger")}</TabsTrigger>
              <TabsTrigger value="low">{t("pinv.tabLowStock")}</TabsTrigger>
              <TabsTrigger value="expiry">{t("pinv.tabExpiryRpt")}</TabsTrigger>
              <TabsTrigger value="movement">{t("pinv.tabMovement")}</TabsTrigger>
            </TabsList>

            <TabsContent value="opening" className="mt-4"><OpeningStockReport /></TabsContent>
            <TabsContent value="valuation" className="mt-4"><InventoryValuationReport /></TabsContent>
            <TabsContent value="batch" className="mt-4"><BatchRegisterReport /></TabsContent>
            <TabsContent value="aging" className="mt-4"><InventoryAgingReport /></TabsContent>

            <TabsContent value="current" className="mt-4">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("pinv.colProduct")}</TableHead><TableHead>SKU</TableHead>
                  <TableHead className="text-right">{t("pinv.colStock")}</TableHead>
                  <TableHead className="text-right">{t("pinv.colValueTk")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {currentStock.map((r) => (
                    <TableRow key={r.sku}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.sku}</TableCell>
                      <TableCell className="text-right">{r.stock}</TableCell>
                      <TableCell className="text-right">৳ {r.value.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="ledger" className="mt-4">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("pinv.colDate")}</TableHead><TableHead>{t("pinv.colReference")}</TableHead>
                  <TableHead>{t("pinv.colType")}</TableHead>
                  <TableHead className="text-right">{t("pinv.colQty")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ledger.map((r) => (
                    <TableRow key={r.ref}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell className="font-mono text-xs">{r.ref}</TableCell>
                      <TableCell>{r.type}</TableCell>
                      <TableCell className={`text-right ${r.qty < 0 ? "text-destructive" : "text-success"}`}>
                        {r.qty > 0 ? `+${r.qty}` : r.qty}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="low" className="mt-4">
              <p className="text-sm text-muted-foreground">{t("pinv.lowStockMsg")}</p>
            </TabsContent>
            <TabsContent value="expiry" className="mt-4">
              <p className="text-sm text-muted-foreground">{t("pinv.expiryMsg")}</p>
            </TabsContent>
            <TabsContent value="movement" className="mt-4">
              <p className="text-sm text-muted-foreground">{t("pinv.movementMsg")}</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </AppShell>
    </WarehouseCtx.Provider>
  );
}

type BatchRow = {
  id: string; batch_no: string; mfg_date: string | null; expiry_date: string | null;
  purchase_price: number | null; qty_on_hand: number | null; is_opening: boolean | null;
  mrp: number | null; created_at: string;
  products: { name: string; sku: string | null; strength: string | null; medicine_type: string | null; volume: string | null; pack_size: number | null } | null;
};

const displayProduct = (p: BatchRow["products"]) => p ? buildProductDisplayName(p) : "-";

function useBatches() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const warehouseId = useContext(WarehouseCtx);
  return useQuery({
    queryKey: ["inv-reports-batches", tenantId, warehouseId ?? "all"],
    enabled: !!tenantId,
    queryFn: async (): Promise<BatchRow[]> => {
      let q = supabase
        .from("batches")
        .select("id,batch_no,mfg_date,expiry_date,purchase_price,qty_on_hand,is_opening,mrp,created_at,products(name,sku,strength,medicine_type,volume,pack_size)")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as BatchRow[];
    },
  });
}

function ReportTable({ headers, rows, empty }: { headers: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader><TableRow>{headers.map((h, i) => <TableHead key={i} className={i >= headers.length - 2 ? "text-right" : ""}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className={j >= headers.length - 2 ? "text-right font-mono text-xs" : ""}>{c}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OpeningStockReport() {
  const { t } = useTranslation();
  const { data = [], isLoading } = useBatches();
  if (isLoading) return <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("pinv.loadingDots")}</div>;
  const opening = data.filter((b) => b.is_opening);
  const total = opening.reduce((s, b) => s + Number(b.qty_on_hand ?? 0) * Number(b.purchase_price ?? 0), 0);
  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground">{t("pinv.openingBatchesTpl", { n: opening.length, val: total.toFixed(2) })}</p>
      <ReportTable
        headers={[t("pinv.colDate"), t("pinv.colProduct"), t("pinv.colBatch"), t("pinv.colExpiry"), t("pinv.colQty"), t("pinv.colCost"), t("pinv.colValue")]}
        rows={opening.map((b) => [
          b.created_at.slice(0, 10),
          displayProduct(b.products),
          b.batch_no,
          b.expiry_date ?? "-",
          Number(b.qty_on_hand ?? 0),
          `৳${Number(b.purchase_price ?? 0).toFixed(2)}`,
          `৳${(Number(b.qty_on_hand ?? 0) * Number(b.purchase_price ?? 0)).toFixed(2)}`,
        ])}
        empty={t("pinv.noOpeningInit")}
      />
    </>
  );
}

function InventoryValuationReport() {
  const { t } = useTranslation();
  const { data = [], isLoading } = useBatches();
  if (isLoading) return <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("pinv.loadingDots")}</div>;
  const byProduct = new Map<string, { name: string; sku: string; qty: number; value: number }>();
  data.forEach((b) => {
    const key = b.products?.name ?? b.id;
    const prev = byProduct.get(key) ?? { name: displayProduct(b.products), sku: b.products?.sku ?? "-", qty: 0, value: 0 };
    prev.qty += Number(b.qty_on_hand ?? 0);
    prev.value += Number(b.qty_on_hand ?? 0) * Number(b.purchase_price ?? 0);
    byProduct.set(key, prev);
  });
  const rows = [...byProduct.values()].filter((r) => r.qty !== 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground">{t("pinv.totalInvValueTpl", { val: total.toFixed(2) })}</p>
      <ReportTable
        headers={[t("pinv.colProduct"), "SKU", t("pinv.colQty"), t("pinv.colValue")]}
        rows={rows.map((r) => [r.name, r.sku, r.qty, `৳${r.value.toFixed(2)}`])}
        empty={t("pinv.noInvOnHand")}
      />
    </>
  );
}

function BatchRegisterReport() {
  const { t } = useTranslation();
  const { data = [], isLoading } = useBatches();
  if (isLoading) return <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("pinv.loadingDots")}</div>;
  return (
    <ReportTable
      headers={[t("pinv.colProduct"), t("pinv.colBatch"), t("pinv.colMfg"), t("pinv.colExpiry"), t("pinv.colSource"), t("pinv.colQty"), t("pinv.colCost")]}
      rows={data.map((b) => [
        displayProduct(b.products),
        b.batch_no,
        b.mfg_date ?? "-",
        b.expiry_date ?? "-",
        b.is_opening ? t("pinv.sourceOpening") : t("pinv.sourceGRN"),
        Number(b.qty_on_hand ?? 0),
        `৳${Number(b.purchase_price ?? 0).toFixed(2)}`,
      ])}
      empty={t("pinv.noBatchesYet")}
    />
  );
}

function InventoryAgingReport() {
  const { t } = useTranslation();
  const { data = [], isLoading } = useBatches();
  if (isLoading) return <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("pinv.loadingDots")}</div>;
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0, expired: 0 } as Record<string, number>;
  const now = Date.now();
  data.forEach((b) => {
    if (!b.expiry_date || Number(b.qty_on_hand ?? 0) <= 0) return;
    const days = Math.ceil((new Date(b.expiry_date).getTime() - now) / 86400000);
    const v = Number(b.qty_on_hand ?? 0) * Number(b.purchase_price ?? 0);
    if (days < 0) buckets.expired += v;
    else if (days <= 30) buckets["0-30"] += v;
    else if (days <= 60) buckets["31-60"] += v;
    else if (days <= 90) buckets["61-90"] += v;
    else buckets["90+"] += v;
  });
  return (
    <ReportTable
      headers={[t("pinv.agingBucket"), t("pinv.inventoryValueLbl")]}
      rows={Object.entries(buckets).map(([k, v]) => [k, `৳${v.toFixed(2)}`])}
      empty={t("pinv.noBatchTracked")}
    />
  );
}
