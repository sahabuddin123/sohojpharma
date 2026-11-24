import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dice5, Loader2, PackagePlus, Save, ShoppingCart } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  saveProduct,
  listProductCompanies, upsertProductCompany,
  listProductGenerics, upsertProductGeneric,
} from "@/lib/api/product-management.functions";
import { supabase } from "@/integrations/supabase/client";
import { AsyncSearchCombobox, type AsyncOption } from "@/components/ui/async-search-combobox";
import { cn } from "@/lib/utils";

export type QuickAddResult = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  retail_price: number;
  purchase_price: number;
  vat_rate: number;
  stock: number;
  generic_name: string | null;
  manufacturer_name: string | null;
  category_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  nearest_expiry: string | null;
  displayName: string;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  branchId?: string | null;
  onCreated?: (p: QuickAddResult, addToCart: boolean) => void;
};

type Form = {
  productName: string;
  barcode: string;
  sku: string;
  generic: string;
  company: string;
  category: string;
  medicineType: string;
  dosageForm: string;
  strength: string;
  unit: string;
  purchasePrice: string;
  mrp: string;
  salePrice: string;
  openingStock: string;
  reorderLevel: string;
  batchNo: string;
  expiryDate: string;
  rack: string;
};

const emptyForm = (): Form => ({
  productName: "", barcode: "", sku: "",
  generic: "", company: "", category: "",
  medicineType: "Medicine", dosageForm: "Tablet",
  strength: "", unit: "Box",
  purchasePrice: "", mrp: "", salePrice: "",
  openingStock: "0", reorderLevel: "0",
  batchNo: "", expiryDate: "", rack: "",
});

function genBarcode() {
  // 13-digit EAN-like starting with 880 (Bangladesh)
  return "880" + Math.floor(1_000_000_000 + Math.random() * 8_999_999_999).toString();
}
function genSku() {
  return "SKU-" + Math.floor(100_000 + Math.random() * 899_999).toString();
}

// Generic master table backed by supabase (client-side, respects RLS).
type MasterTable = "categories" | "dosage_forms" | "medicine_types" | "units";
function useMasterFetcher(tenantId: string, table: MasterTable, reloadToken: number) {
  return useCallback(
    async ({ search, page, pageSize }: { search: string; page: number; pageSize: number }) => {
      if (!tenantId) return { rows: [] as AsyncOption[], hasMore: false };
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let q = supabase.from(table).select("id,name", { count: "exact" })
        .eq("tenant_id", tenantId).order("name", { ascending: true }).range(from, to);
      if (search) q = q.ilike("name", `%${search}%`);
      const { data, count, error } = await q;
      if (error) return { rows: [], hasMore: false };
      const rows: AsyncOption[] = (data ?? []).map((r) => ({ id: r.id as string, label: r.name as string }));
      return { rows, hasMore: (count ?? 0) > page * pageSize };
    },
    // reloadToken forces re-instantiation → combobox refetches
    [tenantId, table, reloadToken],
  );
}

