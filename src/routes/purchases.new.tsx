import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Plus, Trash2, Save, Search, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { buildProductDisplayName } from "@/lib/product-display";
import {
  getAvailableUnits,
  getUnitMultiplier,
  resolvePackConfig,
  unitLabelBn,
  type MedicineUnitMode,
} from "@/lib/medicine-units";
import { createPurchaseOrder, receivePurchaseOrder, updatePOStatus } from "@/lib/api/procurement.functions";
import { recordSupplierPayment } from "@/lib/api/supplier-ledger.functions";
import { getActiveBusinessRules } from "@/lib/api/business-rules.functions";
import { cacheSuppliers, listCachedSuppliers, searchCachedProducts } from "@/lib/offline/db";
import { queuePurchase } from "@/lib/offline/queue";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";

export const Route = createFileRoute("/purchases/new")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "New Purchase — SohojPharma" }] }),
  component: NewPurchasePage,
});

type SearchRow = {
  id: string; name: string; sku: string | null; barcode: string | null;
  purchase_price: number | string; retail_price: number | string;
  qty_on_hand: number | string | null;
  strength: string | null; medicine_type: string | null; volume: string | null; pack_size: number | null;
};

type PickedProduct = {
  id: string; name: string; displayName: string;
  sku: string; barcode: string; lastPurchasePrice: number; lastRetailPrice: number; stock: number;
  hasStrip: boolean; pcsPerStrip: number; pcsPerBox: number;
};

