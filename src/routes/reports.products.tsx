import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { buildProductDisplayName } from "@/lib/product-display";

type ProductMini = { name: string | null; strength?: string | null; medicine_type?: string | null; volume?: string | null; pack_size?: number | null };
const PROD_COLS = "name,strength,medicine_type,volume,pack_size";
const pname = (p: ProductMini | null | undefined, fallback = "—") => p?.name ? buildProductDisplayName({ name: p.name, strength: p.strength, medicine_type: p.medicine_type, volume: p.volume, pack_size: p.pack_size }) : fallback;

export const Route = createFileRoute("/reports/products")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Product Analytics — SohojPharma" }] }),
  component: ProductAnalyticsPage,
});

function ProductAnalyticsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const { data: items = [] } = useQuery({
    queryKey: ["rep-prod-sale-items", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id,qty,line_total,products(name,strength,medicine_type,volume,pack_size)")
        .eq("tenant_id", tenantId)
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: batches = [] } = useQuery({
    queryKey: ["rep-prod-batches", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("batch_no,qty_on_hand,expiry_date,purchase_price,product_id,products(name,strength,medicine_type,volume,pack_size)")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["rep-prod-list", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,reorder_level,strength,medicine_type,volume,pack_size")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const top = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; rev: number }>();
    for (const it of items as Array<{ product_id: string; qty: number; line_total: number; products: ProductMini | null }>) {
      const key = it.product_id;
      const cur = m.get(key) ?? { name: pname(it.products), qty: 0, rev: 0 };
      cur.qty += Number(it.qty ?? 0);
      cur.rev += Number(it.line_total ?? 0);
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [items]);

  const expiring = useMemo(() => {
    const now = Date.now();
    return (batches as Array<{ batch_no: string; qty_on_hand: number; expiry_date: string; purchase_price: number; products: ProductMini | null }>)
      .filter((b) => b.qty_on_hand > 0)
      .map((b) => ({
        ...b,
        days: Math.ceil((new Date(b.expiry_date).getTime() - now) / 86400000),
      }))
      .filter((b) => b.days <= 90)
      .sort((a, b) => a.days - b.days)
      .slice(0, 20);
  }, [batches]);

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of batches as Array<{ product_id: string; qty_on_hand: number }>) {
      m.set(b.product_id, (m.get(b.product_id) ?? 0) + Number(b.qty_on_hand ?? 0));
    }
    return m;
  }, [batches]);

  const lowStock = useMemo(() => {
    return (products as Array<{ id: string; name: string; reorder_level: number | null } & ProductMini>)
      .map((p) => ({ name: pname(p), current: stockMap.get(p.id) ?? 0, reorder: Number(p.reorder_level ?? 0) }))
      .filter((p) => p.reorder > 0 && p.current <= p.reorder)
      .sort((a, b) => a.current - b.current)
      .slice(0, 20);
  }, [products, stockMap]);

  const soldIds = useMemo(() => new Set((items as Array<{ product_id: string }>).map((i) => i.product_id)), [items]);
  const slow = useMemo(() => {
    return (products as Array<{ id: string; name: string } & ProductMini>)
      .filter((p) => !soldIds.has(p.id) && (stockMap.get(p.id) ?? 0) > 0)
      .map((p) => ({ name: pname(p), stock: stockMap.get(p.id) ?? 0 }))
      .slice(0, 20);
  }, [products, soldIds, stockMap]);

  return (
    <>
      <PageHeader title={t("rpt.products.title")} description={t("rpt.products.desc")} />
      <Tabs defaultValue="best">
        <TabsList>
          <TabsTrigger value="best">{t("rpt.products.tabs.best")}</TabsTrigger>
          <TabsTrigger value="slow">{t("rpt.products.tabs.slow")}</TabsTrigger>
          <TabsTrigger value="expired">{t("rpt.products.tabs.expired")}</TabsTrigger>
          <TabsTrigger value="low">{t("rpt.products.tabs.low")}</TabsTrigger>
        </TabsList>

        <TabsContent value="best" className="mt-4">
          <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t("rpt.products.best.cardTitle")}</CardTitle></CardHeader><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>{t("rpt.products.best.col.medicine")}</TableHead><TableHead className="text-right">{t("rpt.products.best.col.qtySold")}</TableHead><TableHead className="text-right">{t("rpt.products.best.col.revenue")}</TableHead></TableRow></TableHeader>
              <TableBody>{top.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">{t("rpt.products.best.empty")}</TableCell></TableRow>
              ) : top.map((r) => (<TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right">{r.qty}</TableCell><TableCell className="text-right">৳ {r.rev.toLocaleString("en-IN")}</TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="slow" className="mt-4">
          <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t("rpt.products.slow.cardTitle")}</CardTitle></CardHeader><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>{t("rpt.products.slow.col.medicine")}</TableHead><TableHead className="text-right">{t("rpt.products.slow.col.stock")}</TableHead></TableRow></TableHeader>
              <TableBody>{slow.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">{t("rpt.products.slow.empty")}</TableCell></TableRow>
              ) : slow.map((r) => (<TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right">{r.stock}</TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="expired" className="mt-4">
          <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t("rpt.products.expiry.cardTitle")}</CardTitle></CardHeader><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>{t("rpt.products.expiry.col.medicine")}</TableHead><TableHead>{t("rpt.products.expiry.col.batch")}</TableHead><TableHead>{t("rpt.products.expiry.col.expires")}</TableHead><TableHead className="text-right">{t("rpt.products.expiry.col.qty")}</TableHead><TableHead className="text-right">{t("rpt.products.expiry.col.value")}</TableHead></TableRow></TableHeader>
              <TableBody>{expiring.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">{t("rpt.products.expiry.empty")}</TableCell></TableRow>
              ) : expiring.map((r) => (
                <TableRow key={r.batch_no}>
                  <TableCell className="font-medium">{pname(r.products)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.batch_no}</TableCell>
                  <TableCell><Badge variant={r.days <= 30 ? "destructive" : r.days <= 60 ? "secondary" : "outline"}>{r.days}d</Badge></TableCell>
                  <TableCell className="text-right">{r.qty_on_hand}</TableCell>
                  <TableCell className="text-right">৳ {(Number(r.purchase_price ?? 0) * Number(r.qty_on_hand ?? 0)).toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="low" className="mt-4">
          <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t("rpt.products.low.cardTitle")}</CardTitle></CardHeader><CardContent className="p-0">
            <Table><TableHeader><TableRow><TableHead>{t("rpt.products.low.col.medicine")}</TableHead><TableHead className="text-right">{t("rpt.products.low.col.current")}</TableHead><TableHead className="text-right">{t("rpt.products.low.col.reorderLevel")}</TableHead></TableRow></TableHeader>
              <TableBody>{lowStock.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">{t("rpt.products.low.empty")}</TableCell></TableRow>
              ) : lowStock.map((r) => (<TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right">{r.current === 0 ? <Badge variant="destructive">{t("rpt.products.low.out")}</Badge> : r.current}</TableCell><TableCell className="text-right font-semibold text-primary">{r.reorder}</TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
