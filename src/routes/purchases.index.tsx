import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Eye } from "lucide-react";
import { listPurchaseOrders } from "@/lib/api/procurement.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/purchases/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Purchases — SohojPharma" },
      { name: "description", content: "Manage purchase orders and supplier invoices." },
    ],
  }),
  component: PurchasesPage,
});

const STATUS_TONES: Record<string, string> = {
  received: "border-success/30 bg-success/10 text-success",
  approved: "border-success/30 bg-success/10 text-success",
  partially_received: "border-info/30 bg-info/10 text-info",
  sent: "border-info/30 bg-info/10 text-info",
  draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

const PAGE_SIZE = 50;
const STATUS_TABS = ["all", "draft", "sent", "approved", "partially_received", "received", "cancelled"] as const;

function PurchasesPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listPurchaseOrders);
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", tenantId, status, search, page],
    queryFn: () => listFn({ data: {
      tenantId,
      status: status === "all" ? undefined : status,
      search: search.trim() || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    } }),
    enabled: !!tenantId,
  });

  type PO = { id: string; po_number: string; status: string; order_date: string; received_at: string | null; total: number; suppliers: { name: string } | null };
  const rows = (data?.rows ?? []) as PO[];
  const total = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell variant="store" title={t("pages.purchases.title")}>
      <PageHeader
        title={t("pages.purchases.title")}
        description={t("pages.purchases.desc")}
        actions={
          <Button asChild>
            <Link to="/purchases/new"><Plus className="mr-1.5 h-4 w-4" /> {t("pages.purchases.newPurchase")}</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(0); }}>
          <TabsList>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-8"
          />
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pages.purchases.colPo")}</TableHead>
                <TableHead>{t("pages.purchases.colSupplier")}</TableHead>
                <TableHead className="text-right">{t("pages.purchases.colTotal")}</TableHead>
                <TableHead>{t("pages.purchases.colDate")}</TableHead>
                <TableHead className="text-right">{t("pages.purchases.colStatus")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t("pages.purchases.loading")}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">{t("pages.purchases.none")}</TableCell></TableRow>
              ) : rows.map((o) => {
                const dateStr = o.received_at ?? o.order_date;
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.po_number}</TableCell>
                    <TableCell className="font-medium">{o.suppliers?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">৳ {Number(o.total ?? 0).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-muted-foreground">{dateStr ? new Date(dateStr).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={STATUS_TONES[o.status] ?? STATUS_TONES.draft}>
                        {o.status?.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/procurement/$id" params={{ id: o.id }}>
                          <Eye className="mr-1 h-3.5 w-3.5" /> Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