type Line = {
  uid: string;
  product: PickedProduct;
  batch_no: string;
  expiry_date: string;
  purchase_price: number;
  sale_price: number;
  qty: number;
  bonus: number;
  discount: number;
  vat: number;
  unitMode: MedicineUnitMode;
  hasStrip: boolean;
  pcsPerStrip: number;
  pcsPerBox: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => `৳ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
const lineMult = (l: Line) => getUnitMultiplier(l.unitMode, l.pcsPerStrip, l.pcsPerBox);
const lineTotal = (l: Line) =>
  Math.max(0, l.qty * lineMult(l) * l.purchase_price - l.discount + l.vat);

function NewPurchasePage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createPO = useServerFn(createPurchaseOrder);
  const receivePO = useServerFn(receivePurchaseOrder);
  const updateStatus = useServerFn(updatePOStatus);
  const payPO = useServerFn(recordSupplierPayment);
  const rulesFn = useServerFn(getActiveBusinessRules);
  const { data: rules } = useQuery({
    queryKey: ["business-rules", tenantId],
    enabled: !!tenantId,
    queryFn: () => rulesFn({ data: { tenant_id: tenantId } }),
  });
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);

  const [supplierId, setSupplierId] = useState<string>("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await listCachedSuppliers(tenantId);
      }
      try {
        const { data, error } = await supabase
          .from("suppliers")
          .select("id,name,phone,due_balance")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        const rows = data ?? [];
        void cacheSuppliers(
          tenantId,
          rows.map((s) => ({ id: s.id, name: s.name, phone: s.phone ?? null, due_balance: Number(s.due_balance ?? 0) })),
        ).catch(() => {});
        return rows;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await listCachedSuppliers(tenantId);
        }
        throw err;
      }
    },
  });
  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;

  // Supplier last purchase date
  const { data: lastPurchase } = useQuery({
    queryKey: ["supplier-last-po", supplierId],
    enabled: !!supplierId,
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select("order_date,received_at")
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // KPIs
  const { data: kpis } = useQuery({
    queryKey: ["purchase-kpis", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [day, month, due, pendGRN, pendApp] = await Promise.all([
        supabase.from("purchase_orders").select("total").eq("tenant_id", tenantId).gte("created_at", dayStart),
        supabase.from("purchase_orders").select("total").eq("tenant_id", tenantId).gte("created_at", monthStart),
        supabase.from("suppliers").select("due_balance").eq("tenant_id", tenantId).eq("is_active", true),
        supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["approved", "partially_received"]),
        supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["draft", "sent"]),
      ]);
      const sum = (rows: Array<{ total?: number | string | null }> | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.total ?? 0), 0);
      const sumDue = (rows: Array<{ due_balance?: number | string | null }> | null) =>
        (rows ?? []).reduce((s, r) => s + Number(r.due_balance ?? 0), 0);
      return {
        today: sum(day.data),
        month: sum(month.data),
        due: sumDue(due.data),
        pendingGRN: pendGRN.count ?? 0,
        pendingApproval: pendApp.count ?? 0,
      };
    },
  });

  // Product search
  const { data: results = [], isFetching: searching } = useQuery({
    queryKey: ["purchase-product-search", tenantId, debounced],
    enabled: !!tenantId && debounced.length >= 1,
    queryFn: async () => {
      const offlineSearch = async (): Promise<PickedProduct[]> => {
        const cached = await searchCachedProducts(tenantId, debounced, 20);
        return cached.map<PickedProduct>((c) => ({
          id: c.id,
          name: c.name,
          displayName: c.displayName || c.name,
          sku: c.sku ?? "",
          barcode: c.barcode ?? "",
          lastPurchasePrice: c.cost,
          lastRetailPrice: c.price,
          stock: c.stock,
          hasStrip: c.hasStrip,
          pcsPerStrip: c.pcsPerStrip,
          pcsPerBox: c.pcsPerBox,
        }));
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await offlineSearch();
      }
      try {
        const { data, error } = await supabase.rpc("search_products" as never, {
          _tenant_id: tenantId, _query: debounced, _branch_id: null, _limit: 20,
        } as never);
        if (error) throw error;
        const list = (data ?? []) as SearchRow[];
        const ids = list.map((p) => p.id);
        const packMap = new Map<string, { pack_size: number | null; qty_per_box: number | null }>();
        if (ids.length > 0) {
          const { data: packRows } = await supabase
            .from("products")
            .select("id, pack_size, qty_per_box")
            .in("id", ids);
          for (const pr of (packRows ?? []) as any[]) {
            packMap.set(pr.id, { pack_size: pr.pack_size, qty_per_box: pr.qty_per_box });
          }
        }
        return list.map<PickedProduct>((p) => {
          const pk = packMap.get(p.id);
          const cfg = resolvePackConfig({
            medicine_type: p.medicine_type,
            name: p.name,
            pack_size: pk?.pack_size ?? p.pack_size,
            qty_per_box: pk?.qty_per_box,
          });
          return {
            id: p.id, name: p.name,
            displayName: buildProductDisplayName(p),
            sku: p.sku ?? "", barcode: p.barcode ?? "",
            lastPurchasePrice: Number(p.purchase_price ?? 0),
            lastRetailPrice: Number(p.retail_price ?? 0),
            stock: Number(p.qty_on_hand ?? 0),
            hasStrip: cfg.hasStrip,
            pcsPerStrip: cfg.pcsPerStrip,
            pcsPerBox: cfg.pcsPerBox,
          };
        });
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await offlineSearch();
        }
        throw err;
      }
    },
  });

  useEffect(() => { setHighlight(0); }, [debounced]);

  function addProduct(p: PickedProduct) {
    setLines((prev) => [...prev, {
      uid: `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      product: p,
      batch_no: "",
      expiry_date: "",
      purchase_price: p.lastPurchasePrice,
      sale_price: p.lastRetailPrice,
      qty: 1,
      bonus: 0,
      discount: 0,
      vat: 0,
      unitMode: "pc",
      hasStrip: p.hasStrip,
      pcsPerStrip: p.pcsPerStrip,
      pcsPerBox: p.pcsPerBox,
    }]);
    setQuery("");
    searchRef.current?.focus();
  }

  // Barcode: when query exactly matches a barcode, auto-add (dedupe to avoid double-add on refetch)
  const lastBarcodeAddedRef = useRef<string>("");
  useEffect(() => {
    if (!debounced) { lastBarcodeAddedRef.current = ""; return; }
    const exact = results.find((r) => r.barcode && r.barcode.toLowerCase() === debounced.toLowerCase());
    if (exact && debounced.length >= 6 && lastBarcodeAddedRef.current !== debounced.toLowerCase()) {
      lastBarcodeAddedRef.current = debounced.toLowerCase();
      addProduct(exact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, debounced]);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); addProduct(results[highlight]); }
  }

  const update = (uid: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => l.uid === uid ? { ...l, ...patch } : l));
  const remove = (uid: string) => setLines((ls) => ls.filter((l) => l.uid !== uid));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.purchase_price, 0);
  const discountTotal = lines.reduce((s, l) => s + l.discount, 0);
  const vatTotal = lines.reduce((s, l) => s + l.vat, 0);
  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const due = Math.max(0, grandTotal - paid);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!supplierId) errs.push("Select a supplier");
    if (!lines.length) errs.push("Add at least one product");
    const seen = new Set<string>();
    const t = today();
    lines.forEach((l, i) => {
      const key = `${l.product.id}|${l.batch_no.trim().toLowerCase()}`;
      if (l.batch_no && seen.has(key)) errs.push(`Row ${i + 1}: duplicate product + batch`);
      seen.add(key);
      if (!l.batch_no.trim()) errs.push(`Row ${i + 1}: batch number required`);
      if (!l.expiry_date) errs.push(`Row ${i + 1}: expiry date required`);
      else if (l.expiry_date <= t) errs.push(`Row ${i + 1}: expiry must be in the future`);
      if (l.qty <= 0) errs.push(`Row ${i + 1}: quantity must be > 0`);
      if (l.bonus < 0) errs.push(`Row ${i + 1}: bonus cannot be negative`);
      if (l.purchase_price <= 0) errs.push(`Row ${i + 1}: purchase price must be > 0`);
      if (l.sale_price < l.purchase_price) errs.push(`Row ${i + 1}: sale price must be ≥ purchase price`);
      if (l.discount < 0 || l.vat < 0) errs.push(`Row ${i + 1}: discount/VAT cannot be negative`);
    });
    return errs;
  }, [supplierId, lines]);

  async function handleSave() {
    if (errors.length || !tenantId) {
      toast.error(errors[0] ?? "Cannot save");
      return;
    }
    const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
    if (!isOffline && !branchId) {
      toast.error("Please select a branch first. প্রথমে একটি শাখা নির্বাচন করুন।");
      return;
    }
    setSaving(true);
    const saveOfflinePurchase = async () => {
      await queuePurchase({
        tenant_id: tenantId,
        branch_id: branchId ?? null,
        supplier_id: supplierId,
        supplier_name: selectedSupplier?.name ?? null,
        invoice_no: invoiceNo || undefined,
        due_date: dueDate || undefined,
        subtotal,
        discount: discountTotal,
        vat: vatTotal,
        total: grandTotal,
        paid,
        due,
        payment_method: "cash",
        notes: notes || undefined,
        items: lines.map((l) => {
          const mult = lineMult(l);
          return {
            product_id: l.product.id,
            name: l.product.displayName || l.product.name,
            batch_no: l.batch_no.trim(),
            expiry_date: l.expiry_date,
            qty: l.qty * mult,
            bonus_qty: l.bonus * mult,
            unit_cost: l.purchase_price,
            sale_price: l.sale_price,
            discount: l.discount,
            vat: l.vat,
            line_total: lineTotal(l),
            pcs_per_strip: l.pcsPerStrip,
            pcs_per_box: l.pcsPerBox,
          };
        }),
      });
      toast.success("অফলাইনে ক্রয় সেভ হয়েছে! অনলাইনে এলে অটো সিঙ্ক হবে।");
      navigate({ to: "/purchases" });
    };

    try {
      if (isOffline) {
        await saveOfflinePurchase();
        return;
      }
      const { id: poId } = await createPO({
        data: {
          tenantId,
          branch_id: branchId!,
          supplier_id: supplierId,
          expected_delivery_date: dueDate || undefined,
          notes: [invoiceNo ? `Invoice: ${invoiceNo}` : "", notes].filter(Boolean).join(" — ") || undefined,
          items: lines.map((l) => {
            const mult = lineMult(l);
            const totalPcs = (l.qty + l.bonus) * mult;
            return {
              product_id: l.product.id,
              qty_ordered: totalPcs,
              unit_cost: l.purchase_price,
              discount: l.discount + l.bonus * mult * l.purchase_price,
              vat: l.vat,
              notes: l.bonus > 0 ? `Bonus: ${l.bonus * mult} pcs` : undefined,
            };
          }),
        },
      });

      // Auto-approve + receive (PO approval workflow will be added later)
      await updateStatus({ data: { id: poId, branch_id: branchId!, action: "approve" } });


      // Fetch newly created PO items to map item_id → line
      const { data: items, error: itErr } = await supabase
        .from("purchase_order_items")
        .select("id,product_id")
        .eq("purchase_order_id", poId);
      if (itErr) throw new Error(itErr.message);

      const used = new Set<string>();
      const recvLines = lines.map((l) => {
        const match = (items ?? []).find((it) => it.product_id === l.product.id && !used.has(it.id));
        if (!match) throw new Error(`Could not link product ${l.product.name}`);
        used.add(match.id);
        const mult = lineMult(l);
        return {
          item_id: match.id,
          qty: (l.qty + l.bonus) * mult,
          batch_no: l.batch_no.trim(),
          expiry_date: l.expiry_date,
        };
      });

      await receivePO({ data: { id: poId, branch_id: branchId!, lines: recvLines } });

      if (paid > 0) {
        await payPO({
          data: {
            tenantId, branch_id: branchId!, supplierId, amount: paid, method: "cash",
            reference: invoiceNo || undefined,
            notes: `Payment on PO ${poId}`,
          },
        });
      }

      toast.success("Purchase saved — stock & ledger updated");
      navigate({ to: "/procurement/$id", params: { id: poId } });
    } catch (err) {
      if (isOfflineNetworkError(err)) {
        await saveOfflinePurchase();
        return;
      }
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell variant="store" title="New purchase">
      <PageHeader
        title="New purchase"
        description="Record new inventory stock and update supplier ledgers."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/purchases"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
            </Button>
            <Button onClick={handleSave} disabled={saving || !branchId || !!errors.length}>
              <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save & receive"}
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        {[
          { label: "Today's purchase", value: fmt(kpis?.today ?? 0), tone: "" },
          { label: "This month", value: fmt(kpis?.month ?? 0), tone: "" },
          { label: "Supplier due", value: fmt(kpis?.due ?? 0), tone: "text-destructive" },
          { label: "Pending GRN", value: String(kpis?.pendingGRN ?? 0), tone: "text-amber-600" },
          { label: "Pending PO approval", value: String(kpis?.pendingApproval ?? 0), tone: "text-blue-600" },
        ].map((k) => (
          <Card key={k.label} className="shadow-card">
            <CardContent className="p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k.label}</div>
              <div className={`mt-1 text-xl font-bold ${k.tone}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-9">

          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Supplier & invoice</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3">
              <div className="space-y-1.5 md:col-span-2">
                <Label>Supplier *</Label>
                <div className="flex gap-2">
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="h-11 flex-1">
                      <SelectValue placeholder={suppliers.length ? "Select supplier" : "No suppliers yet — add one"} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className="h-11" onClick={() => setSupplierDialogOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add supplier
                  </Button>
                </div>
                {selectedSupplier && (
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">Due: {fmt(Number(selectedSupplier.due_balance ?? 0))}</Badge>
                    {selectedSupplier.phone && <Badge variant="outline">📞 {selectedSupplier.phone}</Badge>}
                    {lastPurchase?.order_date && <Badge variant="outline">Last: {lastPurchase.order_date}</Badge>}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Supplier invoice no.</Label>
                <Input className="h-11" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="e.g. INV-78421" />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase date</Label>
                <Input className="h-11" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input className="h-11" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="shadow-card lg:sticky lg:top-6">

          <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span><span>− {fmt(discountTotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT</span><span>+ {fmt(vatTotal)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Grand total</span><span className="text-primary">{fmt(grandTotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Paid now</span>
              <Input type="number" min="0" step="0.01" className="h-8 w-28 text-right" value={paid}
                onChange={(e) => setPaid(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="flex justify-between font-semibold">
              <span>Due</span><span className={due > 0 ? "text-destructive" : ""}>{fmt(due)}</span>
            </div>

            {errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive space-y-1">
                <div className="flex items-center gap-1 font-medium"><AlertCircle className="h-3.5 w-3.5" /> Fix before saving</div>
                <ul className="list-disc pl-4">
                  {errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
                  {errors.length > 5 && <li>+ {errors.length - 5} more…</li>}
                </ul>
              </div>
            )}

            <Button className="w-full" onClick={handleSave} disabled={saving || !!errors.length}>
              <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save & receive"}
            </Button>
          </CardContent>
        </Card>
        </div>
      </div>

      <Card className="shadow-card mt-6">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Products</CardTitle>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search name, SKU, barcode… (scan or type)"
              className="pl-9 h-10"
            />
            {debounced && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-80 overflow-auto">
                {searching && <div className="p-3 text-sm text-muted-foreground">Searching…</div>}
                {!searching && !results.length && <div className="p-3 text-sm text-muted-foreground">No products found</div>}
                {results.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => addProduct(r)}
                    onMouseEnter={() => setHighlight(i)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent ${i === highlight ? "bg-accent" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.displayName}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.sku || "—"} · {r.barcode || "no barcode"} · Stock {r.stock}
                      </div>
                    </div>
                    <div className="text-xs text-right shrink-0">
                      <div>Buy {fmt(r.lastPurchasePrice)}</div>
                      <div className="text-muted-foreground">Sell {fmt(r.lastRetailPrice)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">Product</TableHead>
                  <TableHead>Batch *</TableHead>
                  <TableHead>Expiry *</TableHead>
                  <TableHead className="w-28 text-right">Buy</TableHead>
                  <TableHead className="w-28 text-right">Sell</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-24 text-right">Bonus</TableHead>
                  <TableHead className="w-28 text-right">Disc</TableHead>
                  <TableHead className="w-24 text-right">VAT</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!lines.length && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-6">
                      Search above to add products.
                    </TableCell>
                  </TableRow>
                )}
                {lines.map((l) => {
                  const units = getAvailableUnits(l.hasStrip, l.pcsPerBox);
                  const mult = lineMult(l);
                  return (
                  <TableRow key={l.uid}>
                    <TableCell>
                      <div className="font-medium text-sm">{l.product.displayName}</div>
                      <div className="text-xs text-muted-foreground">{l.product.sku || "—"} · Stock {l.product.stock} pcs</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <div className="inline-flex rounded-md bg-muted p-0.5 border border-border">
                          {units.map((u) => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => update(l.uid, { unitMode: u })}
                              className={`rounded px-2 py-0.5 text-[10px] font-bold transition ${
                                l.unitMode === u ? "bg-emerald-700 text-white" : "text-muted-foreground"
                              }`}
                            >
                              {unitLabelBn(u)}
                            </button>
                          ))}
                        </div>
                        {l.hasStrip && (
                          <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            পাতায়:
                            <input
                              type="number"
                              min={1}
                              value={l.pcsPerStrip}
                              onChange={(e) => update(l.uid, { pcsPerStrip: Math.max(1, Number(e.target.value) || 1) })}
                              className="w-10 rounded border bg-background px-1 py-0.5 text-center text-[11px] font-semibold text-foreground"
                            />
                          </label>
                        )}
                        <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          বক্সে:
                          <input
                            type="number"
                            min={1}
                            value={l.pcsPerBox}
                            onChange={(e) => update(l.uid, { pcsPerBox: Math.max(1, Number(e.target.value) || 1) })}
                            className="w-12 rounded border bg-background px-1 py-0.5 text-center text-[11px] font-semibold text-foreground"
                          />
                        </label>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input value={l.batch_no} onChange={(e) => update(l.uid, { batch_no: e.target.value })} placeholder="Batch" className="h-10 text-sm" />
                    </TableCell>
                    <TableCell>
                      <Input type="date" value={l.expiry_date} min={today()} onChange={(e) => update(l.uid, { expiry_date: e.target.value })} className="h-10 text-sm" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" min="0" className="h-10 text-right text-sm" value={l.purchase_price}
                        onChange={(e) => update(l.uid, { purchase_price: Number(e.target.value) || 0 })} />
                      {l.hasStrip && (
                        <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                          পাতা: ৳{(l.purchase_price * l.pcsPerStrip).toFixed(2)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" min="0" className="h-10 text-right text-sm" value={l.sale_price}
                        onChange={(e) => update(l.uid, { sale_price: Number(e.target.value) || 0 })} />
                      {l.hasStrip && (
                        <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                          পাতা: ৳{(l.sale_price * l.pcsPerStrip).toFixed(2)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input type="number" min="1" className="h-10 text-right text-sm" value={l.qty}
                        onChange={(e) => update(l.uid, { qty: Math.max(0, Number(e.target.value) || 0) })} />
                      {mult > 1 && (
                        <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                          = {l.qty * mult} pcs
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input type="number" min="0" className="h-10 text-right text-sm" value={l.bonus}
                        onChange={(e) => update(l.uid, { bonus: Math.max(0, Number(e.target.value) || 0) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" min="0" className="h-10 text-right text-sm" value={l.discount}
                        onChange={(e) => update(l.uid, { discount: Math.max(0, Number(e.target.value) || 0) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" min="0" className="h-10 text-right text-sm" value={l.vat}
                        onChange={(e) => update(l.uid, { vat: Math.max(0, Number(e.target.value) || 0) })} />
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(lineTotal(l))}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(l.uid)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional purchase note" />
          </div>
        </CardContent>
      </Card>




      <CreateSupplierDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        tenantId={tenantId}
        onCreated={(id) => {
          setSupplierId(id);
          qc.invalidateQueries({ queryKey: ["suppliers-active", tenantId] });
        }}
      />
    </AppShell>
  );
}

function CreateSupplierDialog({
  open, onOpenChange, tenantId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "" });
  const mut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const { data, error } = await supabase.from("suppliers").insert({
        tenant_id: tenantId,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        email: form.email.trim() || null,
        is_active: true,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Supplier added");
      onCreated(id);
      setForm({ name: "", phone: "", address: "", email: "" });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Save supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
