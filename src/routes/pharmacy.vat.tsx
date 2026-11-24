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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { listProductsPackaging, updateProductVat } from "@/lib/api/pharmacy.functions";

export const Route = createFileRoute("/pharmacy/vat")({
  head: () => ({ meta: [{ title: "VAT Configuration — SohojPharma" }] }),
  errorComponent: (props) => <RouteErrorPanel error={props.error as Error} reset={props.reset} />,
  component: VatPage,
});

type Row = Awaited<ReturnType<typeof listProductsPackaging>>[number];
const PRESETS = [0, 5, 7.5, 10, 15];

function VatPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const fn = useServerFn(listProductsPackaging);
  const { data } = useQuery({
    queryKey: ["pharmacy-packaging", tenantId],
    queryFn: () => fn({ data: { tenantId } }),
    enabled: !!tenantId,
  });
  const rows = data ?? [];

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">VAT Configuration</h1>
        <p className="text-sm text-muted-foreground">Per-product VAT rate and mode (inclusive / exclusive / tax-free).</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Products</CardTitle></CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Retail price</TableHead>
                <TableHead className="text-right">VAT rate</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Base / VAT preview</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const rate = Number(p.vat_rate ?? 0);
                const price = Number(p.retail_price ?? 0);
                let base = price, vat = 0;
                if (p.vat_mode === "exclusive") { base = price; vat = price * rate / 100; }
                else if (p.vat_mode === "inclusive") { base = price / (1 + rate / 100); vat = price - base; }
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>
                    </TableCell>
                    <TableCell>৳ {price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{rate}%</TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.vat_mode}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Base ৳ {base.toFixed(2)} · VAT ৳ {vat.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <EditVat tenantId={tenantId} row={p} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function EditVat({ tenantId, row }: { tenantId: string; row: Row }) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(String(row.vat_rate ?? 0));
  const [mode, setMode] = useState<"inclusive" | "exclusive" | "none">((row.vat_mode as "inclusive" | "exclusive" | "none") ?? "exclusive");
  const qc = useQueryClient();
  const fn = useServerFn(updateProductVat);
  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, productId: row.id, vat_rate: Number(rate) || 0, vat_mode: mode } }),
    onSuccess: () => {
      toast.success("VAT updated");
      qc.invalidateQueries({ queryKey: ["pharmacy-packaging", tenantId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm">Edit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>VAT — {row.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">VAT mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusive">Exclusive (VAT added on top)</SelectItem>
                <SelectItem value="inclusive">Inclusive (VAT in price)</SelectItem>
                <SelectItem value="none">Tax-free</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">VAT rate (%)</Label>
            <Input type="number" step="0.5" value={rate} onChange={(e) => setRate(e.target.value)} disabled={mode === "none"} />
            <div className="flex gap-1 pt-1">
              {PRESETS.map((p) => (
                <Button key={p} type="button" size="sm" variant="outline" onClick={() => setRate(String(p))} disabled={mode === "none"}>
                  {p}%
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
