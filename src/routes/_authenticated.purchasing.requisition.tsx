import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { RouteErrorPanel } from "@/components/route-error";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Minus, Plus, Printer, Save, Search, Trash2, X, ScanBarcode, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveWarehouse } from "@/hooks/use-active-warehouse";
import { WarehouseSelect } from "@/components/pos/warehouse-select";
import { PosSearchDropdown, type PosSearchResult } from "@/components/pos/pos-search-dropdown";
import { buildProductDisplayName } from "@/lib/product-display";
import {
  resolveDefaultSupplier, savePurchaseRequisition, getPurchaseRequisition,
} from "@/lib/api/purchase-requisitions.functions";
import { printRequisition } from "@/components/purchase-requisition/requisition-print";
import { getInvoiceSettings } from "@/lib/api/invoices.functions";
import { getPrinterSettings, listPrinters } from "@/lib/api/printer-settings.functions";

export const Route = createFileRoute("/_authenticated/purchasing/requisition")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  validateSearch: z.object({
    edit: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Purchase Requisition — SohojPharma" },
      { name: "description", content: "Create a purchase requisition with fast POS-style product search." },
    ],
  }),
  component: RequisitionPage,
});

type Line = {
  product_id: string | null;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  generic_name: string | null;
  unit: string | null;
  current_stock: number;
  reorder_level: number;
  requested_qty: number;
  last_purchase_price: number;
  remarks: string;
  strength: string | null;
  volume: string | null;
};

type Supplier = { id: string; name: string; is_active: boolean };

function todayISO() { return new Date().toISOString().slice(0, 10); }

