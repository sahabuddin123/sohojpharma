import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DollarSign, ShoppingCart, TrendingUp, Wallet, Package, Receipt,
  CreditCard, Banknote, AlertTriangle, Clock, Download, ArrowUpRight,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { buildProductDisplayName, type ProductDisplayInput } from "@/lib/product-display";
import { WarehouseFilter } from "@/components/inventory/warehouse-filter";

export const Route = createFileRoute("/reports/executive")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Executive Dashboard — SohojPharma" }] }),
  component: ExecutiveDashboard,
});

type Range = "today" | "7d" | "30d" | "mtd" | "ytd";
const RANGE_KEYS = ["today", "7d", "30d", "mtd", "ytd"] as Range[];
const RANGE_DAYS: Record<Range, number> = { today: 1, "7d": 7, "30d": 30, mtd: -1, ytd: -2 };

function rangeStart(r: Range): string {
  const now = new Date();
  if (r === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (r === "ytd") return new Date(now.getFullYear(), 0, 1).toISOString();
  const d = new Date(now); d.setDate(d.getDate() - (RANGE_DAYS[r] - 1)); d.setHours(0,0,0,0);
  return d.toISOString();
}
const fmt = (n: number) => `৳ ${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtInt = (n: number) => Number(n ?? 0).toLocaleString("en-IN");

function toCSV(rows: Array<Record<string, unknown>>, filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => {
      const v = r[h]; const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function ExecutiveDashboard() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [range, setRange] = useState<Range>("today");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const startIso = useMemo(() => rangeStart(range), [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["exec-dashboard", tenantId, startIso, warehouseId ?? "all"],
    enabled: !!tenantId,
    queryFn: async () => {
      const wf = <T extends { eq: (col: string, v: string) => T }>(q: T) =>
        warehouseId ? q.eq("warehouse_id", warehouseId) : q;
      const [sales, items, purchases, expenses, payments, batches, registers, customers] = await Promise.all([
        wf(supabase.from("sales")
          .select("id, total, paid, due, subtotal, vat, discount, payment_method, status, created_at")
          .eq("tenant_id", tenantId).neq("status", "void").gte("created_at", startIso)),
        wf(supabase.from("sale_items")
          .select("qty, unit_price, unit_cost, line_total, product_id, products(name,strength,medicine_type,volume,pack_size), sales!inner(tenant_id, created_at, status)")
          .eq("tenant_id", tenantId).neq("sales.status", "void").gte("sales.created_at", startIso)),
        supabase.from("purchase_orders")
          .select("total, created_at").eq("tenant_id", tenantId).gte("created_at", startIso),
        supabase.from("expenses")
          .select("amount, expense_date").eq("tenant_id", tenantId).gte("expense_date", startIso.slice(0,10)),
        supabase.from("customer_payments")
          .select("amount, payment_date").eq("tenant_id", tenantId).gte("payment_date", startIso.slice(0,10)),
        wf(supabase.from("batches")
          .select("product_id, qty_on_hand, purchase_price, expiry_date, products(name, reorder_level, strength, medicine_type, volume, pack_size)")
          .eq("tenant_id", tenantId).gt("qty_on_hand", 0)),
        supabase.from("cash_registers")
          .select("opening_amount, actual_closing_amount, expected_closing_amount, status")
          .eq("tenant_id", tenantId).eq("status", "open"),
        supabase.from("v_customer_due").select("due_balance").eq("tenant_id", tenantId),
      ]);

      const salesRows = sales.data ?? [];
      const itemRows = (items.data ?? []) as Array<{ qty: number; unit_price: number; unit_cost: number; line_total: number; product_id: string; products: { name: string } | null; sales: { created_at: string } }>;
      const totalSales = salesRows.reduce((s, r) => s + Number(r.total ?? 0), 0);
      const totalVat = salesRows.reduce((s, r) => s + Number(r.vat ?? 0), 0);
      const invoiceCount = salesRows.length;
      const cogs = itemRows.reduce((s, r) => s + Number(r.qty ?? 0) * Number(r.unit_cost ?? 0), 0);
      const revenue = itemRows.reduce((s, r) => s + Number(r.line_total ?? 0), 0);
      const grossProfit = revenue - cogs;

      const totalPurchase = (purchases.data ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const totalExp = (expenses.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const dueCollection = (payments.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      const netProfit = grossProfit - totalExp;

      const today0 = new Date(); today0.setHours(0,0,0,0);
      const in30 = new Date(today0); in30.setDate(in30.getDate() + 30);

      const inventoryValue = (batches.data ?? []).reduce(
        (s, b) => s + Number(b.qty_on_hand ?? 0) * Number(b.purchase_price ?? 0), 0,
      );
      const productStock: Record<string, { name: string; qty: number; reorder: number }> = {};
      for (const b of batches.data ?? []) {
        const pid = b.product_id as string;
        const prod = (b as { products: { name: string; reorder_level: number } | null }).products;
        productStock[pid] ??= { name: prod?.name ?? pid, qty: 0, reorder: Number(prod?.reorder_level ?? 0) };
        productStock[pid].qty += Number(b.qty_on_hand ?? 0);
      }
      const lowStock = Object.values(productStock)
        .filter((p) => p.reorder > 0 && p.qty <= p.reorder)
        .sort((a, b) => a.qty - b.qty).slice(0, 20);

      const expiring = (batches.data ?? [])
        .filter((b) => b.expiry_date && new Date(b.expiry_date) <= in30)
        .map((b) => ({
          name: (b as { products: ProductDisplayInput | null }).products?.name ? buildProductDisplayName((b as { products: ProductDisplayInput }).products) : "",
          qty: Number(b.qty_on_hand ?? 0),
          expiry: b.expiry_date as string,
          loss: Number(b.qty_on_hand ?? 0) * Number(b.purchase_price ?? 0),
        }))
        .sort((a, b) => a.expiry.localeCompare(b.expiry)).slice(0, 20);

      const cashOnHand = (registers.data ?? []).reduce(
        (s, r) => s + Number(r.expected_closing_amount ?? r.opening_amount ?? 0), 0,
      );
      const outstandingDue = (customers.data ?? []).reduce((s, r) => s + Number(r.due_balance ?? 0), 0);

      const trendMap: Record<string, { date: string; sales: number; profit: number; invoices: number }> = {};
      for (const s of salesRows) {
        const k = (s.created_at as string).slice(0, 10);
        trendMap[k] ??= { date: k, sales: 0, profit: 0, invoices: 0 };
        trendMap[k].sales += Number(s.total ?? 0);
        trendMap[k].invoices += 1;
      }
      for (const it of itemRows) {
        const k = it.sales.created_at.slice(0, 10);
        if (!trendMap[k]) trendMap[k] = { date: k, sales: 0, profit: 0, invoices: 0 };
        trendMap[k].profit += Number(it.line_total ?? 0) - Number(it.qty ?? 0) * Number(it.unit_cost ?? 0);
      }
      const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

      const prodAgg: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
      for (const it of itemRows) {
        const pid = it.product_id;
        prodAgg[pid] ??= { name: it.products?.name ? buildProductDisplayName(it.products as ProductDisplayInput) : pid, qty: 0, revenue: 0, profit: 0 };
        prodAgg[pid].qty += Number(it.qty ?? 0);
        prodAgg[pid].revenue += Number(it.line_total ?? 0);
        prodAgg[pid].profit += Number(it.line_total ?? 0) - Number(it.qty ?? 0) * Number(it.unit_cost ?? 0);
      }
      const topProducts = Object.values(prodAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

      const payMix: Record<string, number> = {};
      for (const s of salesRows) {
        const m = (s.payment_method as string) ?? "other";
        payMix[m] = (payMix[m] ?? 0) + Number(s.total ?? 0);
      }
      const paymentMix = Object.entries(payMix).map(([method, amount]) => ({ method, amount }));

      return {
        kpi: {
          totalSales, totalVat, invoiceCount,
          avgInvoice: invoiceCount ? totalSales / invoiceCount : 0,
          totalPurchase, totalExp, dueCollection, cashOnHand,
          inventoryValue, outstandingDue, grossProfit, netProfit,
          lowStockCount: lowStock.length, expiringCount: expiring.length,
        },
        trend, topProducts, lowStock, expiring, paymentMix,
      };
    },
  });

  const k = data?.kpi;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("rpt.executive.title")}
        description={t("rpt.executive.desc")}
        actions={
          <>
            <WarehouseFilter value={warehouseId} onChange={setWarehouseId} className="w-[200px]" />
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_KEYS.map((r) => (
                  <SelectItem key={r} value={r}>{t(`rpt.executive.ranges.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={!data}
              onClick={() => data && toCSV(data.trend, `sales-trend-${range}.csv`)}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("rpt.executive.kpi.sales")} value={fmt(k?.totalSales ?? 0)} icon={ShoppingCart} tone="primary" />
        <StatCard label={t("rpt.executive.kpi.grossProfit")} value={fmt(k?.grossProfit ?? 0)} icon={TrendingUp} tone="success" />
        <StatCard label={t("rpt.executive.kpi.netProfit")} value={fmt(k?.netProfit ?? 0)} icon={DollarSign} tone="success" />
        <StatCard label={t("rpt.executive.kpi.invoices")} value={fmtInt(k?.invoiceCount ?? 0)} icon={Receipt} tone="secondary" />
        <StatCard label={t("rpt.executive.kpi.avgInvoice")} value={fmt(k?.avgInvoice ?? 0)} icon={ArrowUpRight} tone="primary" />
        <StatCard label={t("rpt.executive.kpi.dueCollected")} value={fmt(k?.dueCollection ?? 0)} icon={CreditCard} tone="primary" />
        <StatCard label={t("rpt.executive.kpi.purchases")} value={fmt(k?.totalPurchase ?? 0)} icon={Package} tone="secondary" />
        <StatCard label={t("rpt.executive.kpi.expenses")} value={fmt(k?.totalExp ?? 0)} icon={Receipt} tone="warning" />
        <StatCard label={t("rpt.executive.kpi.cashOnHand")} value={fmt(k?.cashOnHand ?? 0)} icon={Banknote} tone="success" />
        <StatCard label={t("rpt.executive.kpi.inventoryValue")} value={fmt(k?.inventoryValue ?? 0)} icon={Package} tone="secondary" />
        <StatCard label={t("rpt.executive.kpi.outstandingDue")} value={fmt(k?.outstandingDue ?? 0)} icon={Wallet} tone="warning" />
        <StatCard label={t("rpt.executive.kpi.vatCollected")} value={fmt(k?.totalVat ?? 0)} icon={DollarSign} tone="primary" />
      </div>

      {/* Trend + Payment Mix */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("rpt.executive.charts.salesProfitTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.trend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="profit" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rpt.executive.charts.paymentMix")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.paymentMix ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="method" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top products + Low stock + Expiring */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("rpt.executive.topProducts.title")}</CardTitle>
            <Button variant="ghost" size="sm" disabled={!data?.topProducts.length}
              onClick={() => data && toCSV(data.topProducts, "top-products.csv")}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("rpt.executive.topProducts.col.product")}</TableHead>
                  <TableHead className="text-right">{t("rpt.executive.topProducts.col.qty")}</TableHead>
                  <TableHead className="text-right">{t("rpt.executive.topProducts.col.revenue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("rpt.executive.topProducts.loading")}</TableCell></TableRow>
                ) : !data?.topProducts.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("rpt.executive.topProducts.empty")}</TableCell></TableRow>
                ) : data.topProducts.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{fmtInt(p.qty)}</TableCell>
                    <TableCell className="text-right">{fmt(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> {t("rpt.executive.lowStock.title")}
              <Badge variant="secondary">{data?.lowStock.length ?? 0}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/inventory">{t("rpt.executive.lowStock.view")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("rpt.executive.lowStock.col.product")}</TableHead>
                  <TableHead className="text-right">{t("rpt.executive.lowStock.col.stock")}</TableHead>
                  <TableHead className="text-right">{t("rpt.executive.lowStock.col.reorder")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.lowStock.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("rpt.executive.lowStock.empty")}</TableCell></TableRow>
                ) : data.lowStock.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-right">{fmtInt(p.qty)}</TableCell>
                    <TableCell className="text-right">{fmtInt(p.reorder)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" /> {t("rpt.executive.expiring.title")}
              <Badge variant="secondary">{data?.expiring.length ?? 0}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" disabled={!data?.expiring.length}
              onClick={() => data && toCSV(data.expiring, "expiring.csv")}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("rpt.executive.expiring.col.product")}</TableHead>
                  <TableHead className="text-right">{t("rpt.executive.expiring.col.qty")}</TableHead>
                  <TableHead className="text-right">{t("rpt.executive.expiring.col.loss")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.expiring.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">{t("rpt.executive.expiring.empty")}</TableCell></TableRow>
                ) : data.expiring.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-[11px] text-muted-foreground">{e.expiry}</div>
                    </TableCell>
                    <TableCell className="text-right">{fmtInt(e.qty)}</TableCell>
                    <TableCell className="text-right text-warning">{fmt(e.loss)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