export function QuickAddProductDialog({ open, onOpenChange, tenantId, branchId, onCreated }: Props) {
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState<null | "save" | "cart">(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [barcodeStatus, setBarcodeStatus] = useState<"idle" | "checking" | "ok" | "dup">("idle");
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const saveFn = useServerFn(saveProduct);
  const listCompanies = useServerFn(listProductCompanies);
  const listGenerics = useServerFn(listProductGenerics);
  const upsertCompany = useServerFn(upsertProductCompany);
  const upsertGeneric = useServerFn(upsertProductGeneric);
  const qc = useQueryClient();

  // reload tokens per master
  const [rlCompany, setRlCompany] = useState(0);
  const [rlGeneric, setRlGeneric] = useState(0);
  const [rlCat, setRlCat] = useState(0);
  const [rlDosage, setRlDosage] = useState(0);
  const [rlMed, setRlMed] = useState(0);
  const [rlUnit, setRlUnit] = useState(0);

  // inline create-master dialog state
  const [createMaster, setCreateMaster] = useState<null | {
    kind: "company" | "generic" | "category" | "dosage_form" | "medicine_type" | "unit";
    name: string;
  }>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm(), barcode: genBarcode(), sku: genSku() });
    setErrors({});
    setBarcodeStatus("idle");
    setTimeout(() => firstFieldRef.current?.focus(), 50);
  }, [open]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  }

  // Debounced barcode uniqueness check
  useEffect(() => {
    if (!open || !tenantId) return;
    const bc = form.barcode.trim();
    if (!bc) { setBarcodeStatus("idle"); return; }
    setBarcodeStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase.from("products")
        .select("id").eq("tenant_id", tenantId).eq("barcode", bc)
        .is("deleted_at", null).maybeSingle();
      setBarcodeStatus(data ? "dup" : "ok");
    }, 300);
    return () => clearTimeout(t);
  }, [form.barcode, tenantId, open]);

  // ---- Async fetchers ----
  const fetchCompanies = useCallback(async ({ search, page, pageSize }: { search: string; page: number; pageSize: number }) => {
    if (!tenantId) return { rows: [] as AsyncOption[], hasMore: false };
    const res = await listCompanies({ data: { tenantId, page, pageSize, search: search || undefined } });
    const rows: AsyncOption[] = (res.rows as Array<{ id: string; name: string; code?: string | null }>).map((r) => ({
      id: r.id, label: r.name, sublabel: r.code ?? undefined,
    }));
    return { rows, hasMore: page * pageSize < (res.count ?? 0) };
  }, [tenantId, listCompanies]);

  const fetchGenerics = useCallback(async ({ search, page, pageSize }: { search: string; page: number; pageSize: number }) => {
    if (!tenantId) return { rows: [] as AsyncOption[], hasMore: false };
    const res = await listGenerics({ data: { tenantId, page, pageSize, search: search || undefined } });
    const rows: AsyncOption[] = (res.rows as Array<{ id: string; name: string; description?: string | null }>).map((r) => ({
      id: r.id, label: r.name, sublabel: r.description ?? undefined,
    }));
    return { rows, hasMore: page * pageSize < (res.count ?? 0) };
  }, [tenantId, listGenerics]);

  const fetchCategories   = useMasterFetcher(tenantId, "categories", rlCat);
  const fetchDosage       = useMasterFetcher(tenantId, "dosage_forms", rlDosage);
  const fetchMedicineType = useMasterFetcher(tenantId, "medicine_types", rlMed);
  const fetchUnits        = useMasterFetcher(tenantId, "units", rlUnit);

  // ---- Calculations ----
  const calc = useMemo(() => {
    const p = Number(form.purchasePrice) || 0;
    const s = Number(form.salePrice) || 0;
    const profit = s - p;
    const margin = s > 0 ? (profit / s) * 100 : 0;
    return { profit, margin };
  }, [form.purchasePrice, form.salePrice]);

  function validate(): boolean {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.productName.trim()) e.productName = "Required";
    if (!form.category.trim())    e.category = "Required";
    if (!form.generic.trim())     e.generic = "Required";
    if (!form.company.trim())     e.company = "Required";
    if (!form.unit.trim())        e.unit = "Required";
    const sale = Number(form.salePrice);
    if (!form.salePrice || isNaN(sale) || sale < 0) e.salePrice = "Required";
    if (barcodeStatus === "dup") e.barcode = "Barcode already exists";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function checkSkuUnique(): Promise<boolean> {
    if (!form.sku.trim()) return true;
    const { data } = await supabase.from("products").select("id")
      .eq("tenant_id", tenantId).eq("sku", form.sku.trim())
      .is("deleted_at", null).maybeSingle();
    return !data;
  }

  async function doSave(addToCart: boolean) {
    if (!validate()) return;
    if (!tenantId) { toast.error("No tenant"); return; }
    if (Number(form.salePrice) < Number(form.purchasePrice || 0)) {
      toast.warning("Sale price is below purchase price");
    }
    setSaving(addToCart ? "cart" : "save");
    try {
      if (!(await checkSkuUnique())) {
        setErrors((e) => ({ ...e, sku: "SKU already exists" }));
        setSaving(null);
        return;
      }
      const opening = Number(form.openingStock) || 0;
      const purchase = Number(form.purchasePrice) || 0;
      const sale = Number(form.salePrice) || 0;

      const res = await saveFn({
        data: {
          tenantId,
          branchId: branchId ?? null,
          productName: form.productName.trim(),
          genericName: form.generic.trim() || null,
          companyName: form.company.trim() || "Unknown",
          medicineType: form.dosageForm.trim() || form.medicineType.trim() || null,
          strength: form.strength.trim() || null,
          volume: null,
          unitType: form.unit.trim() || "Box",
          quantityPerBox: 1,
          purchasePrice: purchase,
          salePrice: sale,
          barcode: form.barcode.trim() || null,
          countryOfOrigin: null,
          openingStock: opening,
          reorderLevel: Number(form.reorderLevel) || 0,
          status: "active" as const,
        },
      });
      const productId = (res as { id?: string })?.id;
      if (!productId) throw new Error("Save failed");

      // Patch SKU + rack if provided (best-effort)
      const productPatch: { sku?: string; rack_number?: string } = {};
      if (form.sku.trim()) productPatch.sku = form.sku.trim();
      if (form.rack.trim()) productPatch.rack_number = form.rack.trim();
      if (Object.keys(productPatch).length) {
        await supabase.from("products").update(productPatch)
          .eq("tenant_id", tenantId).eq("id", productId);
      }

      // Patch opening batch metadata (best-effort)
      if (opening > 0 && (form.batchNo || form.expiryDate || form.mrp)) {
        const patch: { batch_no?: string; expiry_date?: string; mrp?: number } = {};
        if (form.batchNo.trim()) patch.batch_no = form.batchNo.trim();
        if (form.expiryDate) patch.expiry_date = form.expiryDate;
        if (form.mrp && Number(form.mrp) > 0) patch.mrp = Number(form.mrp);
        if (Object.keys(patch).length) {
          await supabase.from("batches").update(patch)
            .eq("tenant_id", tenantId).eq("product_id", productId).eq("is_opening", true);
        }
      }

      await qc.invalidateQueries({ queryKey: ["pos-search"] });
      toast.success("Product created");
      onCreated?.({
        id: productId,
        name: form.productName.trim(),
        displayName: form.productName.trim(),
        sku: form.sku.trim() || "",
        barcode: form.barcode.trim() || null,
        retail_price: Number(form.mrp) > 0 ? Number(form.mrp) : sale,
        purchase_price: purchase,
        vat_rate: 0,
        stock: opening,
        generic_name: form.generic.trim() || null,
        manufacturer_name: form.company.trim() || null,
        category_name: form.category.trim() || null,
        strength: form.strength.trim() || null,
        dosage_form: form.dosageForm.trim() || null,
        nearest_expiry: form.expiryDate || null,
      }, addToCart);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSaving(null);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault(); void doSave(true);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault(); void doSave(false);
    }
  }

  // Inline create handlers
  async function handleCreateMaster(name: string) {
    if (!createMaster) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      if (createMaster.kind === "company") {
        await upsertCompany({ data: { tenantId, branchId: null, name: trimmed, code: null, country: null, address: null, phone: null, email: null, status: "active" } });
        setRlCompany((n) => n + 1); set("company", trimmed);
      } else if (createMaster.kind === "generic") {
        await upsertGeneric({ data: { tenantId, branchId: null, generic_name: trimmed, description: null, status: "active" } });
        setRlGeneric((n) => n + 1); set("generic", trimmed);
      } else {
        const table: MasterTable =
          createMaster.kind === "category" ? "categories" :
          createMaster.kind === "dosage_form" ? "dosage_forms" :
          createMaster.kind === "medicine_type" ? "medicine_types" : "units";
        const { error } = await supabase.from(table).insert({ tenant_id: tenantId, name: trimmed });
        if (error) throw error;
        if (createMaster.kind === "category") { setRlCat((n) => n + 1); set("category", trimmed); }
        else if (createMaster.kind === "dosage_form") { setRlDosage((n) => n + 1); set("dosageForm", trimmed); }
        else if (createMaster.kind === "medicine_type") { setRlMed((n) => n + 1); set("medicineType", trimmed); }
        else { setRlUnit((n) => n + 1); set("unit", trimmed); }
      }
      toast.success("Created");
      setCreateMaster(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto"
        onKeyDown={onKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" /> Quick Add Product
          </DialogTitle>
          <DialogDescription>
            Shortcuts: <b>Ctrl+S</b> save · <b>Ctrl+Enter</b> save &amp; add · <b>Esc</b> close
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <div className="space-y-5">
            {/* Basic */}
            <Section title="Basic">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Product Name *" error={errors.productName} className="md:col-span-2">
                  <Input ref={firstFieldRef} value={form.productName} onChange={(e) => set("productName", e.target.value)} />
                </Field>

                <Field label="Barcode" error={errors.barcode}>
                  <div className="flex gap-2">
                    <Input
                      value={form.barcode}
                      onChange={(e) => set("barcode", e.target.value)}
                      className={cn("font-mono",
                        barcodeStatus === "dup" && "border-destructive",
                        barcodeStatus === "ok" && "border-emerald-500")}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => set("barcode", genBarcode())} title="Generate again">
                      <Dice5 className="h-4 w-4" />
                    </Button>
                  </div>
                  {barcodeStatus === "dup" && <p className="text-[11px] text-destructive">Barcode already exists</p>}
                  {barcodeStatus === "ok" && <p className="text-[11px] text-emerald-600">Available</p>}
                </Field>

                <Field label="SKU" error={errors.sku}>
                  <div className="flex gap-2">
                    <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} className="font-mono" />
                    <Button type="button" variant="outline" size="icon" onClick={() => set("sku", genSku())} title="Generate again">
                      <Dice5 className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>

                <Field label="Generic *" error={errors.generic}>
                  <AsyncSearchCombobox
                    value={form.generic}
                    onChange={(name) => set("generic", name)}
                    placeholder="Search generic..."
                    createLabel="Create New Generic"
                    onCreateNew={(q) => setCreateMaster({ kind: "generic", name: q })}
                    fetchPage={fetchGenerics}
                    reloadToken={rlGeneric}
                    error={!!errors.generic}
                  />
                </Field>
                <Field label="Manufacturer *" error={errors.company}>
                  <AsyncSearchCombobox
                    value={form.company}
                    onChange={(name) => set("company", name)}
                    placeholder="Search manufacturer..."
                    createLabel="Create New Manufacturer"
                    onCreateNew={(q) => setCreateMaster({ kind: "company", name: q })}
                    fetchPage={fetchCompanies}
                    reloadToken={rlCompany}
                    error={!!errors.company}
                  />
                </Field>
                <Field label="Category *" error={errors.category}>
                  <AsyncSearchCombobox
                    value={form.category}
                    onChange={(name) => set("category", name)}
                    placeholder="Search category..."
                    createLabel="Create New Category"
                    onCreateNew={(q) => setCreateMaster({ kind: "category", name: q })}
                    fetchPage={fetchCategories}
                    reloadToken={rlCat}
                    error={!!errors.category}
                  />
                </Field>
                <Field label="Dosage Form">
                  <AsyncSearchCombobox
                    value={form.dosageForm}
                    onChange={(name) => set("dosageForm", name)}
                    placeholder="Search dosage form..."
                    createLabel="Create New Dosage Form"
                    onCreateNew={(q) => setCreateMaster({ kind: "dosage_form", name: q })}
                    fetchPage={fetchDosage}
                    reloadToken={rlDosage}
                  />
                </Field>
                <Field label="Medicine Type">
                  <AsyncSearchCombobox
                    value={form.medicineType}
                    onChange={(name) => set("medicineType", name)}
                    placeholder="Search medicine type..."
                    createLabel="Create New Medicine Type"
                    onCreateNew={(q) => setCreateMaster({ kind: "medicine_type", name: q })}
                    fetchPage={fetchMedicineType}
                    reloadToken={rlMed}
                  />
                </Field>
                <Field label="Strength">
                  <Input value={form.strength} onChange={(e) => set("strength", e.target.value)} placeholder="500mg" />
                </Field>
                <Field label="Unit *" error={errors.unit}>
                  <AsyncSearchCombobox
                    value={form.unit}
                    onChange={(name) => set("unit", name)}
                    placeholder="Search unit..."
                    createLabel="Create New Unit"
                    onCreateNew={(q) => setCreateMaster({ kind: "unit", name: q })}
                    fetchPage={fetchUnits}
                    reloadToken={rlUnit}
                    error={!!errors.unit}
                  />
                </Field>
              </div>
            </Section>

            {/* Pricing */}
            <Section title="Pricing">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Purchase Price">
                  <Input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} />
                </Field>
                <Field label="MRP">
                  <Input type="number" step="0.01" value={form.mrp} onChange={(e) => set("mrp", e.target.value)} />
                </Field>
                <Field label="Sale Price *" error={errors.salePrice}>
                  <Input type="number" step="0.01" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} />
                </Field>
              </div>
            </Section>

            {/* Inventory */}
            <Section title="Inventory">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Opening Stock">
                  <Input type="number" value={form.openingStock} onChange={(e) => set("openingStock", e.target.value)} />
                </Field>
                <Field label="Reorder Level">
                  <Input type="number" value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} />
                </Field>
                <Field label="Batch">
                  <Input value={form.batchNo} onChange={(e) => set("batchNo", e.target.value)} />
                </Field>
                <Field label="Expiry Date">
                  <Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
                </Field>
                <Field label="Rack">
                  <Input value={form.rack} onChange={(e) => set("rack", e.target.value)} />
                </Field>
              </div>
            </Section>
          </div>

          {/* Right rail: pricing summary */}
          <aside className="space-y-3 rounded-xl border bg-muted/30 p-4 md:sticky md:top-2 md:self-start">
            <p className="text-xs font-bold uppercase text-muted-foreground">Pricing Summary</p>
            <SummaryRow label="Purchase" value={`৳${(Number(form.purchasePrice) || 0).toFixed(2)}`} />
            <SummaryRow label="Sale"     value={`৳${(Number(form.salePrice) || 0).toFixed(2)}`} />
            <SummaryRow label="Profit"   value={`৳${calc.profit.toFixed(2)}`}
              valueClass={calc.profit >= 0 ? "text-emerald-600" : "text-destructive"} />
            <SummaryRow label="Margin"   value={`${calc.margin.toFixed(2)}%`} large
              valueClass={calc.margin >= 0 ? "text-emerald-600" : "text-destructive"} />
            <div className={cn("rounded-md p-2 text-[11px]",
              calc.profit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-destructive")}>
              {calc.profit >= 0 ? "Pricing looks healthy." : "Sale price is below cost."}
            </div>
          </aside>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!saving}>Cancel</Button>
          <Button variant="secondary" onClick={() => doSave(false)} disabled={!!saving || barcodeStatus === "dup"}>
            {saving === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Product
          </Button>
          <Button onClick={() => doSave(true)} disabled={!!saving || barcodeStatus === "dup"}>
            {saving === "cart" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
            Save &amp; Add to Cart
          </Button>
        </DialogFooter>

        {createMaster && (
          <CreateMasterDialog
            initialName={createMaster.name}
            title={`New ${labelFor(createMaster.kind)}`}
            withDescription={createMaster.kind === "generic" || createMaster.kind === "category"}
            onCancel={() => setCreateMaster(null)}
            onSave={handleCreateMaster}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function labelFor(k: string) {
  return ({
    company: "Manufacturer", generic: "Generic", category: "Category",
    dosage_form: "Dosage Form", medicine_type: "Medicine Type", unit: "Unit",
  } as Record<string, string>)[k] ?? k;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, error, className, children }: {
  label: string; error?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );
}

function SummaryRow({ label, value, large, valueClass }: {
  label: string; value: string; large?: boolean; valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("font-bold tabular-nums", large ? "text-xl" : "text-sm", valueClass)}>{value}</span>
    </div>
  );
}

function CreateMasterDialog({
  title, initialName, withDescription, onSave, onCancel,
}: {
  title: string; initialName: string; withDescription?: boolean;
  onSave: (name: string, description?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md" onKeyDown={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {withDescription && (
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => { setBusy(true); try { await onSave(name.trim(), desc || undefined); } finally { setBusy(false); } }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default QuickAddProductDialog;
