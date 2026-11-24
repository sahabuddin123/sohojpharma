"use client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pill, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { findAlternatives } from "@/lib/api/substitutes.functions";

type Alt = {
  id: string; name: string; name_bn: string | null; sku: string;
  retail_price: number; manufacturer: string | null; stock: number;
};

/**
 * Modal that lists same-generic substitutes for a product.
 * Open it from POS when a chosen product is out of stock.
 */
export function AlternativeMedicineModal({
  tenantId,
  productId,
  open,
  onOpenChange,
  onPick,
}: {
  tenantId: string;
  productId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick?: (alt: Alt) => void;
}) {
  const fn = useServerFn(findAlternatives);
  const { data, isLoading } = useQuery({
    queryKey: ["alternatives", tenantId, productId],
    queryFn: () => fn({ data: { tenantId, product_id: productId! } }),
    enabled: open && !!productId && !!tenantId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            Alternative medicines
            {data?.generic && <Badge variant="outline">Generic: {data.generic}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Searching…</p>
        ) : (data?.alternatives.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {data?.generic ? "No alternatives in stock." : "This product has no generic mapped."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.alternatives.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.name}</p>
                    {a.name_bn && <p className="text-xs text-muted-foreground">{a.name_bn}</p>}
                  </TableCell>
                  <TableCell>{a.manufacturer ?? "—"}</TableCell>
                  <TableCell className="text-right">{a.retail_price.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={a.stock > 0 ? "outline" : "secondary"} className={a.stock > 0 ? "border-emerald-500 text-emerald-700" : ""}>
                      {a.stock}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {onPick && a.stock > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => onPick(a)}>
                        <ShoppingCart className="mr-1 h-3.5 w-3.5" /> Use
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
