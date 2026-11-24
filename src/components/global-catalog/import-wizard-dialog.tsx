import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export type ImportOptions = {
  create_products: boolean;
  create_inventory: boolean;
  create_barcodes: boolean;
  link_generic: boolean;
  link_manufacturer: boolean;
  create_categories: boolean;
  create_initial_stock: boolean;
  opening_stock: number;
  purchase_price: number;
  sale_price: number;
  status: "active" | "inactive";
};

const DEFAULTS: ImportOptions = {
  create_products: true,
  create_inventory: true,
  create_barcodes: true,
  link_generic: true,
  link_manufacturer: true,
  create_categories: true,
  create_initial_stock: true,
  opening_stock: 0,
  purchase_price: 0,
  sale_price: 0,
  status: "active",
};

export function ImportWizardDialog({
  open, onOpenChange, scopeLabel, onConfirm, isPending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scopeLabel: string;
  onConfirm: (opts: ImportOptions) => void;
  isPending: boolean;
}) {
  const [o, setO] = useState<ImportOptions>(DEFAULTS);
  const upd = <K extends keyof ImportOptions>(k: K, v: ImportOptions[K]) => setO((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Inventory Import Wizard</DialogTitle>
          <p className="text-sm text-muted-foreground">{scopeLabel}</p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          {[
            ["create_products", "Create Product Records"],
            ["create_inventory", "Create Inventory Records"],
            ["create_barcodes", "Create Barcode Records"],
            ["link_generic", "Link Generic"],
            ["link_manufacturer", "Link Manufacturer"],
            ["create_categories", "Create Product Categories"],
            ["create_initial_stock", "Create Initial Stock Entries"],
          ].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={o[k as keyof ImportOptions] as boolean}
                onCheckedChange={(v) => upd(k as keyof ImportOptions, !!v as never)}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3 pt-2 border-t">
          <div>
            <Label className="text-xs">Opening Stock</Label>
            <Input type="number" value={o.opening_stock}
              onChange={(e) => upd("opening_stock", Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Purchase Price</Label>
            <Input type="number" value={o.purchase_price}
              onChange={(e) => upd("purchase_price", Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Sale Price</Label>
            <Input type="number" value={o.sale_price}
              onChange={(e) => upd("sale_price", Number(e.target.value) || 0)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Branch = Head Office · Warehouse = Default · Status = Active
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onConfirm(o)} disabled={isPending}>
            {isPending ? "Starting…" : "Start Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