function RequisitionPage() {
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const { currentTenantId, user } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const { warehouses, warehouseId, setWarehouseId } = useActiveWarehouse();

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [reqDate, setReqDate] = useState<string>(todayISO());
  const [expDate, setExpDate] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState<"draft" | "pending">("pending");
  const [prNumber, setPrNumber] = useState<string>("");

  // Search
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownScrollRef = useRef<HTMLDivElement>(null);

  const [savedDialog, setSavedDialog] = useState<null | { id: string; pr_number: string }>(null);

  // debounce query
  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 150); return () => clearTimeout(t); }, [query]);

  // Suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from("suppliers")
        .select("id,name,is_active")
        .eq("tenant_id", tenantId).eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  // Default supplier resolver
  const resolveDefaultFn = useServerFn(resolveDefaultSupplier);
  const { data: defaultSupplier } = useQuery({
    queryKey: ["default-supplier", tenantId],
    enabled: !!tenantId,
    queryFn: () => resolveDefaultFn({ data: { tenantId } }),
  });
  const effectiveSupplierId = supplierId ?? defaultSupplier?.id ?? null;
  const effectiveSupplier = suppliers.find((s) => s.id === effectiveSupplierId) ?? defaultSupplier ?? null;
  const supplierIsDefault = !supplierId && !!defaultSupplier;

  // ── Edit load ──
  const getFn = useServerFn(getPurchaseRequisition);
  useEffect(() => {
    if (!editId || !tenantId) return;
    (async () => {
      try {
        const res = await getFn({ data: { tenantId, id: editId } });
        const h = res.header as Record<string, unknown> & {
          pr_number: string; supplier_id: string | null; warehouse_id: string | null;
          requisition_date: string; expected_date: string | null; remarks: string | null;
          status: "draft" | "pending" | "approved" | "rejected" | "completed" | "cancelled";
        };
        setPrNumber(h.pr_number);
        setSupplierId(h.supplier_id);
        if (h.warehouse_id) setWarehouseId(h.warehouse_id);
        setReqDate(h.requisition_date);
        setExpDate(h.expected_date ?? "");
        setRemarks(h.remarks ?? "");
        setStatus(h.status === "draft" ? "draft" : "pending");
        setLines((res.items as Array<Record<string, unknown>>).map((it) => ({
          product_id: (it.product_id as string) ?? null,
          product_name: String(it.product_name ?? ""),
          sku: (it.sku as string) ?? null,
          barcode: (it.barcode as string) ?? null,
          generic_name: (it.generic_name as string) ?? null,
          unit: (it.unit as string) ?? null,
          current_stock: Number(it.current_stock ?? 0),
          reorder_level: Number(it.reorder_level ?? 0),
          requested_qty: Number(it.requested_qty ?? 1),
          last_purchase_price: Number(it.last_purchase_price ?? 0),
          remarks: String(it.remarks ?? ""),
          strength: (it.strength as string) ?? null,
          volume: (it.volume as string) ?? null,
        })));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load requisition");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, tenantId]);

  // ── Product search (same RPC as POS) ──
  const PAGE = 50;
  const searchQ = useInfiniteQuery({
    queryKey: ["pr-search", tenantId, warehouseId, debounced],
    enabled: !!tenantId && debounced.length >= 1,
    initialPageParam: 0,
    getNextPageParam: (last: PosSearchResult[], all) => last.length < PAGE ? undefined : all.length * PAGE,
    queryFn: async ({ pageParam }): Promise<PosSearchResult[]> => {
      const { data, error } = await supabase.rpc("search_products" as never, {
        _tenant_id: tenantId, _query: debounced, _branch_id: null,
        _limit: PAGE, _warehouse_id: warehouseId, _offset: pageParam as number,
      } as never);
      if (error) throw error;
      type Row = {
        id: string; name: string; sku: string | null; barcode: string | null;
        retail_price: number | string; purchase_price: number | string;
        qty_on_hand: number | string | null; strength: string | null;
        medicine_type: string | null; volume: string | null; pack_size: number | null;
        generic_name: string | null; manufacturer_name: string | null;
        effective_price: number | string | null; nearest_expiry: string | null;
      };
      return ((data ?? []) as Row[]).map((p) => ({
        id: p.id, name: p.name,
        displayName: buildProductDisplayName(p),
        sku: p.sku ?? "", barcode: p.barcode,
        retail_price: Number(p.effective_price ?? p.retail_price ?? 0),
        stock: Number(p.qty_on_hand ?? 0),
        generic_name: p.generic_name,
        manufacturer_name: p.manufacturer_name,
        strength: p.strength,
        dosage_form: p.medicine_type,
        nearest_expiry: p.nearest_expiry,
      }));
    },
  });
  const results = useMemo<PosSearchResult[]>(
    () => (searchQ.data?.pages ?? []).flat(), [searchQ.data]);
  const loadMore = useCallback(() => {
    if (searchQ.hasNextPage && !searchQ.isFetchingNextPage) void searchQ.fetchNextPage();
  }, [searchQ]);
  useEffect(() => { setActiveIndex(0); }, [results]);
  useEffect(() => { if (debounced) setDropdownOpen(true); }, [debounced]);

  // Fetch last purchase price for a product
  async function fetchLastPurchasePrice(productId: string): Promise<number> {
    if (!tenantId) return 0;
    const { data } = await supabase.from("batches")
      .select("purchase_price,created_at")
      .eq("tenant_id", tenantId).eq("product_id", productId)
      .not("purchase_price", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return Number(data?.purchase_price ?? 0);
  }

  // Fetch reorder_level, unit and volume from products
  async function fetchProductMeta(productId: string): Promise<{ reorder_level: number; unit: string | null; volume: string | null }> {
    if (!tenantId) return { reorder_level: 0, unit: null, volume: null };
    const { data } = await supabase.from("products")
      .select("reorder_level, volume, units(name)")
      .eq("id", productId).eq("tenant_id", tenantId).maybeSingle();
    const rl = Number((data as { reorder_level?: number } | null)?.reorder_level ?? 0);
    const u = (data as { units?: { name: string } | null } | null)?.units?.name ?? null;
    const v = (data as { volume?: string | null } | null)?.volume ?? null;
    return { reorder_level: rl, unit: u, volume: v };
  }

  async function addProduct(p: PosSearchResult) {
    setLines((ls) => {
      const idx = ls.findIndex((l) => l.product_id === p.id);
      if (idx >= 0) {
        const nl = [...ls];
        nl[idx] = { ...nl[idx], requested_qty: nl[idx].requested_qty + 1 };
        return nl;
      }
      return ls;
    });
    if (!lines.some((l) => l.product_id === p.id)) {
      // Enrich async
      const [price, meta] = await Promise.all([
        fetchLastPurchasePrice(p.id),
        fetchProductMeta(p.id),
      ]);
      setLines((ls) => {
        if (ls.some((l) => l.product_id === p.id)) return ls;
        return [...ls, {
          product_id: p.id,
          product_name: p.displayName || p.name,
          sku: p.sku || null,
          barcode: p.barcode ?? null,
          generic_name: p.generic_name,
          unit: meta.unit,
          current_stock: p.stock,
          reorder_level: meta.reorder_level,
          requested_qty: 1,
          last_purchase_price: price || Number(p.retail_price ?? 0),
          remarks: "",
          strength: p.strength ?? null,
          volume: meta.volume ?? null,
        }];
      });
    }
    setQuery("");
    searchRef.current?.focus();
  }

  async function handleBarcode(code: string) {
    const c = code.trim();
    if (!c || !tenantId) return;
    const { data: pb } = await supabase.from("product_barcodes")
      .select("product_id").eq("tenant_id", tenantId).eq("barcode", c)
      .is("deleted_at", null).maybeSingle();
    let pid = pb?.product_id as string | undefined;
    if (!pid) {
      const { data: pr } = await supabase.from("products")
        .select("id").eq("tenant_id", tenantId).eq("barcode", c)
        .is("deleted_at", null).maybeSingle();
      pid = pr?.id;
    }
    if (!pid) { toast.error(`Barcode not found: ${c}`); return; }
    const { data: p } = await supabase.from("products")
      .select("id,name,sku,barcode,retail_price,strength,medicine_type,volume,pack_size,reorder_level,generics(name),units(name)")
      .eq("id", pid).maybeSingle();
    if (!p) { toast.error("Product not found"); return; }
    const pg = (p as unknown as { generics?: { name: string } | null }).generics;
    const un = (p as unknown as { units?: { name: string } | null }).units;
    await addProduct({
      id: p.id, name: p.name, displayName: buildProductDisplayName(p),
      sku: p.sku ?? "", barcode: p.barcode ?? null,
      retail_price: Number(p.retail_price ?? 0), stock: 0,
      generic_name: pg?.name ?? null, manufacturer_name: null,
      strength: (p as unknown as { strength?: string | null }).strength ?? null,
      dosage_form: (p as unknown as { medicine_type?: string | null }).medicine_type ?? null,
      nearest_expiry: null,
    });
    // patch unit + reorder from the direct product record
    const rl = Number((p as unknown as { reorder_level?: number }).reorder_level ?? 0);
    setLines((ls) => ls.map((l) => l.product_id === p.id
      ? { ...l, reorder_level: rl, unit: un?.name ?? l.unit } : l));
    setScanInput("");
    scanRef.current?.focus();
  }

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }
  function removeLine(idx: number) { setLines((ls) => ls.filter((_, i) => i !== idx)); }

  const totalItems = lines.length;
  const totalQty = lines.reduce((s, l) => s + Number(l.requested_qty || 0), 0);
  const estimatedAmount = lines.reduce((s, l) => s + Number(l.requested_qty || 0) * Number(l.last_purchase_price || 0), 0);

  // ── Save ──
  const saveFn = useServerFn(savePurchaseRequisition);
  const saveMut = useMutation({
    mutationFn: async (asStatus: "draft" | "pending") => {
      if (lines.length === 0) throw new Error("Add at least one item");
      const res = await saveFn({
        data: {
          id: editId ?? null,
          tenantId,
          warehouse_id: warehouseId ?? null,
          supplier_id: supplierId ?? null,
          requisition_date: reqDate || null,
          expected_date: expDate || null,
          remarks: remarks || null,
          status: asStatus,
          items: lines.map((l) => ({
            product_id: l.product_id,
            product_name: l.product_name,
            sku: l.sku,
            barcode: l.barcode,
            generic_name: l.generic_name,
            unit: l.unit,
            current_stock: Number(l.current_stock) || 0,
            reorder_level: Number(l.reorder_level) || 0,
            requested_qty: Number(l.requested_qty) || 0,
            last_purchase_price: Number(l.last_purchase_price) || 0,
            remarks: l.remarks || null,
          })),
        },
      });
      return res;
    },
    onSuccess: (row, asStatus) => {
      qc.invalidateQueries({ queryKey: ["pr-list"] });
      toast.success(asStatus === "draft" ? "Draft saved" : "Requisition saved");
      setPrNumber(row.pr_number);
      setStatus(asStatus);
      setSavedDialog({ id: row.id, pr_number: row.pr_number });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const invSettingsFn = useServerFn(getInvoiceSettings);
  const { data: invSettings } = useQuery({
    queryKey: ["pr-invoice-settings", tenantId],
    enabled: !!tenantId,
    queryFn: () => invSettingsFn({ data: { tenantId } }).catch(() => null),
  });

  const printerSettingsFn = useServerFn(getPrinterSettings);
  const { data: printerSettings } = useQuery({
    queryKey: ["pr-printer-settings", tenantId],
    enabled: !!tenantId,
    queryFn: () => printerSettingsFn({ data: { tenant_id: tenantId } }).catch(() => null),
  });
  const printerProfilesFn = useServerFn(listPrinters);
  const { data: printerProfiles } = useQuery({
    queryKey: ["pr-printer-profiles", tenantId],
    enabled: !!tenantId,
    queryFn: () => printerProfilesFn({ data: { tenant_id: tenantId } }).catch(() => []),
  });

  const doPrint = useCallback((paper: "A4" | "58mm" | "auto" = "auto") => {
    const s = (invSettings ?? {}) as Record<string, unknown>;
    const defaultReceiptPrinter = printerProfiles?.find((p) => p.id === printerSettings?.default_receipt_printer);
    const resolvedPaper = paper === "auto" && (printerSettings?.receipt_format === "58mm" || defaultReceiptPrinter?.printer_type === "thermal") ? "58mm" : paper;
    void printRequisition({
      companyName: String(s.company_name ?? "Company"),
      companyAddress: (s.address as string) ?? null,
      companyPhone: (s.phone as string) ?? null,
      companyEmail: (s.email as string) ?? null,
      companyLogoUrl: (s.logo_url as string) ?? null,
      prNumber: prNumber || "DRAFT",
      requisitionDate: reqDate,
      expectedDate: expDate || null,
      supplierName: effectiveSupplier?.name ?? null,
      supplierIsDefault,
      warehouseName: warehouses.find((w) => w.id === warehouseId)?.name ?? null,
      requestedByName: user?.email ?? null,
      remarks: remarks || null,
      paper: resolvedPaper,
      tenantId,
      items: lines.map((l) => ({
        product_name: l.product_name, sku: l.sku, unit: l.unit,
        requested_qty: l.requested_qty, remarks: l.remarks,
        strength: l.strength, volume: l.volume,
      })),
    });
  }, [invSettings, printerSettings?.default_receipt_printer, printerSettings?.receipt_format, printerProfiles, prNumber, reqDate, expDate, effectiveSupplier, supplierIsDefault, warehouses, warehouseId, user, remarks, tenantId, lines]);

  function onSaveAndPrint() {
    saveMut.mutate("pending", {
      onSuccess: () => { setTimeout(() => doPrint("auto"), 200); },
    });
  }

  function resetForm() {
    setSupplierId(null); setReqDate(todayISO()); setExpDate(""); setRemarks("");
    setLines([]); setStatus("pending"); setPrNumber("");
    navigate({ to: "/purchasing/requisition", search: {} });
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "F4") { e.preventDefault(); saveMut.mutate("draft"); return; }
      if (e.key === "F5") { e.preventDefault(); saveMut.mutate("pending"); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") { e.preventDefault(); doPrint(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveMut.mutate("pending"); return; }
      if (e.key === "Escape" && !inField) { e.preventDefault(); resetForm(); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveMut, doPrint]);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || results.length === 0) {
      if (e.key === "Escape") { setQuery(""); setDropdownOpen(false); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const p = results[activeIndex] ?? results[0]; if (p) void addProduct(p); }
    else if (e.key === "Escape") { setDropdownOpen(false); }
  }

  return (
    <AppShell variant="store">
      <PageHeader
        title="Purchase Requisition"
        description="Fast POS-style requisition entry. Save as draft, submit for approval, or convert to a Purchase Order later."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/purchasing/requisition-list"><List className="mr-1 h-4 w-4" /> List</Link>
            </Button>
          </div>
        }
      />

      {/* Top: supplier / warehouse / dates */}
      <Card className="mb-3">
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label className="text-xs">Supplier {supplierIsDefault && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Default Supplier</span>}</Label>
            <Select value={supplierId ?? "__default__"} onValueChange={(v) => setSupplierId(v === "__default__" ? null : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Use Default Supplier{defaultSupplier ? ` — ${defaultSupplier.name}` : ""}</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Warehouse</Label>
            <WarehouseSelect warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} className="h-9 w-full" />
          </div>
          <div>
            <Label className="text-xs">Reference No</Label>
            <Input value={prNumber || "Auto"} readOnly className="h-9 bg-muted/50" />
          </div>
          <div>
            <Label className="text-xs">Requisition Date</Label>
            <Input type="date" value={reqDate} onChange={(e) => setReqDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Expected Date</Label>
            <Input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className="h-9" />
          </div>
          <div className="md:col-span-5">
            <Label className="text-xs">Remarks</Label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Notes for supplier / approver..." />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <div className="h-9 flex items-center">
              <Badge variant={status === "draft" ? "outline" : "default"}>{status.toUpperCase()}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search bar */}
      <Card className="mb-3">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                autoFocus
                placeholder="Search product by Name, Generic, SKU, Barcode…  (F2)"
                className="h-11 rounded-lg pl-10 text-base"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => { if (results.length > 0) setDropdownOpen(true); }}
                onKeyDown={onSearchKey}
              />
              {searchQ.isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              {dropdownOpen && debounced && (
                <PosSearchDropdown
                  ref={dropdownRef}
                  scrollRef={dropdownScrollRef}
                  results={results}
                  activeIndex={activeIndex}
                  setActiveIndex={setActiveIndex}
                  query={debounced}
                  isFetching={searchQ.isFetching}
                  isLoadingInitial={searchQ.isLoading}
                  hasMore={!!searchQ.hasNextPage}
                  onLoadMore={loadMore}
                  onSelect={(p) => { void addProduct(p); setDropdownOpen(false); }}
                />
              )}
            </div>
            <div className="relative w-64">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={scanRef}
                placeholder="Scan barcode"
                className="h-11 pl-9"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleBarcode(scanInput); } }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Generic</TableHead>
                <TableHead className="w-28">SKU</TableHead>
                <TableHead className="w-32">Barcode</TableHead>
                <TableHead className="w-24 text-right">Stock</TableHead>
                <TableHead className="w-24 text-right">Reorder</TableHead>
                <TableHead className="w-40 text-center">Requested Qty</TableHead>
                <TableHead className="w-20">Unit</TableHead>
                <TableHead className="w-28 text-right">Last Price</TableHead>
                <TableHead className="w-28 text-right">Est. Cost</TableHead>
                <TableHead className="w-40">Remarks</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 && (
                <TableRow><TableCell colSpan={13} className="py-10 text-center text-sm text-muted-foreground">
                  Search or scan to add products. Press <kbd className="rounded bg-muted px-1">F2</kbd> to focus search.
                </TableCell></TableRow>
              )}
              {lines.map((l, i) => (
                <TableRow key={`${l.product_id}-${i}`}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{l.product_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{l.generic_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{l.sku ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{l.barcode ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.current_stock}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.reorder_level}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button type="button" size="icon" variant="outline" className="h-7 w-7"
                        onClick={() => updateLine(i, { requested_qty: Math.max(0, l.requested_qty - 1) })}><Minus className="h-3 w-3" /></Button>
                      <Input type="number" min={0} step={1} value={l.requested_qty}
                        onChange={(e) => updateLine(i, { requested_qty: Number(e.target.value) || 0 })}
                        className="h-7 w-16 text-center" />
                      <Button type="button" size="icon" variant="outline" className="h-7 w-7"
                        onClick={() => updateLine(i, { requested_qty: l.requested_qty + 1 })}><Plus className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{l.unit ?? "—"}</TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" value={l.last_purchase_price}
                      onChange={(e) => updateLine(i, { last_purchase_price: Number(e.target.value) || 0 })}
                      className="h-7 w-24 text-right" />
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    ৳{(l.requested_qty * l.last_purchase_price).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Input value={l.remarks} onChange={(e) => updateLine(i, { remarks: e.target.value })}
                      placeholder="—" className="h-7" />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600"
                      onClick={() => removeLine(i)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary + actions */}
      <div className="sticky bottom-0 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-md">
        <div className="flex flex-wrap gap-6 text-sm">
          <div><span className="text-muted-foreground">Total Items:</span> <span className="font-bold">{totalItems}</span></div>
          <div><span className="text-muted-foreground">Total Qty:</span> <span className="font-bold">{totalQty.toLocaleString(undefined,{maximumFractionDigits:3})}</span></div>
          <div><span className="text-muted-foreground">Estimated:</span> <span className="font-bold text-primary">৳{estimatedAmount.toFixed(2)}</span></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={resetForm}><X className="mr-1 h-4 w-4" /> Cancel <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">Esc</kbd></Button>
          <Button variant="outline" disabled={saveMut.isPending || lines.length === 0}
            onClick={() => saveMut.mutate("draft")}>
            <Save className="mr-1 h-4 w-4" /> Save Draft <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">F4</kbd>
          </Button>
          <Button disabled={saveMut.isPending || lines.length === 0}
            onClick={() => saveMut.mutate("pending")}>
            {saveMut.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            Save Requisition <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">F5</kbd>
          </Button>
          <Button variant="secondary" disabled={saveMut.isPending || lines.length === 0} onClick={onSaveAndPrint}>
            <Printer className="mr-1 h-4 w-4" /> Save & Print <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">Ctrl+P</kbd>
          </Button>
          <Button variant="outline" disabled={lines.length === 0} onClick={() => doPrint("58mm")}>
            <Printer className="mr-1 h-4 w-4" /> 58mm Thermal
          </Button>
        </div>
      </div>

      {/* Success dialog */}
      <Dialog open={!!savedDialog} onOpenChange={(o) => !o && setSavedDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>✅ Purchase Requisition Saved Successfully</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            PR Number: <span className="font-mono font-bold">{savedDialog?.pr_number}</span>
          </div>
          <DialogFooter className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => { setSavedDialog(null); doPrint(); }}>
              <Printer className="mr-1 h-4 w-4" /> Print
            </Button>
            <Button variant="outline" onClick={() => doPrint("58mm")}><Printer className="mr-1 h-4 w-4" /> 58mm Thermal</Button>
            <Button variant="outline" onClick={() => doPrint("A4")}><Printer className="mr-1 h-4 w-4" /> Preview</Button>
            <Button variant="outline" onClick={() => { setSavedDialog(null); resetForm(); }}>Create New</Button>
            <Button onClick={() => { setSavedDialog(null); navigate({ to: "/purchasing/requisition-list" }); }}>Go To List</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
