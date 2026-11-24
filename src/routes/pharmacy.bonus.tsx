import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { bonusReport } from "@/lib/api/pharmacy.functions";
import { buildProductDisplayName } from "@/lib/product-display";

export const Route = createFileRoute("/pharmacy/bonus")({
  head: () => ({ meta: [{ title: "Bonus Purchases — SohojPharma" }] }),
  errorComponent: (props) => <RouteErrorPanel error={props.error as Error} reset={props.reset} />,
  component: BonusPage,
});

function BonusPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(bonusReport);
  const { data } = useQuery({
    queryKey: ["pharmacy-bonus", tenantId],
    queryFn: () => fn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  const rows = data ?? [];
  const totalBonus = rows.reduce((s, r) => s + Number(r.bonus_qty ?? 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.qty ?? 0), 0);

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Bonus Purchase Tracking</h1>
        <p className="text-sm text-muted-foreground">Free bonus units received with purchases. Avg cost = total / (qty + bonus).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Paid quantity" value={totalPaid} />
        <Stat label="Bonus quantity" value={totalBonus} accent />
        <Stat label="Bonus lines" value={rows.length} />
      </div>

      <Card>
        <CardHeader><CardTitle>Bonus lines</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Bonus</TableHead>
                <TableHead className="text-right">Avg cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const qty = Number(r.qty ?? 0);
                const bonus = Number(r.bonus_qty ?? 0);
                const total = Number(r.line_total ?? 0);
                const avg = qty + bonus > 0 ? total / (qty + bonus) : 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell>{r.purchases?.purchase_date ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.purchases?.invoice_no ?? "—"}</TableCell>
                    <TableCell>{r.purchases?.suppliers?.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.products?.name ? buildProductDisplayName(r.products) : "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.products?.sku}</div>
                    </TableCell>
                    <TableCell className="text-right">{qty}</TableCell>
                    <TableCell className="text-right">
                      <Badge className="bg-success/15 text-success">+{bonus}</Badge>
                    </TableCell>
                    <TableCell className="text-right">৳ {avg.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No bonus purchases yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-bold ${accent ? "text-success" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
