import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { listProductsPackaging, updateProductPackaging } from "@/lib/api/pharmacy.functions";

export const Route = createFileRoute("/pharmacy/units")({
  head: () => ({ meta: [{ title: "Unit Conversion — SohojPharma" }] }),
  errorComponent: (props) => <RouteErrorPanel error={props.error as Error} reset={props.reset} />,
  component: UnitsPage,
});

type Row = Awaited<ReturnType<typeof listProductsPackaging>>[number];

function UnitsPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(listProductsPackaging);
  const { data } = useQuery({
    queryKey: ["pharmacy-packaging", tenantId],
    queryFn: () => fn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Unit Conversion Manager</h1>
        <p className="text-sm text-muted-foreground">Configure base / purchase / sale units. Example: 1 Box = 10 Strip = 100 Tablet.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Products</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Purchase</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead className="text-right">Units / Purchase</TableHead>
                <TableHead className="text-right">Units / Sale</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>
                  </TableCell>
                  <TableCell>{p.base_unit}</TableCell>
                  <TableCell>{p.purchase_unit}</TableCell>
                  <TableCell>{p.sale_unit}</TableCell>
                  <TableCell className="text-right">{p.units_per_purchase}</TableCell>
                  <TableCell className="text-right">{p.units_per_sale}</TableCell>
                  <TableCell className="text-right">
                    <EditDialog tenantId={tenantId} row={p} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EditDialog({ tenantId, row }: { tenantId: string; row: Row }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(row.base_unit);
  const [purchase, setPurchase] = useState(row.purchase_unit);
  const [sale, setSale] = useState(row.sale_unit);
  const [upp, setUpp] = useState(String(row.units_per_purchase));
  const [ups, setUps] = useState(String(row.units_per_sale));
  const qc = useQueryClient();
  const fn = useServerFn(updateProductPackaging);
  const m = useMutation({
    mutationFn: () => fn({ data: {
      tenantId, productId: row.id,
      base_unit: base, purchase_unit: purchase, sale_unit: sale,
      units_per_purchase: Number(upp) || 1,
      units_per_sale: Number(ups) || 1,
    } }),
    onSuccess: () => {
      toast.success("Packaging updated");
      qc.invalidateQueries({ queryKey: ["pharmacy-packaging", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm">Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{row.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base unit"><Input value={base} onChange={(e) => setBase(e.target.value)} /></Field>
          <Field label="Purchase unit"><Input value={purchase} onChange={(e) => setPurchase(e.target.value)} /></Field>
          <Field label="Sale unit"><Input value={sale} onChange={(e) => setSale(e.target.value)} /></Field>
          <div />
          <Field label="Base units per purchase unit"><Input type="number" value={upp} onChange={(e) => setUpp(e.target.value)} /></Field>
          <Field label="Base units per sale unit"><Input type="number" value={ups} onChange={(e) => setUps(e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">
          1 {purchase} = {upp || 1} {base} · 1 {sale} = {ups || 1} {base}
        </p>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
