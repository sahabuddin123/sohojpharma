import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, ChevronRight, Save, Plus, ScanBarcode,
  Package, BarChart3, DollarSign, Pill, Tag, Clock,
  Eye, Printer, Download, Loader2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  getProductForEdit, saveProduct,
  listProductCompanies, upsertProductCompany,
  listProductGenerics, upsertProductGeneric,
} from "@/lib/api/product-management.functions";
import { AsyncSearchCombobox, type AsyncOption } from "@/components/ui/async-search-combobox";
import { useTranslation } from "react-i18next";

type Mode = "new" | "edit";

interface ProductFormProps {
  mode: Mode;
  productId?: string;
  initial?: Partial<FormState>;
}

interface FormState {
  name: string;
  strength: string;
  volume: string;
  medicineType: string;
  company: string;
  generic: string;
  country: string;
  barcode: string;
  unitType: string;
  qtyPerBox: number;
  costPerBox: number;
  salePerBox: number;
  openingStock: number;
  reorderLevel: number;
  isMedicine: boolean;
  prescriptionRequired: boolean;
  trackExpiry: boolean;
  trackBatch: boolean;
  allowNegative: boolean;
  otc: boolean;
  active: boolean;
}

const DEFAULTS: FormState = {
  name: "", strength: "", volume: "", medicineType: "", company: "",
  generic: "", country: "", barcode: "",
  unitType: "Box", qtyPerBox: 0, costPerBox: 0, salePerBox: 0, openingStock: 0, reorderLevel: 0,
  isMedicine: true, prescriptionRequired: false, trackExpiry: true,
  trackBatch: true, allowNegative: false, otc: false, active: true,
};

const MEDICINE_TYPES = ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops", "Inhaler", "Suppository"];
const UNITS = ["Box", "Strip", "Bottle", "Vial", "Tube", "Piece"];
const COUNTRIES = ["Bangladesh", "India", "UK", "USA", "Germany", "Switzerland"];

