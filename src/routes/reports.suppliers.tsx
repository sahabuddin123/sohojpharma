import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reports/suppliers")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Supplier Analytics — SohojPharma" }] }),
  component: SupplierAnalyticsPage,
});

function SupplierAnalyticsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const { data: suppliers = [] } = useQuery({
    queryKey: ["rep-suppliers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name,due_balance")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pos = [] } = useQuery({
    queryKey: ["rep-supplier-pos", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("supplier_id,total")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const top = useMemo(() => {
    const sMap = new Map<string, { name: string; due: number }>();
    for (const s of suppliers as Array<{ id: string; name: string; due_balance: number | null }>) {
      sMap.set(s.id, { name: s.name, due: Number(s.due_balance ?? 0) });
    }
    const agg = new Map<string, { name: string; orders: number; volume: number; due: number }>();
    for (const p of pos as Array<{ supplier_id: string | null; total: number | null }>) {
      if (!p.supplier_id) continue;
      const s = sMap.get(p.supplier_id);
      if (!s) continue;
      const cur = agg.get(p.supplier_id) ?? { name: s.name, orders: 0, volume: 0, due: s.due };
      cur.orders += 1;
      cur.volume += Number(p.total ?? 0);
      agg.set(p.supplier_id, cur);
    }
    return Array.from(agg.values()).sort((a, b) => b.volume - a.volume).slice(0, 10);
  }, [suppliers, pos]);

  return (
    <>
      <PageHeader title={t("rpt.suppliers.title")} description={t("rpt.suppliers.desc")} />
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("rpt.suppliers.topSuppliers")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("rpt.suppliers.col.supplier")}</TableHead>
              <TableHead className="text-right">{t("rpt.suppliers.col.orders")}</TableHead>
              <TableHead className="text-right">{t("rpt.suppliers.col.purchaseVolume")}</TableHead>
              <TableHead className="text-right">{t("rpt.suppliers.col.outstandingDue")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {top.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">{t("rpt.suppliers.empty")}</TableCell></TableRow>
              ) : top.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.orders}</TableCell>
                  <TableCell className="text-right">৳ {r.volume.toLocaleString("en-IN")}</TableCell>
                  <TableCell className={`text-right ${r.due > 0 ? "text-destructive" : "text-muted-foreground"}`}>৳ {r.due.toLocaleString("en-IN")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
