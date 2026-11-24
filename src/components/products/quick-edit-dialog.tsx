import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { updateProductPricing } from "@/lib/api/product-management.functions";
import { adjustBatch } from "@/lib/api/batch-control.functions";

const normalizeUnit = (value: unknown) => String(value ?? "").trim().toLowerCase();

const UNITS = [
  "pcs", "strip", "box", "bottle", "pack", "vial", "tube", "tablet", "capsule",
  "syrup", "suspension", "drops", "inhaler", "injection", "ampoule", "sachet",
  "cream", "ointment", "gel", "lotion", "spray", "suppository", "patch",
  "powder", "granules", "solution", "syringe", "cartridge", "dozen", "carton",
  "ml", "mg", "gm", "kg", "ltr", "mcg", "iu",
];

export type QuickEditProduct = {
  id: string;
  name: string;
  stock: number;
  purchase_price: number | null;
  retail_price: number | null;
};

type BatchOpt = { id: string; batch_no: string; qty_on_hand: number };

export function QuickEditProductDialog({
  tenantId, product, onClose, onDone,
}: { tenantId: string; product: QuickEditProduct; onClose: () => void; onDone?: () => void }) {
  const qc = useQueryClient();
  const adjustFn = useServerFn(adjustBatch);
  const updateFn = useServerFn(updateProductPricing);
  const [stock, setStock] = useState(String(product.stock));
  const [pPrice, setPPrice] = useState(String(product.purchase_price ?? 0));
  const [rPrice, setRPrice] = useState(String(product.retail_price ?? 0));
  const [unit, setUnit] = useState<string>("");

  const { data: prodMeta } = useQuery({
    queryKey: ["quick-product-unit", tenantId, product.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("unit,sale_unit,base_unit")
        .eq("tenant_id", tenantId)
        .eq("id", product.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const savedUnit = normalizeUnit(prodMeta?.unit || prodMeta?.sale_unit || prodMeta?.base_unit);
    if (savedUnit) setUnit(savedUnit);
  }, [prodMeta?.unit, prodMeta?.sale_unit, prodMeta?.base_unit]);

  const { data: batches, isLoading } = useQuery({
    queryKey: ["quick-batches", tenantId, product.id],
    queryFn: async (): Promise<BatchOpt[]> => {
      const { data, error } = await supabase
        .from("batches")
        .select("id,batch_no,qty_on_hand")
        .eq("tenant_id", tenantId)
        .eq("product_id", product.id)
        .order("qty_on_hand", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BatchOpt[];
    },
  });


  const mut = useMutation({
    mutationFn: async () => {
      const newStock = Number(stock);
      const delta = newStock - product.stock;

      if (delta !== 0) {
        const existing = batches?.find((b) => b.qty_on_hand > 0) ?? batches?.[0];
        if (existing) {
          if (delta < 0 && Math.abs(delta) > existing.qty_on_hand) {
            throw new Error(`Cannot reduce more than batch qty (${existing.qty_on_hand})`);
          }
          await adjustFn({ data: { tenantId, batchId: existing.id, delta, reason: "manual", notes: "Quick edit" } });
        } else if (delta > 0) {
          // No batch — create opening batch
          const { data: userRes } = await supabase.auth.getUser();
          const uid = userRes.user?.id;
          if (!uid) throw new Error("Not signed in");
          const { data: branchId, error: brErr } = await supabase.rpc("resolve_user_branch", { _tenant_id: tenantId, _user_id: uid });
          if (brErr) throw brErr;
          if (!branchId) throw new Error("No branch found. Set up a branch first.");
          const expiry = new Date();
          expiry.setFullYear(expiry.getFullYear() + 2);
          const { error: insErr } = await supabase.from("batches").insert({
            tenant_id: tenantId,
            product_id: product.id,
            branch_id: branchId,
            batch_no: "OPENING",
            qty_on_hand: delta,
            purchase_price: Number(pPrice) || 0,
            expiry_date: expiry.toISOString().slice(0, 10),
            is_opening: true,
          });
          if (insErr) throw insErr;
        } else {
          throw new Error("No stock to reduce");
        }
      }

      await updateFn({
        data: {
          tenantId,
          id: product.id,
          purchase_price: Number(pPrice) || 0,
          retail_price: Number(rPrice) || 0,
          unit: normalizeUnit(unit) || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["products-management"] });
      qc.setQueryData(["quick-product-unit", tenantId, product.id], (old: { unit?: string; sale_unit?: string; base_unit?: string } | undefined) => ({
        ...old,
        unit: normalizeUnit(unit),
        sale_unit: normalizeUnit(unit),
        base_unit: normalizeUnit(unit),
      }));
      qc.invalidateQueries({ queryKey: ["quick-product-unit", tenantId, product.id] });
      qc.invalidateQueries({ queryKey: ["in-stock-products"] });
      qc.invalidateQueries({ queryKey: ["inventory-overview"] });
      onDone?.();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const unitOptions = useMemo(() => {
    const selected = normalizeUnit(unit);
    return selected && !UNITS.includes(selected) ? [selected, ...UNITS] : UNITS;
  }, [unit]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick Edit — {product.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Unit Type</Label>
              <Select value={normalizeUnit(unit)} onValueChange={(value) => setUnit(normalizeUnit(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {unitOptions.map((u) => (
                    <SelectItem key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Opening Stock (current: {product.stock})</Label>
              <Input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                Difference is applied to the largest batch, or creates an opening batch if none exists.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Purchase Price</Label>
                <Input type="number" min="0" step="0.01" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
              </div>
              <div>
                <Label>Selling Price</Label>
                <Input type="number" min="0" step="0.01" value={rPrice} onChange={(e) => setRPrice(e.target.value)} />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || isLoading}>
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