export function ProductForm({ mode, productId, initial }: ProductFormProps) {

  const { t } = useTranslation();
  const isEdit = mode === "edit";
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const navigate = useNavigate();
  const getProduct = useServerFn(getProductForEdit);
  const saveProductFn = useServerFn(saveProduct);
  const listCompaniesFn = useServerFn(listProductCompanies);
  const listGenericsFn = useServerFn(listProductGenerics);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ ...DEFAULTS, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [genericDialogOpen, setGenericDialogOpen] = useState(false);

  const [companyReload, setCompanyReload] = useState(0);
  const [genericReload, setGenericReload] = useState(0);

  const fetchCompanies = React.useCallback(
    async ({ search, page, pageSize }: { search: string; page: number; pageSize: number }) => {
      if (!tenantId) return { rows: [], hasMore: false };
      const res = await listCompaniesFn({ data: { tenantId, page, pageSize, search: search || undefined } });
      const rows: AsyncOption[] = (res.rows as Array<{ id: string; name: string; code?: string | null; country?: string | null }>).map((r) => ({
        id: r.id, label: r.name, sublabel: [r.code, r.country].filter(Boolean).join(" · ") || undefined,
      }));
      return { rows, hasMore: page * pageSize < (res.count ?? 0) };
    },
    [tenantId, listCompaniesFn],
  );

  const fetchGenerics = React.useCallback(
    async ({ search, page, pageSize }: { search: string; page: number; pageSize: number }) => {
      if (!tenantId) return { rows: [], hasMore: false };
      const res = await listGenericsFn({ data: { tenantId, page, pageSize, search: search || undefined } });
      const rows: AsyncOption[] = (res.rows as Array<{ id: string; name: string; description?: string | null }>).map((r) => ({
        id: r.id, label: r.name, sublabel: r.description ?? undefined,
      }));
      return { rows, hasMore: page * pageSize < (res.count ?? 0) };
    },
    [tenantId, listGenericsFn],
  );


  const editQuery = useQuery({
    queryKey: ["product-edit", tenantId, productId],
    enabled: isEdit && !!tenantId && !!productId,
    queryFn: () => getProduct({ data: { tenantId, id: productId!, branchId: null } }),
  });

  useEffect(() => {
    const p = editQuery.data;
    if (!p) return;
    type Rel = { name?: string } | null;
    setForm((f) => ({
      ...f,
      name: p.name ?? "",
      strength: p.strength ?? "",
      volume: p.volume ?? "",
      medicineType: p.medicine_type ?? "",
      company: ((p.manufacturers as Rel)?.name) ?? "",
      generic: ((p.generics as Rel)?.name) ?? "",
      country: p.country_of_origin ?? "",
      barcode: p.barcode ?? "",
      unitType: p.unit ?? "Box",
      qtyPerBox: Number(p.qty_per_box ?? p.pack_size ?? 1),
      costPerBox: Number(p.purchase_price ?? 0),
      salePerBox: Number(p.retail_price ?? 0),
      reorderLevel: Number(p.reorder_level ?? 0),
      openingStock: ((p.batches as { qty_on_hand?: number | null }[] | null) ?? []).reduce((s, b) => s + Number(b.qty_on_hand ?? 0), 0),
      active: p.is_active ?? true,
      prescriptionRequired: p.is_prescription_required ?? false,
    }));
  }, [editQuery.data]);

  // unsaved changes warning
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setErrors((e) => { const n = { ...e }; delete n[key as string]; return n; });
  };

  const calc = useMemo(() => {
    const qty = Number(form.qtyPerBox) || 0;
    const cost = Number(form.costPerBox) || 0;
    const sale = Number(form.salePerBox) || 0;
    const costPiece = qty > 0 ? cost / qty : 0;
    const salePiece = qty > 0 ? sale / qty : 0;
    const profitPiece = salePiece - costPiece;
    const margin = salePiece > 0 ? (profitPiece / salePiece) * 100 : 0;
    return { costPiece, salePiece, profitPiece, margin };
  }, [form.qtyPerBox, form.costPerBox, form.salePerBox]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Product name is required";
    if (!form.medicineType) e.medicineType = "Medicine type is required";
    if (!form.company) e.company = "Company is required";
    if (!form.generic) e.generic = "Generic name is required";
    if (!form.qtyPerBox || form.qtyPerBox <= 0) e.qtyPerBox = "Required";
    if (!form.costPerBox || form.costPerBox <= 0) e.costPerBox = "Required";
    if (!form.salePerBox || form.salePerBox <= 0) e.salePerBox = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (draft = false) => {
    if (!draft && !validate()) {
      toast.error(t("toast.fixHighlightedFields"));
      return;
    }
    if (!tenantId) { toast.error(t("toast.tenantNotSelected")); return; }
    setSaving(true);
    try {
      await saveProductFn({ data: {
        tenantId,
        branchId: null,
        id: isEdit ? productId : undefined,
        productName: form.name,
        genericName: form.generic,
        companyName: form.company,
        medicineType: form.medicineType,
        strength: form.strength,
        volume: form.volume,
        unitType: form.unitType,
        quantityPerBox: Number(form.qtyPerBox) || 1,
        purchasePrice: Number(form.costPerBox) || 0,
        salePrice: Number(form.salePerBox) || 0,
        barcode: form.barcode,
        countryOfOrigin: form.country,
        openingStock: Number(form.openingStock) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        status: form.active && !draft ? "active" : "inactive",
      } });
      setDirty(false);
      toast.success(draft ? "Draft saved" : isEdit ? "Product updated" : "Product created");
      await navigate({ to: "/products" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const generateBarcode = () => {
    const code = "880" + Math.floor(1000000000 + Math.random() * 8999999999).toString();
    update("barcode", code);
    toast.success(t("toast.barcodeGenerated"));
  };

  return (
    <AppShell variant="store" title={isEdit ? "Edit product" : "Add product"}>
      {isEdit && editQuery.isLoading ? (
        <div className="grid min-h-[50vh] place-items-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading product…</div>
      ) : (
      <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-slate-50 px-4 pb-28 pt-6 sm:-mx-6 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <nav className="mb-2 flex items-center gap-1 text-xs text-slate-500">
              <Link to="/products" className="hover:text-slate-900">Products</Link>
              <ChevronRight className="h-3 w-3" />
              <Link to="/products" className="hover:text-slate-900">Product List</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-slate-900">{isEdit ? "Edit Product" : "Add Product"}</span>
            </nav>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild className="h-8 px-2">
                <Link to="/products"><ArrowLeft className="h-4 w-4" /></Link>
              </Button>
              <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">
                {isEdit ? "Edit Product" : "Add Product"}
              </h1>
              {isEdit && productId && (
                <Badge variant="outline" className="border-indigo-200 bg-indigo-50 font-mono text-xs text-indigo-700">
                  PRD-{productId.slice(0, 6).toUpperCase()}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
              Save Draft
            </Button>
            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="bg-indigo-700 text-white hover:bg-indigo-800"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEdit ? "Update Product" : "Create Product"}
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: 2 cols */}
          <div className="space-y-6 lg:col-span-2">
            <FormCard icon={<Package className="h-4 w-4 text-indigo-700" />} title="Product Information">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Product Name" required error={errors.name} className="md:col-span-2">
                  <Input autoFocus value={form.name} onChange={(e) => update("name", e.target.value)}
                    className={cn("h-12", errors.name && "border-red-500")} placeholder="e.g. Napa Extra 500mg" />
                </Field>
                <Field label="Strength">
                  <Input value={form.strength} onChange={(e) => update("strength", e.target.value)} className="h-12" placeholder="500mg" />
                </Field>
                <Field label="Volume">
                  <Input value={form.volume} onChange={(e) => update("volume", e.target.value)} className="h-12" placeholder="10ml" />
                </Field>
                <Field label="Medicine Type" required error={errors.medicineType}>
                  <Select value={form.medicineType} onValueChange={(v) => update("medicineType", v)}>
                    <SelectTrigger className={cn("h-12", errors.medicineType && "border-red-500")}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>{MEDICINE_TYPES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Country Of Origin">
                  <Select value={form.country} onValueChange={(v) => update("country", v)}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Select country" /></SelectTrigger>
                    <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Company" required error={errors.company}>
                  <AsyncSearchCombobox
                    value={form.company}
                    onChange={(name) => update("company", name)}
                    placeholder="Search company..."
                    createLabel="Create New Company"
                    onCreateNew={() => setCompanyDialogOpen(true)}
                    fetchPage={fetchCompanies}
                    reloadToken={companyReload}
                    error={!!errors.company}
                  />
                </Field>
                <Field label="Generic Name" required error={errors.generic}>
                  <AsyncSearchCombobox
                    value={form.generic}
                    onChange={(name) => update("generic", name)}
                    placeholder="Search generic..."
                    createLabel="Create New Generic"
                    onCreateNew={() => setGenericDialogOpen(true)}
                    fetchPage={fetchGenerics}
                    reloadToken={genericReload}
                    error={!!errors.generic}
                  />
                </Field>
              </div>
            </FormCard>

            <FormCard icon={<BarChart3 className="h-4 w-4 text-indigo-700" />} title="Inventory Information">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Unit Type" required>
                  <Select value={form.unitType} onValueChange={(v) => update("unitType", v)}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Quantity Per Box" required error={errors.qtyPerBox} hint="Quantity contained in one box.">
                  <Input type="number" min={0} value={form.qtyPerBox || ""}
                    onChange={(e) => update("qtyPerBox", Number(e.target.value))}
                    className={cn("h-12", errors.qtyPerBox && "border-red-500")} placeholder="0" />
                </Field>
                <Field label="Opening Stock">
                  <Input type="number" min={0} value={form.openingStock || ""}
                    onChange={(e) => update("openingStock", Number(e.target.value))}
                    className="h-12" placeholder="0" />
                </Field>
                <Field label="Reorder Level">
                  <Input type="number" min={0} value={form.reorderLevel || ""}
                    onChange={(e) => update("reorderLevel", Number(e.target.value))}
                    className="h-12" placeholder="0" />
                </Field>
              </div>
            </FormCard>

            <FormCard icon={<DollarSign className="h-4 w-4 text-indigo-700" />} title="Pricing Information">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Cost Per Box (৳)" required error={errors.costPerBox}>
                  <Input type="number" step="0.01" value={form.costPerBox || ""}
                    onChange={(e) => update("costPerBox", Number(e.target.value))}
                    className={cn("h-12", errors.costPerBox && "border-red-500")} placeholder="0.00" />
                </Field>
                <Field label="Sale Price Per Box (৳)" required error={errors.salePerBox}>
                  <Input type="number" step="0.01" value={form.salePerBox || ""}
                    onChange={(e) => update("salePerBox", Number(e.target.value))}
                    className={cn("h-12", errors.salePerBox && "border-red-500")} placeholder="0.00" />
                </Field>
              </div>
            </FormCard>

            <FormCard icon={<Pill className="h-4 w-4 text-indigo-700" />} title="Product Configuration">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["isMedicine", "Medicine"],
                  ["prescriptionRequired", "Prescription Required"],
                  ["trackExpiry", "Track Expiry Date"],
                  ["trackBatch", "Track Batch Number"],
                  ["allowNegative", "Allow Negative Stock"],
                  ["otc", "OTC Product"],
                  ["active", "Show as Active Product"],
                ].map(([k, label]) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30">
                    <Checkbox checked={form[k as keyof FormState] as boolean}
                      onCheckedChange={(c) => update(k as keyof FormState, !!c as never)} />
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                  </label>
                ))}
              </div>
            </FormCard>

            <FormCard icon={<Tag className="h-4 w-4 text-indigo-700" />} title="Barcode Management">
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <Field label="Barcode Number">
                  <Input value={form.barcode} onChange={(e) => update("barcode", e.target.value)}
                    className="h-12 font-mono" placeholder="Scan or generate barcode" />
                </Field>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={generateBarcode} className="h-12">
                    <ScanBarcode className="mr-2 h-4 w-4" /> Generate
                  </Button>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                {form.barcode ? (
                  <div className="space-y-3">
                    <div className="mx-auto inline-flex items-end gap-[2px] rounded-md bg-white p-4 shadow-sm">
                      {form.barcode.split("").map((ch, i) => (
                        <div key={i} className="bg-slate-900"
                          style={{ width: (Number(ch) % 3) + 2 + "px", height: "60px" }} />
                      ))}
                    </div>
                    <p className="font-mono text-sm text-slate-600">{form.barcode}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No barcode generated yet</p>
                )}
                {form.barcode && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="outline"><Eye className="mr-1.5 h-3.5 w-3.5" /> Preview</Button>
                    <Button size="sm" variant="outline"><Printer className="mr-1.5 h-3.5 w-3.5" /> Print</Button>
                    <Button size="sm" variant="outline"><Download className="mr-1.5 h-3.5 w-3.5" /> Download</Button>
                  </div>
                )}
              </div>
            </FormCard>

            {isEdit && (
              <FormCard icon={<Clock className="h-4 w-4 text-indigo-700" />} title="Audit Information">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Created By", "Admin User"],
                    ["Created Date", new Date().toLocaleDateString()],
                    ["Updated By", "Admin User"],
                    ["Updated Date", new Date().toLocaleDateString()],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs uppercase tracking-wider text-slate-500">{k}</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{v}</p>
                    </div>
                  ))}
                </div>
              </FormCard>
            )}
          </div>

          {/* Right: Pricing Summary */}
          <div className="space-y-6 lg:col-span-1">
            <Card className="sticky top-4 overflow-hidden rounded-2xl border-slate-200 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
              <CardHeader className="border-b border-slate-100 bg-gradient-to-br from-indigo-600 to-indigo-800 py-4 text-white">
                <CardTitle className="text-sm font-semibold uppercase tracking-wider">Pricing Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <SummaryRow label="Purchase Price / Piece" value={`৳${calc.costPiece.toFixed(2)}`} />
                <SummaryRow label="Sale Price / Piece" value={`৳${calc.salePiece.toFixed(2)}`} />
                <Separator />
                <SummaryRow label="Profit / Piece"
                  value={`৳${calc.profitPiece.toFixed(2)}`}
                  valueClass={calc.profitPiece >= 0 ? "text-emerald-600" : "text-red-600"} />
                <SummaryRow label="Margin"
                  value={`${calc.margin.toFixed(2)}%`}
                  valueClass={calc.margin >= 0 ? "text-emerald-600" : "text-red-600"}
                  large />
                <div className={cn(
                  "rounded-lg p-3 text-xs",
                  calc.profitPiece >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                )}>
                  {calc.profitPiece >= 0
                    ? "Pricing looks healthy."
                    : "Sale price is below cost. Review pricing."}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700">Quick Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-slate-600">
                <p>• Use Tab to move between fields quickly.</p>
                <p>• Generic & Company support search. Type to filter.</p>
                <p>• Prices auto-calculate per piece as you type.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      )}

      {/* Sticky Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur sm:px-6 lg:left-64">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {dirty ? <span className="text-amber-600">● Unsaved changes</span> : "All changes saved"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to="/products">Cancel</Link></Button>
            <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>Save Draft</Button>
            <Button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="bg-indigo-700 text-white hover:bg-indigo-800"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEdit ? "Update Product" : "Create Product"}
            </Button>
          </div>
        </div>
      </div>

      <CompanyQuickCreateDialog
        open={companyDialogOpen}
        onOpenChange={setCompanyDialogOpen}
        tenantId={tenantId}
        onCreated={async (name) => {
          setCompanyReload((n) => n + 1);
          update("company", name);
        }}
      />
      <GenericQuickCreateDialog
        open={genericDialogOpen}
        onOpenChange={setGenericDialogOpen}
        tenantId={tenantId}
        onCreated={async (name) => {
          setGenericReload((n) => n + 1);
          update("generic", name);
        }}
      />
    </AppShell>
  );
}

function FormCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
      <CardHeader className="border-b border-slate-100 py-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}

function Field({ label, required, error, hint, className, children }: {
  label: string; required?: boolean; error?: string; hint?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function SearchableSelect({ value, onChange, options, placeholder, error, onAddNew, loading }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string; error?: boolean; onAddNew?: () => void; loading?: boolean;
}) {
  const merged = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="flex gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn("h-12 flex-1", error && "border-red-500")}>
          <SelectValue placeholder={loading ? "Loading…" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {merged.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">No options. Click + to add.</div>
          ) : merged.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={onAddNew} title="Add new">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SummaryRow({ label, value, valueClass, large }: {
  label: string; value: string; valueClass?: string; large?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
      <span className={cn("font-bold tabular-nums", large ? "text-2xl" : "text-base", valueClass ?? "text-slate-900")}>
        {value}
      </span>
    </div>
  );
}

function CompanyQuickCreateDialog({ open, onOpenChange, tenantId, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; onCreated: (name: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const upsertFn = useServerFn(upsertProductCompany);
  const [form, setForm] = useState({ name: "", code: "", country: "", address: "", phone: "", email: "", status: "active" as "active" | "inactive" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ name: "", code: "", country: "", address: "", phone: "", email: "", status: "active" }); }, [open]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(t("toast.companyNameRequired")); return; }
    if (!tenantId) { toast.error(t("toast.tenantNotSelected")); return; }
    setSaving(true);
    try {
      await upsertFn({ data: { tenantId, branchId: null, name: form.name.trim(), code: form.code || null, country: form.country || null, address: form.address || null, phone: form.phone || null, email: form.email || null, status: form.status } });
      toast.success(t("toast.companyCreated"));
      await onCreated(form.name.trim());
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create company");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("dialog.addCompany")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label className="text-xs">Company Name *</Label>
            <Input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Square Pharmaceuticals" />
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Company Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          <div className="sm:col-span-2 space-y-1.5"><Label className="text-xs">Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-700 text-white hover:bg-indigo-800">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenericQuickCreateDialog({ open, onOpenChange, tenantId, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; onCreated: (name: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const upsertFn = useServerFn(upsertProductGeneric);
  const [form, setForm] = useState({ generic_name: "", description: "", status: "active" as "active" | "inactive" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ generic_name: "", description: "", status: "active" }); }, [open]);

  const handleSave = async () => {
    if (!form.generic_name.trim()) { toast.error(t("toast.genericNameRequired")); return; }
    if (!tenantId) { toast.error(t("toast.tenantNotSelected")); return; }
    setSaving(true);
    try {
      await upsertFn({ data: { tenantId, branchId: null, generic_name: form.generic_name.trim(), description: form.description || null, status: form.status } });
      toast.success(t("toast.genericCreated"));
      await onCreated(form.generic_name.trim());
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create generic");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("dialog.addGeneric")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Generic Name *</Label>
            <Input autoFocus value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} placeholder="e.g. Paracetamol" />
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-indigo-700 text-white hover:bg-indigo-800">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
