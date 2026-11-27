import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { RouteErrorPanel } from "@/components/route-error";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ScanBarcode, Search, Trash2, Plus, Minus, Printer, X,
  AlertTriangle, PackageX, CheckCircle2, Loader2, Pause, RotateCcw,
  ArrowDownToLine, ArrowUpFromLine, Receipt, Lock, MessageCircle, ShoppingCart, CreditCard,
  Camera, Volume2
} from "lucide-react";
import { BlisterScannerDialog } from "@/components/pos/blister-scanner-dialog";
import { ChangeCalculatorCard } from "@/components/pos/change-calculator-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buildProductDisplayName } from "@/lib/product-display";
import { resolvePackConfig, supportsStripUnit } from "@/lib/medicine-units";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { POSCustomerSelect, type CustomerRow } from "@/components/pos/pos-customer-select";
import { HoldSaleDialog, RecallSaleDialog, type HeldRow } from "@/components/pos/hold-recall-dialogs";
import { useActiveRegister } from "@/hooks/use-active-register";
import { useActiveWarehouse } from "@/hooks/use-active-warehouse";
import { WarehouseSelect } from "@/components/pos/warehouse-select";
import {
  OpenRegisterDialog, CloseRegisterDialog, CashTxnDialog, ActiveRegisterChip,
} from "@/components/pos/cash-register-dialogs";
import { InvoicePrintDialog } from "@/components/invoice/invoice-print-dialog";
import { InvoiceShareDialog } from "@/components/invoice/invoice-share-dialog";
import { POSErrorBoundary } from "@/components/pos/pos-error-boundary";
import { PosSearchDropdown } from "@/components/pos/pos-search-dropdown";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useTranslation } from "react-i18next";
import { usePosSettings } from "@/hooks/use-pos-settings";
import { useServerFn } from "@tanstack/react-start";
import { checkCustomerCredit } from "@/lib/api/customer-analytics.functions";
import { autoEarnLoyalty } from "@/lib/api/customer-settings.functions";
import { cacheProducts, findCachedProductByBarcode, searchCachedProducts } from "@/lib/offline/db";
import { queueSale } from "@/lib/offline/queue";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";

const QuickAddProductDialog = lazy(() => import("@/components/pos/quick-add-product-dialog").then(m => ({ default: m.QuickAddProductDialog })));
type QuickAddResult = import("@/components/pos/quick-add-product-dialog").QuickAddResult;

export const Route = createFileRoute("/sales/pos")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  validateSearch: z.object({
    edit: z.string().optional(),
    recall: z.string().optional(),
    ref: z.string().optional(),
  }),
  head: () => ({
    meta: [
      { title: "POS — SohojPharma" },
      { name: "description", content: "Pharmacy POS with barcode scan, live search, and real-time billing." },
    ],
  }),
  component: () => (
    <POSErrorBoundary area="POS">
      <POSPage />
    </POSErrorBoundary>
  ),
});

type PayMethod = "cash" | "bkash" | "nagad" | "rocket" | "bank" | "card" | "other" | "due";
const PAY_LABEL: Record<PayMethod, string> = {
  cash: "Cash", card: "Card", bkash: "bKash", nagad: "Nagad",
  rocket: "Rocket", bank: "Bank", other: "Other", due: "Due",
};

type SearchProduct = {
  id: string;
  name: string;
  displayName: string;
  sku: string;
  barcode: string | null;
  retail_price: number;
  purchase_price: number;
  vat_rate: number;
  stock: number;
  generic_name: string | null;
  category_name: string | null;
  manufacturer_name: string | null;
  strength: string | null;
  dosage_form: string | null;
  nearest_expiry: string | null;
};

type UnitType = "box" | "pata" | "piece";

type CartLine = {
  product_id: string;
  name: string;
  sku: string;
  unit_price: number;
  base_price?: number;
  cost: number;
  qty: number;
  discount: number;   // per-line absolute
  vat_rate: number;   // %
  stock: number;
  generic_name?: string | null;
  category_name?: string | null;
  manufacturer_name?: string | null;
  unit_type?: UnitType;
  hasStrip?: boolean;
  pcsPerStrip?: number;
  pcsPerBox?: number;
  batch_no?: string | null;
  expiry_date?: string | null;
};

type PayLine = { method: PayMethod; amount: number };

// Short success beep used on barcode auto-add. Best-effort — silently no-op if audio blocked.
function playBeep() {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 1180;
    g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
    o.onended = () => ctx.close();
  } catch { /* ignore */ }
}
type POSDraft = {
  version: 1;
  cart: CartLine[];
  customer: CustomerRow | null;
  invoiceDiscount: number;
  invoiceDiscountType: "amount" | "percent";
  invoiceTax: number;
  invoiceTaxType: "amount" | "percent";
  overrideStock: boolean;
  notes: string;
  payments: PayLine[];
  updatedAt: string;
};

type CheckoutSale = {
  id: string;
  invoice_no: string;
  total: number;
  paid: number;
  due: number;
  status: string;
};

const POS_DRAFT_PREFIX = "sohojpharma:pos:draft";
const defaultPayments = (): PayLine[] => [{ method: "cash", amount: 0 }];
const isAmountType = (value: unknown): value is "amount" | "percent" => value === "amount" || value === "percent";
const validPayments = (value: unknown): PayLine[] => {
  if (!Array.isArray(value)) return defaultPayments();
  const rows = value
    .filter((p) => p && typeof p === "object" && "method" in p && String((p as PayLine).method) in PAY_LABEL)
    .map((p) => ({ method: (p as PayLine).method, amount: Math.max(0, Number((p as PayLine).amount) || 0) }));
  return rows.length ? rows : defaultPayments();
};

function safeUUID(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // RFC4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function POSPage() {

  const { t } = useTranslation();
  const { currentTenantId, user, isAppAdmin, impersonating } = useAuth();
  const tenantId = currentTenantId ?? "";
  const isOnline = useOnlineStatus();
  const { edit: editInvoiceId } = Route.useSearch();
  const navigate = useNavigate();
  const [editingInvoiceNo, setEditingInvoiceNo] = useState<string | null>(null);
  const [originalSale, setOriginalSale] = useState<null | {
    invoice_no: string;
    total: number;
    paid: number;
    due: number;
    status: string;
    created_at: string;
    payments: { method: PayMethod; amount: number; reference?: string | null }[];
  }>(null);


  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownScrollRef = useRef<HTMLDivElement>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"amount" | "percent">("amount");
  const [invoiceTax, setInvoiceTax] = useState(0);
  const [invoiceTaxType, setInvoiceTaxType] = useState<"amount" | "percent">("percent");
  const [overrideStock, setOverrideStock] = useState(true);
  const [notes, setNotes] = useState("");
  const [payments, setPayments] = useState<PayLine[]>(defaultPayments);
  const [confirm, setConfirm] = useState<null | {
    id: string; invoice_no: string; total: number; paid: number; due: number; status: string;
    mode: "create" | "edit"; customer_name?: string | null;
  }>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [paymentsTouched, setPaymentsTouched] = useState(false);
  const customerSectionRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const [blisterScanOpen, setBlisterScanOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState<number>(0);

  const speakMedicine = (name: string, price: number) => {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const text = `${name}, দাম ${price} টাকা`;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "bn-BD";
        window.speechSynthesis.speak(u);
      }
    } catch {}
  };

  const updateLineUnit = (productId: string, unit: UnitType) => {
    setCart((lines) =>
      lines.map((l) => {
        if (l.product_id !== productId) return l;
        const basePc = l.base_price ?? l.unit_price;
        const pcsPerStrip = l.pcsPerStrip ?? 10;
        const pcsPerBox = l.pcsPerBox ?? 100;
        const mult = unit === "box" ? pcsPerBox : unit === "pata" ? pcsPerStrip : 1;
        const newPrice = Math.round(basePc * mult * 100) / 100;
        return {
          ...l,
          unit_type: unit,
          base_price: basePc,
          unit_price: newPrice,
        };
      }),
    );
  };

  const handleQuickPillClick = (name: string, price: number) => {
    const inCart = cart.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
    if (inCart) {
      updateLine(inCart.product_id, { qty: inCart.qty + 1 });
      playBeep();
      return;
    }
    const inResults = results.find((r) => r.name.toLowerCase().includes(name.toLowerCase()));
    if (inResults) {
      addProductToCart(inResults);
      playBeep();
      return;
    }
    setCart((c) => [
      ...c,
      {
        product_id: "quick-" + name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        name: name,
        sku: "QUICK-" + name.toUpperCase().slice(0, 4),
        unit_price: price,
        base_price: price,
        cost: Math.round(price * 0.85 * 100) / 100,
        qty: 1,
        discount: 0,
        vat_rate: 0,
        stock: 999,
        unit_type: "pata" as UnitType,
      },
    ]);
    playBeep();
  };
  const { data: register, isFetched: registerFetched, refetch: refetchRegister } = useActiveRegister();
  const { warehouses, warehouseId, setWarehouseId, selected: selectedWarehouse, isFetched: warehousesFetched } = useActiveWarehouse();
  const { settings: posSettings } = usePosSettings(tenantId || undefined);
  const [openRegOpen, setOpenRegOpen] = useState(false);
  const [closeRegOpen, setCloseRegOpen] = useState(false);
  const [cashTxn, setCashTxn] = useState<null | "cash_in" | "cash_out" | "expense">(null);
  const autoPromptedRef = useRef(false);
  const [mobileView, setMobileView] = useState<"cart" | "checkout">("cart");
  const draftKey = tenantId ? `${POS_DRAFT_PREFIX}:${tenantId}:${user?.id ?? "guest"}` : "";
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);

  // Auto-prompt to open register ONCE per session if none is active.
  // Wait until the query has resolved, and don't re-prompt after the user dismisses it.
  useEffect(() => {
    if (!registerFetched || !tenantId) return;
    if (register) { autoPromptedRef.current = true; return; }
    if (autoPromptedRef.current) return;
    autoPromptedRef.current = true;
    setOpenRegOpen(true);
  }, [registerFetched, register, tenantId]);

  // Apply POS Settings defaults: warehouse + customer (only when nothing chosen yet).
  const defaultWarehouseAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultWarehouseAppliedRef.current) return;
    if (!posSettings.default_warehouse_id) return;
    if (warehouseId) { defaultWarehouseAppliedRef.current = true; return; }
    if (!warehouses.some(w => w.id === posSettings.default_warehouse_id)) return;
    setWarehouseId(posSettings.default_warehouse_id);
    defaultWarehouseAppliedRef.current = true;
  }, [posSettings.default_warehouse_id, warehouseId, warehouses, setWarehouseId]);

  const defaultCustomerAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultCustomerAppliedRef.current) return;
    if (!posSettings.default_customer_id || customer || !tenantId) return;
    defaultCustomerAppliedRef.current = true;
    (async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, type, due_balance")
        .eq("tenant_id", tenantId)
        .eq("id", posSettings.default_customer_id!)
        .maybeSingle();
      if (data) setCustomer(data as unknown as CustomerRow);
    })();
  }, [posSettings.default_customer_id, customer, tenantId]);

  // Keep the active POS draft on this device so reloads don't wipe the cart.
  useEffect(() => {
    setLoadedDraftKey(null);
    if (!draftKey) return;
    if (editInvoiceId) { setLoadedDraftKey(draftKey); return; } // don't restore draft over an edited invoice

    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<POSDraft>;
        const restoredCart = Array.isArray(draft.cart) ? (draft.cart as CartLine[]) : [];
        setCart(restoredCart);
        setCustomer((draft.customer ?? null) as CustomerRow | null);
        setInvoiceDiscount(Math.max(0, Number(draft.invoiceDiscount) || 0));
        setInvoiceDiscountType(isAmountType(draft.invoiceDiscountType) ? draft.invoiceDiscountType : "amount");
        setInvoiceTax(Math.max(0, Number(draft.invoiceTax) || 0));
        setInvoiceTaxType(isAmountType(draft.invoiceTaxType) ? draft.invoiceTaxType : "percent");
        setOverrideStock(Boolean(draft.overrideStock));
        setNotes(String(draft.notes ?? ""));
        setPayments(validPayments(draft.payments));
        if (restoredCart.length) toast.success(t("toast.cartRestored"));
      }
    } catch {
      window.localStorage.removeItem(draftKey);
    } finally {
      window.setTimeout(() => setLoadedDraftKey(draftKey), 0);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || loadedDraftKey !== draftKey) return;
    const t = window.setTimeout(() => {
      if (!cart.length) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      const draft: POSDraft = {
        version: 1,
        cart,
        customer,
        invoiceDiscount,
        invoiceDiscountType,
        invoiceTax,
        invoiceTaxType,
        overrideStock,
        notes,
        payments,
        updatedAt: new Date().toISOString(),
      };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 150);
    return () => window.clearTimeout(t);
  }, [cart, customer, draftKey, invoiceDiscount, invoiceDiscountType, invoiceTax, invoiceTaxType, loadedDraftKey, notes, overrideStock, payments]);

  // Hydrate cart from an existing invoice when editing.
  useEffect(() => {
    if (!editInvoiceId || !tenantId) return;
    let cancelled = false;
    (async () => {
      const { data: sale, error } = await supabase
        .from("sales")
        .select("id,invoice_no,discount,notes,status,is_return,customer_id,total,paid,due,created_at, items:sale_items(product_id,qty,unit_price,discount,vat), customer:customers(id,name,phone,email,credit_limit,due_balance,type), payments:sale_payments(method,amount,reference)")
        .eq("id", editInvoiceId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error || !sale || cancelled) { if (error) toast.error(t("ipos.couldNotLoad", { msg: error.message })); return; }
      if (sale.is_return || ["void","cancelled","refunded"].includes(String(sale.status).toLowerCase())) {
        toast.error(t("ipos.cantEditStatus", { status: sale.status }));
        return;
      }
      const productIds = (sale.items ?? []).map((i: { product_id: string }) => i.product_id);
      const [{ data: products }, { data: batches }] = await Promise.all([
        supabase.from("products").select("id,name,sku,vat_rate,purchase_price").in("id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]),
        supabase.from("batches").select("product_id,qty_on_hand").eq("tenant_id", tenantId).in("product_id", productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]).gt("qty_on_hand", 0),
      ]);
      if (cancelled) return;
      const pmap = new Map((products ?? []).map((p) => [p.id, p]));
      const smap: Record<string, number> = {};
      (batches ?? []).forEach((b) => { smap[b.product_id] = (smap[b.product_id] ?? 0) + Number(b.qty_on_hand); });
      const newCart: CartLine[] = (sale.items ?? []).map((it: { product_id: string; qty: number; unit_price: number; discount: number; vat: number }) => {
        const p = pmap.get(it.product_id);
        const qty = Number(it.qty) || 0;
        const lineBase = Math.max(0, Number(it.unit_price) * qty - Number(it.discount));
        const vatRate = lineBase > 0 ? Math.round((Number(it.vat) / lineBase) * 10000) / 100 : Number(p?.vat_rate ?? 0);
        return {
          product_id: it.product_id,
          name: p?.name ?? "Unknown",
          sku: p?.sku ?? "",
          unit_price: Number(it.unit_price),
          cost: Number(p?.purchase_price ?? 0),
          qty,
          discount: Number(it.discount),
          vat_rate: vatRate,
          stock: (smap[it.product_id] ?? 0) + qty, // restore qty since old invoice will be cancelled with stock reversal
        };
      });
      setCart(newCart);
      setCustomer((sale.customer ?? null) as CustomerRow | null);
      setNotes(String(sale.notes ?? ""));
      setInvoiceDiscount(Number(sale.discount) || 0);
      setInvoiceDiscountType("amount");
      setEditingInvoiceNo(sale.invoice_no);

      // Carry forward payment history (excludes 'due' rows — those are recomputed)
      const carried: PayLine[] = ((sale.payments ?? []) as Array<{ method: string; amount: number; reference?: string | null }>)
        .filter((p) => p.method !== "due")
        .map((p) => ({ method: p.method as PayMethod, amount: Number(p.amount) || 0 }));
      // If sale.paid > 0 but no non-due payment rows exist (legacy data), synthesize a cash carry-forward.
      const originalPaidNum = Number(sale.paid) || 0;
      const carriedSum = carried.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (carriedSum < originalPaidNum - 0.01) {
        carried.push({ method: "cash", amount: Math.round((originalPaidNum - carriedSum) * 100) / 100 });
      }
      // In edit mode, ALWAYS disable auto-fill so adding/removing items never overwrites carried paid amount.
      setPayments(carried.length ? carried : [{ method: "cash", amount: 0 }]);
      setPaymentsTouched(true);

      setOriginalSale({
        invoice_no: sale.invoice_no,
        total: Number(sale.total) || 0,
        paid: Number(sale.paid) || 0,
        due: Number(sale.due) || 0,
        status: String(sale.status ?? ""),
        created_at: String(sale.created_at ?? ""),
        payments: carried,
      });

      toast.info(`Editing ${sale.invoice_no} — original paid ৳${Number(sale.paid).toFixed(2)} will carry forward to the replacement invoice.`);
    })();
    return () => { cancelled = true; };
  }, [editInvoiceId, tenantId]);


  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Live product search (paged / infinite)
  const PAGE_SIZE = 50;
  const searchInfinite = useInfiniteQuery({
    queryKey: ["pos-search", tenantId, warehouseId, debounced],
    enabled: !!tenantId && debounced.length >= 1,
    initialPageParam: 0,
    getNextPageParam: (lastPage: SearchProduct[], allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length * PAGE_SIZE,
    queryFn: async ({ pageParam }): Promise<SearchProduct[]> => {
      const searchOffline = async (): Promise<SearchProduct[]> => {
        if (Number(pageParam ?? 0) > 0) return [];
        const cached = await searchCachedProducts(tenantId, debounced, PAGE_SIZE);
        return cached.map<SearchProduct>((c) => ({
          id: c.id,
          name: c.name,
          displayName: c.displayName || c.name,
          sku: c.sku ?? "",
          barcode: c.barcode ?? "",
          retail_price: c.price,
          purchase_price: c.cost,
          vat_rate: c.vat_rate,
          stock: c.stock,
          generic_name: c.generic_name ?? null,
          category_name: null,
          manufacturer_name: c.company_name ?? null,
          strength: c.strength ?? null,
          dosage_form: c.form ?? null,
          nearest_expiry: null,
        }));
      };

      if (!isOnline || (typeof navigator !== "undefined" && !navigator.onLine)) {
        return await searchOffline();
      }

      try {
        const { data, error } = await supabase.rpc("search_products" as never, {
          _tenant_id: tenantId,
          _query: debounced,
          _branch_id: null,
          _limit: PAGE_SIZE,
          _warehouse_id: warehouseId,
          _offset: pageParam as number,
        } as never);
        if (error) throw error;
        type Row = {
          id: string; name: string; sku: string | null; barcode: string | null;
          retail_price: number | string; purchase_price: number | string;
          vat_rate: number | string | null; qty_on_hand: number | string | null;
          strength: string | null; medicine_type: string | null; volume: string | null; pack_size: number | null;
          generic_name: string | null; category_name: string | null; manufacturer_name: string | null;
          effective_price: number | string | null; nearest_expiry: string | null;
        };
        const mapped = ((data ?? []) as Row[]).map<SearchProduct>((p) => ({
          id: p.id, name: p.name,
          displayName: buildProductDisplayName(p),
          sku: p.sku ?? "", barcode: p.barcode ?? "",
          retail_price: Number(p.effective_price ?? p.retail_price ?? 0),
          purchase_price: Number(p.purchase_price),
          vat_rate: Number(p.vat_rate ?? 0),
          stock: Number(p.qty_on_hand ?? 0),
          generic_name: p.generic_name,
          category_name: p.category_name,
          manufacturer_name: p.manufacturer_name,
          strength: p.strength,
          dosage_form: p.medicine_type,
          nearest_expiry: p.nearest_expiry,
        }));
        void cacheProducts(
          tenantId,
          mapped.map((m) => {
            const cfg = resolvePackConfig({ medicine_type: m.dosage_form, name: m.name });
            return {
              id: m.id,
              name: m.name,
              displayName: m.displayName,
              form: m.dosage_form,
              strength: m.strength,
              generic_name: m.generic_name,
              company_name: m.manufacturer_name,
              sku: m.sku,
              barcode: m.barcode,
              cost: m.purchase_price,
              price: m.retail_price,
              vat_rate: m.vat_rate,
              stock: m.stock,
              hasStrip: cfg.hasStrip,
              pcsPerStrip: cfg.pcsPerStrip,
              pcsPerBox: cfg.pcsPerBox,
            };
          }),
        ).catch(() => {});
        return mapped;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await searchOffline();
        }
        throw err;
      }
    },
  });
  const results = useMemo<SearchProduct[]>(
    () => (searchInfinite.data?.pages ?? []).flat(),
    [searchInfinite.data],
  );
  const isFetching = searchInfinite.isFetching;
  const isLoadingInitial = searchInfinite.isLoading;
  const hasMore = !!searchInfinite.hasNextPage;
  const loadMoreResults = useCallback(() => {
    if (searchInfinite.hasNextPage && !searchInfinite.isFetchingNextPage) {
      void searchInfinite.fetchNextPage();
    }
  }, [searchInfinite]);

  const queryClient = useQueryClient();

  async function verifyProductExists(productId: string): Promise<boolean> {
    if (!tenantId) return false;
    if (!isOnline || (typeof navigator !== "undefined" && !navigator.onLine)) return true;
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id")
        .eq("id", productId)
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) return true; // fail-open on transient errors; aggregation will still guard
      return !!data;
    } catch {
      return true;
    }
  }

  async function addProductToCart(p: SearchProduct) {
    // Stale-search guard: confirm the product still exists before mutating the cart.
    const exists = await verifyProductExists(p.id);
    if (!exists) {
      // Drop the orphan from every cached search result so it can't be re-selected.
      queryClient.setQueriesData<SearchProduct[]>(
        { queryKey: ["pos-search"] },
        (rows) => (rows ?? []).filter((r) => r.id !== p.id),
      );
      queryClient.invalidateQueries({ queryKey: ["pos-search"] });
      toast.error(t("toast.productMissingRefresh", { defaultValue: "Product no longer exists. Please refresh search." }));
      return;
    }
    setCart((c) => {
      const existing = c.find((l) => l.product_id === p.id);
      if (existing) {
        return c.map((l) => l.product_id === p.id ? { ...l, qty: l.qty + 1 } : l);
      }
      const cfg = resolvePackConfig({
        medicine_type: p.dosage_form ?? (p as { medicine_type?: string | null }).medicine_type,
        name: p.name,
        pack_size: (p as { pack_size?: number | null }).pack_size,
        qty_per_box: (p as { qty_per_box?: number | null }).qty_per_box,
      });
      return [...c, {
        product_id: p.id, name: p.displayName ?? p.name, sku: p.sku,
        unit_price: p.retail_price, base_price: p.retail_price, cost: p.purchase_price,
        qty: 1, discount: 0, vat_rate: p.vat_rate, stock: p.stock,
        generic_name: p.generic_name ?? null,
        category_name: p.category_name ?? null,
        manufacturer_name: p.manufacturer_name ?? null,
        unit_type: "piece" as UnitType,
        hasStrip: cfg.hasStrip,
        pcsPerStrip: cfg.pcsPerStrip,
        pcsPerBox: cfg.pcsPerBox,
      }];
    });
    setQuery("");
    searchRef.current?.focus();
    window.setTimeout(() => void refetchCartStocks(), 0);
  }


  async function handleBarcode(code: string) {
    const c = code.trim();
    if (!c || !tenantId) return;
    if (!isOnline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      const cached = await findCachedProductByBarcode(tenantId, c);
      if (!cached) { toast.error(t("ipos.barcodeNotFound", { code: c })); return; }
      addProductToCart({
        id: cached.id,
        name: cached.name,
        displayName: cached.displayName || cached.name,
        sku: cached.sku ?? "",
        barcode: cached.barcode ?? "",
        retail_price: cached.price,
        purchase_price: cached.cost,
        vat_rate: cached.vat_rate,
        stock: cached.stock,
        generic_name: cached.generic_name ?? null,
        category_name: null,
        manufacturer_name: cached.company_name ?? null,
        strength: cached.strength ?? null,
        dosage_form: cached.form ?? null,
        nearest_expiry: null,
      });
      playBeep();
      setScanInput("");
      return;
    }
    // 1) product_barcodes lookup
    const { data: pb } = await supabase
      .from("product_barcodes")
      .select("product_id")
      .eq("tenant_id", tenantId)
      .eq("barcode", c)
      .is("deleted_at", null)
      .maybeSingle();
    let productId = pb?.product_id as string | undefined;
    // 2) fallback products.barcode
    if (!productId) {
      const { data: pr } = await supabase
        .from("products")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("barcode", c)
        .is("deleted_at", null)
        .maybeSingle();
      productId = pr?.id;
    }
    if (!productId) { toast.error(t("ipos.barcodeNotFound", { code: c })); return; }
    const { data: p } = await supabase
      .from("products")
      .select("id,name,sku,barcode,retail_price,purchase_price,vat_rate,strength,medicine_type,volume,pack_size,generics(name),categories(name)")
      .eq("id", productId).maybeSingle();
    if (!p) { toast.error(t("toast.productNotFound")); return; }
    let bq = supabase
      .from("batches").select("qty_on_hand,mrp,created_at")
      .eq("tenant_id", tenantId).eq("product_id", productId).gt("qty_on_hand", 0);
    if (warehouseId) bq = bq.eq("warehouse_id", warehouseId);
    const { data: bs } = await bq;
    const stock = (bs ?? []).reduce((s, b) => s + Number(b.qty_on_hand), 0);
    const latestMrp = (bs ?? [])
      .filter((b) => Number(b.mrp ?? 0) > 0)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]?.mrp;
    const effective = Number(latestMrp ?? p.retail_price ?? 0);
    const pg = (p as unknown as { generics?: { name: string } | null }).generics;
    const pc = (p as unknown as { categories?: { name: string } | null }).categories;
    addProductToCart({
      id: p.id, name: p.name,
      displayName: buildProductDisplayName(p),
      sku: p.sku, barcode: p.barcode,
      retail_price: effective, purchase_price: Number(p.purchase_price),
      vat_rate: Number(p.vat_rate), stock,
      generic_name: pg?.name ?? null,
      category_name: pc?.name ?? null,
      manufacturer_name: null,
      strength: (p as unknown as { strength?: string | null }).strength ?? null,
      dosage_form: (p as unknown as { medicine_type?: string | null }).medicine_type ?? null,
      nearest_expiry: null,
    });
    playBeep();
    setScanInput("");
    scanRef.current?.focus();
  }

  function updateLine(id: string, patch: Partial<CartLine>) {
    setCart((c) => c.map((l) => l.product_id === id ? { ...l, ...patch } : l));
  }
  function removeLine(id: string) {
    setCart((c) => c.filter((l) => l.product_id !== id));
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen || results.length === 0) {
      if (e.key === "Escape") { setQuery(""); setDropdownOpen(false); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = results[activeIndex] ?? results[0];
      if (p) addProductToCart(p);
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  }

  // Reset active + open dropdown when results change
  useEffect(() => { setActiveIndex(0); }, [results]);
  useEffect(() => { if (debounced) setDropdownOpen(true); }, [debounced]);

  // Barcode-exact auto-add: if search matches exactly one product's barcode, add directly.
  useEffect(() => {
    if (!debounced || results.length === 0) return;
    const q = debounced.trim();
    const exact = results.filter((r) => r.barcode && r.barcode === q);
    if (exact.length === 1 && /^\d{6,}$/.test(q)) {
      addProductToCart(exact[0]);
      setDropdownOpen(false);
      setQuery("");
      playBeep();
      searchRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, debounced]);

  // Outside click closes dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (dropdownRef.current?.contains(t)) return;
      if (searchRef.current?.contains(t)) return;
      setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  // Ctrl+L → focus product search box; F2 → open Quick Add Product (global POS shortcuts)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "F2") {
        e.preventDefault();
        setQuickAddOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  // Totals
  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unit_price * l.qty, 0), [cart]);
  const lineDiscTotal = useMemo(() => cart.reduce((s, l) => s + l.discount, 0), [cart]);
  const lineVatTotal = useMemo(() => cart.reduce(
    (s, l) => s + ((l.unit_price * l.qty - l.discount) * (l.vat_rate / 100)), 0,
  ), [cart]);
  const invoiceDiscountAmount = useMemo(() => {
    if (invoiceDiscountType === "percent") {
      const base = Math.max(0, subtotal - lineDiscTotal);
      return Math.round(base * (Math.max(0, Math.min(100, invoiceDiscount)) / 100) * 100) / 100;
    }
    return Math.max(0, invoiceDiscount);
  }, [invoiceDiscount, invoiceDiscountType, subtotal, lineDiscTotal]);
  const taxableBase = Math.max(0, subtotal - lineDiscTotal - invoiceDiscountAmount);
  const invoiceTaxAmount = useMemo(() => {
    if (invoiceTaxType === "percent") {
      return Math.round(taxableBase * (Math.max(0, invoiceTax) / 100) * 100) / 100;
    }
    return Math.max(0, invoiceTax);
  }, [invoiceTax, invoiceTaxType, taxableBase]);
  const total = Math.max(0, subtotal - lineDiscTotal - invoiceDiscountAmount + lineVatTotal + invoiceTaxAmount);
  const paid = payments.reduce((s, p) => p.method === "due" ? s : s + (Number(p.amount) || 0), 0);
  const due = Math.max(0, (Number(total) || 0) - (Number(paid) || 0));

  // Auto-fill first payment with full total — only when the user hasn't touched the amount AND we're not editing.
  useEffect(() => {
    if (editInvoiceId) return; // never auto-fill in edit mode — preserve carried payment
    if (paymentsTouched) return;
    setPayments((ps) => {
      if (ps.length === 1 && ps[0].method !== "due") {
        const next = Math.round(total * 100) / 100;
        if (ps[0].amount === next) return ps;
        return [{ method: ps[0].method, amount: next }];
      }
      return ps;
    });
  }, [total, paymentsTouched, editInvoiceId]);

  // Warnings
  const stockIssues = cart.filter((l) => l.stock < l.qty);

  // Live stock + earliest-expiry per product — refresh every 60s.
  const cartProductIds = useMemo(() => cart.map((l) => l.product_id), [cart]);
  const cartBatchesQueryKey = ["pos-cart-batches", tenantId, warehouseId, cartProductIds.join(",")];
  const { data: liveBatchInfo, refetch: refetchCartStocks } = useQuery({
    queryKey: cartBatchesQueryKey,
    enabled: !!tenantId && cartProductIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      let data: Array<{
        id: string;
        product_id: string;
        warehouse_id: string | null;
        branch_id: string | null;
        batch_no: string | null;
        qty_on_hand: number | string;
        expiry_date: string | null;
      }> | null = null;
      let error: any = null;
      const useAdminCartBatchesRpc = isAppAdmin && impersonating && !!warehouseId;
      console.info("[POS STOCK RUNTIME] cart batches query start", {
        isAppAdmin,
        impersonating,
        warehouseId,
        currentTenantId,
        tenantId,
        cartProductIds,
        useAdminCartBatchesRpc,
      });
      if (useAdminCartBatchesRpc) {
        const res = await supabase.rpc("admin_list_cart_batches", {
          _tenant_id: tenantId,
          _warehouse_id: warehouseId,
          _product_ids: cartProductIds,
        });
        data = (res.data as any) ?? null;
        error = res.error;
        console.info("[POS STOCK RUNTIME] admin_list_cart_batches response", {
          error,
          rowCount: data?.length ?? 0,
          rows: data,
        });
      } else {
        // Use SECURITY DEFINER RPC for all tenant members so branch-RLS never
        // hides legitimately accessible batches (cashier/store owner seeing
        // Stock 0 when stock actually exists in the selected warehouse).
        const res = await supabase.rpc("list_cart_batches" as never, {
          _tenant_id: tenantId,
          _warehouse_id: warehouseId ?? null,
          _product_ids: cartProductIds,
        } as never);
        data = (res.data as any) ?? null;
        error = res.error;
        console.info("[POS STOCK RUNTIME] list_cart_batches response", {
          error,
          rowCount: data?.length ?? 0,
          rows: data,
        });
      }
      if (error) throw error;
      const stocks: Record<string, number> = {};
      const earliest: Record<string, { batch_no: string; expiry_date: string; days: number } | null> = {};
      const today = new Date(); today.setHours(0, 0, 0, 0);
      (data ?? []).forEach((b) => {
        const previous = stocks[b.product_id] ?? 0;
        stocks[b.product_id] = (stocks[b.product_id] ?? 0) + Number(b.qty_on_hand);
        console.info("[POS STOCK RUNTIME] aggregate stock row", {
          product_id: b.product_id,
          previous,
          qty_on_hand: Number(b.qty_on_hand),
          next: stocks[b.product_id],
          warehouse_id: b.warehouse_id,
          branch_id: b.branch_id,
        });
        const exp = b.expiry_date ? new Date(b.expiry_date) : null;
        if (!exp) return;
        const days = Math.floor((exp.getTime() - today.getTime()) / 86400000);
        const cur = earliest[b.product_id];
        if (!cur || new Date(cur.expiry_date) > exp) {
          earliest[b.product_id] = { batch_no: b.batch_no ?? "", expiry_date: b.expiry_date ?? "", days };
        }
      });
      cartProductIds.forEach((id) => {
        if (!(id in stocks)) {
          console.info("[POS STOCK RUNTIME] default missing stock to zero", {
            product_id: id,
            previous: stocks[id],
            next: 0,
            rowProductIds: (data ?? []).map((b) => b.product_id),
          });
          stocks[id] = 0;
        }
        if (!(id in earliest)) earliest[id] = null;
      });
      console.info("[POS STOCK RUNTIME] final aggregation map", { stocks, earliest });
      // Identify orphan product_ids (rows that no longer exist in products) so the
      // reconciliation effect can drop them instead of holding them at stock=0.
      let existingIds: string[] = cartProductIds;
      if (cartProductIds.length) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .in("id", cartProductIds);
        existingIds = (existing ?? []).map((r) => r.id as string);
      }
      return { stocks, earliest, existingIds };
    },
  });
  const liveStocks = liveBatchInfo?.stocks;
  const expiryInfo = liveBatchInfo?.earliest ?? {};
  const liveExistingIds = liveBatchInfo?.existingIds;

  const expiryWarnings = useMemo(
    () => cart
      .map((l) => ({ line: l, info: expiryInfo[l.product_id] }))
      .filter((x) => x.info && x.info.days <= 90),
    [cart, expiryInfo],
  );

  useEffect(() => {
    if (!liveStocks) return;
    const existingSet = liveExistingIds ? new Set(liveExistingIds) : null;
    setCart((c) => {
      let changed = false;
      let dropped = false;
      let removedOrphan = false;
      const next: typeof c = [];
      for (const l of c) {
        // Orphan guard: product was deleted (e.g. tenant reset) — drop the line
        // instead of leaving it stuck at stock=0 with a non-existent product_id.
        if (existingSet && !existingSet.has(l.product_id)) {
          changed = true;
          removedOrphan = true;
          continue;
        }
        const fresh = liveStocks[l.product_id];
        if (fresh == null || fresh === l.stock) { next.push(l); continue; }
        changed = true;
        if (fresh < l.stock) dropped = true;
        next.push({ ...l, stock: fresh });
      }
      if (removedOrphan) toast.error(t("toast.productMissingRefresh", { defaultValue: "Product no longer exists. Please refresh search." }));
      else if (dropped) toast.warning(t("toast.stockChanged"));
      return changed ? next : c;
    });
  }, [liveStocks, liveExistingIds]);


  function resetCart() { setCart([]); }
  function resetPayments() { setPayments(defaultPayments()); setPaymentsTouched(false); }
  function resetCustomer() { setCustomer(null); }
  function resetDiscount() { setInvoiceDiscount(0); setInvoiceDiscountType("amount"); }
  function resetTax() { setInvoiceTax(0); setInvoiceTaxType("percent"); }
  function resetNotes() { setNotes(""); }
  function clearEditState() { setEditingInvoiceNo(null); setOriginalSale(null); }

  const checkCredit = useServerFn(checkCustomerCredit);
  const earnLoyalty = useServerFn(autoEarnLoyalty);

  const checkout = useMutation({
    mutationFn: async () => {
      if (editInvoiceId) console.log("EDIT MODE", editInvoiceId);
      if (!tenantId) throw new Error("No tenant selected");
      if (!user?.id) throw new Error("Not signed in");
      const currentlyOffline = !isOnline || (typeof navigator !== "undefined" && !navigator.onLine);
      if (editInvoiceId && currentlyOffline) {
        throw new Error("You are offline. Editing an existing invoice requires an internet connection.");
      }
      if (!currentlyOffline && !register) throw new Error("Open a register before completing sales");
      if (!currentlyOffline && !warehouseId) throw new Error("Select a warehouse before completing the sale");
      if (!cart.length) throw new Error("Cart is empty");
      if (editInvoiceId && !originalSale) throw new Error("Original invoice data is still loading. Wait a moment and try again.");
      if (!editInvoiceId && due > 0 && !customer) throw new Error("Due balance requires a customer — select a customer before completing the sale");

      // Payment validation
      const VALID_METHODS: PayMethod[] = ["cash", "card", "bkash", "nagad", "rocket", "bank", "other", "due"];
      let nonDueCount = 0;
      for (const p of payments) {
        if (!p.method || !VALID_METHODS.includes(p.method)) throw new Error("Choose a valid payment method for every split");
        const amt = Number(p.amount);
        if (Number.isNaN(amt) || amt < 0) throw new Error("Payment amount cannot be negative");
        if (p.method !== "due") nonDueCount += 1;
      }
      if (paid > total + 0.001) throw new Error(`Payments (৳${paid.toFixed(2)}) exceed total (৳${total.toFixed(2)})`);
      if (total > 0 && nonDueCount === 0 && due === 0) throw new Error("Enter at least one payment");

      // C3: Credit control — block / warn on customer credit limit before posting (online only).
      if (!currentlyOffline && !editInvoiceId && customer && due > 0) {
        const credit = await checkCredit({
          data: { tenantId, customerId: customer.id, newSaleDue: due },
        });
        if (credit.blocked) {
          throw new Error(
            `Sale blocked — ${customer.name}'s outstanding due (৳${credit.newDue.toFixed(2)}) exceeds credit limit (৳${credit.limit.toFixed(2)}).`,
          );
        }
        if (credit.warning) {
          const ok = window.confirm(
            `Warning: ${customer.name} would reach ${credit.pct.toFixed(0)}% of credit limit (৳${credit.newDue.toFixed(2)} / ৳${credit.limit.toFixed(2)}). Proceed with sale?`,
          );
          if (!ok) throw new Error("Sale cancelled by operator (credit warning).");
        }
      }

      // Refresh stock right before posting so concurrent sales don't slip through.
      // In edit mode the atomic replacement RPC reverses the original stock inside the same transaction before checkout.
      if (!editInvoiceId && !currentlyOffline) {
        try {
          const fresh = await refetchCartStocks();
          if (fresh.data) {
            const shortages = cart.filter((l) => (fresh.data!.stocks[l.product_id] ?? 0) < l.qty);
            if (shortages.length && !overrideStock) {
              throw new Error(`Stock changed — ${shortages[0].name} only has ${fresh.data!.stocks[shortages[0].product_id] ?? 0} left. Enable "Sell anyway" or reduce qty.`);
            }
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("Stock changed")) throw e;
          throw new Error(`Stock validation failed: ${(e as Error).message}`);
        }
      }

      // Distribute invoice-level extra tax across items proportionally so server total matches.
      const baseTotals = cart.map((l) => Math.max(0, l.unit_price * l.qty - l.discount));
      const baseSum = baseTotals.reduce((a, b) => a + b, 0) || 1;
      const items = cart.map((l, idx) => {
        const lineBase = baseTotals[idx];
        const lineVat = Math.round(lineBase * (l.vat_rate / 100) * 100) / 100;
        const extraVat = Math.round((invoiceTaxAmount * (lineBase / baseSum)) * 100) / 100;
        const mult = l.unit_type === "box" ? (l.pcsPerBox ?? 100) : l.unit_type === "pata" ? (l.pcsPerStrip ?? 10) : 1;
        const pcsQty = l.qty * mult;
        const pcPrice = mult > 0 ? l.unit_price / mult : l.unit_price;
        return {
          product_id: l.product_id,
          qty: pcsQty,
          unit_price: pcPrice,
          discount: l.discount,
          vat: lineVat + extraVat,
          allow_stock_override: overrideStock,
        };
      });
      const pays = payments
        .filter((p) => p.method !== "due" && Number(p.amount) > 0)
        .map((p) => ({ method: p.method, amount: Number(p.amount) }));
      if (due > 0) pays.push({ method: "due" as PayMethod, amount: due });

      const client_op_id = safeUUID();

      if (editInvoiceId) {
        console.log("EDIT MODE — calling edit_sale_invoice", editInvoiceId);
        const { data, error } = await supabase.rpc("edit_sale_invoice" as never, {
          _tenant_id: tenantId,
          _original_sale_id: editInvoiceId,
          _customer_id: (customer?.id ?? null) as string,
          _cashier_id: user.id,
          _discount: invoiceDiscountAmount,
          _notes: notes || undefined,
          _client_op_id: client_op_id,
          _items: items as never,
          _payments: pays as never,
          _register_id: register?.id,
        } as never);
        if (error) {
          console.error("edit_sale_invoice failed", error);
          const parts = [
            error.message,
            error.details,
            error.hint,
            error.code ? `(code ${error.code})` : null,
          ].filter(Boolean) as string[];
          const detail = parts.length ? parts.join(" · ") : JSON.stringify(error);
          throw new Error(`Invoice edit failed — ${detail}\nOriginal invoice is unchanged.`);
        }
        const sale = data as unknown as CheckoutSale;
        console.log("EDIT OK — invoice", sale.invoice_no, "updated in place");
        return sale;
      }

      const enqueueOfflineCheckout = async (): Promise<CheckoutSale> => {
        const primaryMethod = pays.find((p) => p.method !== "due")?.method ?? "cash";
        const vatSum = items.reduce((s, it) => s + Number(it.vat ?? 0), 0);
        const offlineItems = cart.map((l, idx) => {
          const it = items[idx];
          return {
            product_id: it.product_id,
            name: l.name,
            qty: it.qty,
            unit_price: it.unit_price,
            unit_cost: l.cost,
            discount: it.discount,
            vat: it.vat,
            line_total: Math.round((it.qty * it.unit_price - it.discount + it.vat) * 100) / 100,
          };
        });
        const op = await queueSale({
          tenant_id: tenantId,
          warehouse_id: warehouseId ?? null,
          register_id: register?.id ?? null,
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? null,
          customer_phone: customer?.phone ?? null,
          subtotal: baseSum,
          discount: invoiceDiscountAmount,
          vat: vatSum,
          total,
          paid,
          due,
          payment_method: primaryMethod,
          notes: notes || undefined,
          items: offlineItems,
        });
        const offlineInv = (op.payload as { invoice_no?: string })?.invoice_no || `OFFLINE-${op.id.slice(0, 6).toUpperCase()}`;
        toast.success(`অফলাইনে বিক্রি সেভ হয়েছে (${offlineInv})! অনলাইনে এলে অটো সিঙ্ক হবে।`);
        return {
          id: op.id,
          invoice_no: offlineInv,
          total,
          paid,
          due,
          status: due > 0.01 ? "partial" : "completed",
        };
      };

      if (currentlyOffline) {
        return await enqueueOfflineCheckout();
      }

      try {
        const { data, error } = await supabase.rpc("pos_checkout", {
          _tenant_id: tenantId,
          _customer_id: (customer?.id ?? null) as string,
          _cashier_id: user.id,
          _invoice_no: null as unknown as string, // server generates INV-YYYYMM-NNNNNN
          _discount: invoiceDiscountAmount,
          _notes: notes || undefined,
          _client_op_id: client_op_id,
          _items: items as never,
          _payments: pays as never,
          _register_id: register!.id, // atomic cash-register entry inside RPC
          _warehouse_id: warehouseId,
        } as never);
        if (error) {
          if (isOfflineNetworkError(error)) {
            return await enqueueOfflineCheckout();
          }
          console.error("pos_checkout failed", error);
          const parts = [
            error.message,
            error.details,
            error.hint,
            error.code ? `(code ${error.code})` : null,
          ].filter(Boolean) as string[];
          const detail = parts.length ? parts.join(" · ") : JSON.stringify(error);
          throw new Error(`Checkout failed — ${detail}`);
        }
        const sale = data as CheckoutSale;
        return sale;
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await enqueueOfflineCheckout();
        }
        throw err;
      }
    },
    onSuccess: (sale) => {
      const isEdit = Boolean(editInvoiceId);
      setConfirm({
        id: sale.id,
        invoice_no: sale.invoice_no,
        total: Number(sale.total),
        paid: Number(sale.paid),
        due: Number(sale.due),
        status: sale.status,
        mode: isEdit ? "edit" : "create",
        customer_name: customer?.name ?? null,
      });
      // C3: Auto-earn loyalty points (best-effort, never blocks UX)
      if (!isEdit && customer && Number(sale.total) > 0) {
        earnLoyalty({
          data: { tenantId, customerId: customer.id, saleId: sale.id, saleAmount: Number(sale.total) },
        })
          .then((r) => {
            if (r.earned > 0) toast.success(`+${r.earned} loyalty points earned`);
          })
          .catch(() => { /* silent: loyalty failure must not break checkout */ });
      }
      // Reset transactional state — keep success dialog open for print/share/done
      resetCart();
      resetPayments();
      resetDiscount();
      resetTax();
      resetNotes();
      setOverrideStock(true);
      if (draftKey) window.localStorage.removeItem(draftKey);
      if (isEdit) {
        toast.success(t("toast.invoiceUpdatedFull", { no: sale.invoice_no }), { duration: 4000 });
      }
      if (posSettings.auto_print_receipt) setPrintOpen(true);
    },
    onError: (e: Error) => toast.error(e.message, { duration: 12000, style: { whiteSpace: "pre-line" } }),
  });

  function startNewSale() {
    const wasEdit = confirm?.mode === "edit";
    setConfirm(null);
    setCustomer(null);
    setOverrideStock(true);
    setPaymentsTouched(false);
    if (wasEdit) {
      clearEditState();
      navigate({ to: "/sales/pos", search: { edit: undefined, recall: undefined, ref: undefined }, replace: true });
    }
    searchRef.current?.focus();
  }

  const handleResume = useCallback(async (row: HeldRow) => {
    const cart = row.cart ?? {};
    const items = Array.isArray(cart.items) ? cart.items : [];
    setCart(items as unknown as CartLine[]);
    setInvoiceDiscount(Number(cart.invoice_discount ?? cart.discount) || 0);
    setInvoiceDiscountType(isAmountType(cart.invoice_discount_type) ? cart.invoice_discount_type : "amount");
    setInvoiceTax(Number(cart.invoice_tax) || 0);
    setInvoiceTaxType(isAmountType(cart.invoice_tax_type) ? cart.invoice_tax_type : "percent");
    setOverrideStock(Boolean(cart.override_stock));
    setNotes(String(cart.notes ?? ""));
    const pays = Array.isArray(cart.payments) ? cart.payments : [];
    setPayments(pays.length ? (pays as unknown as PayLine[]) : defaultPayments());
    setPaymentsTouched(pays.length > 0);
    if (cart.customer_id) {
      const { data } = await supabase
        .from("customers")
        .select("id,name,phone,email,credit_limit,due_balance,type")
        .eq("id", cart.customer_id).maybeSingle();
      if (data) setCustomer(data as unknown as CustomerRow);
      else setCustomer(null);
    } else {
      setCustomer(null);
    }
  }, []);

  // Keyboard shortcuts: F4 hold, F5 recall, F11 open register, F12 close register, ESC closes modals.
  // Shortcuts are suppressed when focus is inside an editable field (input/textarea/select/contenteditable/combobox).
  // Exception: an input flagged data-barcode-input keeps F-keys active for barcode scanner workflows.
  useEffect(() => {
    function isEditableTarget(el: EventTarget | null): boolean {
      const node = el as HTMLElement | null;
      if (!node) return false;
      if (node.dataset?.barcodeInput === "true") return false; // explicit opt-out
      const tag = node.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (node.isContentEditable) return true;
      const role = node.getAttribute?.("role");
      if (role === "combobox" || role === "textbox" || role === "searchbox") return true;
      return false;
    }
    function onKey(e: KeyboardEvent) {
      const editing = isEditableTarget(e.target);
      if (e.key === "Escape" && !editing) {
        if (holdOpen) setHoldOpen(false);
        if (recallOpen) setRecallOpen(false);
        if (openRegOpen) setOpenRegOpen(false);
        if (closeRegOpen) setCloseRegOpen(false);
        if (cashTxn) setCashTxn(null);
        return;
      }
      if (editing) return; // suppress F-keys while typing
      if (e.key === "F4") {
        e.preventDefault();
        if (cart.length) setHoldOpen(true);
        else toast.error(t("toast.cartEmpty"));
      } else if (e.key === "F5") {
        e.preventDefault();
        setRecallOpen(true);
      } else if (e.key === "F11") {
        e.preventDefault();
        if (!register) setOpenRegOpen(true);
        else toast.info(t("toast.registerAlreadyOpen"));
      } else if (e.key === "F12") {
        e.preventDefault();
        if (register) setCloseRegOpen(true);
        else toast.error(t("toast.noRegister"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length, holdOpen, recallOpen, openRegOpen, closeRegOpen, cashTxn, register]);

  const holdPayload = useMemo(() => ({
    items: cart as unknown as Array<Record<string, unknown>>,
    customer_id: customer?.id ?? null,
    discount: invoiceDiscount,
    invoice_discount: invoiceDiscount,
    invoice_discount_type: invoiceDiscountType,
    invoice_tax: invoiceTax,
    invoice_tax_type: invoiceTaxType,
    override_stock: overrideStock,
    notes,
    payments: payments as unknown as Array<Record<string, unknown>>,
  }), [cart, customer, invoiceDiscount, invoiceDiscountType, invoiceTax, invoiceTaxType, overrideStock, notes, payments]);

  function clearCart() {
    setCart([]);
    setInvoiceDiscount(0);
    setInvoiceDiscountType("amount");
    setInvoiceTax(0);
    setInvoiceTaxType("percent");
    setOverrideStock(true);
    setNotes("");
    setPayments(defaultPayments());
    setPaymentsTouched(false);
    setCustomer(null);
  }

  function focusCustomer() {
    customerSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const btn = customerSectionRef.current?.querySelector("button, [role='combobox']") as HTMLElement | null;
    btn?.focus();
    btn?.click();
  }


  return (
    <div className="flex h-screen flex-col overflow-x-hidden bg-muted/40 lg:overflow-hidden overflow-y-auto">
      {/* Top bar */}
      <header className="flex h-auto min-h-14 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">

          <Button variant="ghost" size="icon" asChild>
            <Link to="/sales"><X className="h-5 w-5" /></Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {editingInvoiceNo ? t("ipos.editingPrefix", { no: editingInvoiceNo }) : t("ipos.pointOfSale")}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {editingInvoiceNo ? t("ipos.savingUpdatesInvoice") : t("ipos.cashierPrefix", { name: user?.email ?? "—" })}
            </p>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-1 items-center justify-start gap-2 overflow-x-auto whitespace-nowrap pr-1 scrollbar-hide sm:w-auto sm:justify-end">
          {!isOnline && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {t("ipos.offlineMsg")}
            </Badge>
          )}
          <WarehouseSelect
            warehouses={warehouses}
            value={warehouseId}
            onChange={(id) => setWarehouseId(id)}
            placeholder={warehouses.length === 0 ? "No warehouses" : "Select warehouse"}
          />
          {selectedWarehouse?.branch_name && (
            <Badge variant="outline" className="hidden lg:inline-flex">
              {selectedWarehouse.branch_name}
            </Badge>
          )}
          {warehouses.length === 0 ? (
            <Badge
              variant="destructive"
              className="cursor-pointer gap-1"
              onClick={() => navigate({ to: "/setup" })}
              title="Open warehouse settings"
            >
              <AlertTriangle className="h-3 w-3" /> 🔴 No Warehouse Configured
            </Badge>
          ) : !warehouseId ? (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> Pick a warehouse
            </Badge>
          ) : null}
          <ActiveRegisterChip register={register ?? null} />
          {register ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setCashTxn("cash_in")} title={t("ipos.cashInTip")}>
                <ArrowDownToLine className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCashTxn("cash_out")} title={t("ipos.cashOutTip")}>
                <ArrowUpFromLine className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCashTxn("expense")} title={t("ipos.expenseTip")}>
                <Receipt className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCloseRegOpen(true)}>
                <Lock className="mr-1 h-3.5 w-3.5" /> {t("ipos.closeRegister")} <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">F12</kbd>
              </Button>
            </>
          ) : (
            <Button variant="default" size="sm" onClick={() => setOpenRegOpen(true)}>
              {t("ipos.openRegister")} <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">F11</kbd>
            </Button>
          )}
          {posSettings.enable_hold_sale && (
            <>
              <Button variant="outline" size="sm" onClick={() => cart.length ? setHoldOpen(true) : toast.error(t("toast.cartEmpty"))}>
                <Pause className="mr-1 h-3.5 w-3.5" /> {t("ipos.holdBtn")} <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">F4</kbd>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRecallOpen(true)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> {t("ipos.recallBtn")} <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">F5</kbd>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Search + Scan */}
      <div className="relative border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full min-w-0 lg:flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              placeholder={t("ipos.searchMedPh")}
              className="h-12 rounded-xl pl-12 pr-12 text-base shadow-sm focus-visible:ring-2 focus-visible:ring-primary"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { if (results.length > 0) setDropdownOpen(true); }}
              onKeyDown={onSearchKey}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-1" />}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setBlisterScanOpen(true)}
                className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg"
                title="ক্যামেরা দিয়ে পাতা স্ক্যান করুন"
              >
                <Camera className="h-4 w-4" />
              </Button>
            </div>
            {dropdownOpen && debounced && (
              <PosSearchDropdown
                ref={dropdownRef}
                scrollRef={dropdownScrollRef}
                results={results}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                query={debounced}
                isFetching={isFetching}
                isLoadingInitial={isLoadingInitial}
                hasMore={hasMore}
                onLoadMore={loadMoreResults}
                onSelect={(p) => {
                  const full = results.find((r) => r.id === p.id);
                  if (full) addProductToCart(full);
                }}
              />
            )}
          </div>
          <div className="relative w-full lg:w-72">
            <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={scanRef}
              placeholder={t("ipos.scanPh")}
              className="h-12 rounded-xl pl-9 text-sm"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleBarcode(scanInput); }
              }}
            />
          </div>
          <Button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="h-12 w-full lg:w-auto shrink-0 gap-2 rounded-xl px-4"
            title="Add Product (F2)"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">Add Product</span>
            <kbd className="ml-1 hidden rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] md:inline">F2</kbd>
          </Button>
        </div>
      </div>

      <BlisterScannerDialog
        open={blisterScanOpen}
        onOpenChange={setBlisterScanOpen}
        onMedicineDetected={(name) => {
          handleQuickPillClick(name, 10.00);
          toast.success(`${name} কার্টে যোগ করা হয়েছে`);
        }}
        availableMedicines={results}
      />

      {quickAddOpen && (
        <Suspense fallback={null}>
          <QuickAddProductDialog
            open={quickAddOpen}
            onOpenChange={setQuickAddOpen}
            tenantId={tenantId ?? ""}
            onCreated={(p: QuickAddResult, addToCart: boolean) => {
              if (!addToCart) return;
              addProductToCart({
                id: p.id, name: p.name, displayName: p.displayName,
                sku: p.sku, barcode: p.barcode,
                retail_price: p.retail_price, purchase_price: p.purchase_price,
                vat_rate: p.vat_rate, stock: p.stock,
                generic_name: p.generic_name, category_name: p.category_name,
                manufacturer_name: p.manufacturer_name,
                strength: p.strength, dosage_form: p.dosage_form,
                nearest_expiry: p.nearest_expiry,
              });
              // Focus qty input for the new cart line
              window.setTimeout(() => {
                const el = document.querySelector<HTMLInputElement>(`[data-qty-input="${p.id}"]`);
                el?.focus(); el?.select();
              }, 150);
            }}
          />
        </Suspense>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-x-hidden p-3 pb-24 sm:p-4 sm:pb-24 lg:flex-row lg:gap-4 lg:overflow-hidden lg:pb-4">
        {/* LEFT — Cart */}
        <Card className={cn(
          "flex min-h-0 flex-col shadow-card transition-all duration-300",
          "lg:flex", // Always show on desktop
          mobileView === "cart" ? "flex flex-1" : "hidden"
        )}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold">{t("ipos.cartItemsLbl")}</p>
              <Badge variant="secondary">{cart.length}</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={clearCart} disabled={!cart.length}>
              {t("ipos.clearAll")}
            </Button>
          </div>

          {stockIssues.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
              <div className="flex items-center gap-2">
                <PackageX className="h-3.5 w-3.5" />
                {t("ipos.insufficientStock", { n: stockIssues.length })}
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                <input type="checkbox" checked={overrideStock} onChange={(e) => setOverrideStock(e.target.checked)} className="h-3.5 w-3.5 accent-destructive" />
                {t("ipos.sellAnyway")}
              </label>
            </div>
          )}

          {expiryWarnings.length > 0 && (
            <div className="border-b border-border bg-orange-500/5 px-4 py-2 text-xs">
              {expiryWarnings.map(({ line, info }) => {
                const expired = info!.days < 0;
                return (
                  <div
                    key={line.product_id}
                    className={`flex flex-wrap items-center justify-between gap-2 ${expired ? "text-destructive" : "text-orange-600 dark:text-orange-400"}`}
                  >
                    <span className="font-medium">
                      {expired ? "⛔ Expired" : "⚠ Near expiry"}: {line.name} · Batch {info!.batch_no} · Exp {info!.expiry_date}
                    </span>
                    <span className="font-semibold">
                      {expired ? `${Math.abs(info!.days)} d ago` : `${info!.days} d left`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
            {cart.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
                <div>
                  <ScanBarcode className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p>{t("ipos.scanToStart")}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="hidden lg:grid grid-cols-[1fr_110px_100px_100px_100px_32px] items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>{t("ipos.col_item")}</span>
                  <span className="text-center">{t("ipos.col_qty")}</span>
                  <span className="text-right">{t("ipos.col_price")}</span>
                  <span className="text-right">{t("ipos.col_disc")}</span>
                  <span className="text-right">{t("ipos.col_total")}</span>
                  <span />
                </div>
                {cart.map((l) => {
                  const mult = l.unit_type === "box" ? (l.pcsPerBox ?? 100) : l.unit_type === "pata" ? (l.pcsPerStrip ?? 10) : 1;
                  const lineTotal = Math.max(0, l.unit_price * l.qty - l.discount);
                  const lineCost = l.cost * l.qty * mult;
                  const lineProfit = lineTotal - lineCost;
                  const lowStock = l.stock < l.qty * mult;
                  const unitLabel = l.unit_type === "box" ? "বক্স" : l.unit_type === "pata" ? "পাতা" : "পিস";
                  const showStrip = l.hasStrip ?? supportsStripUnit(undefined, l.name);
                  const availableUnits: UnitType[] = showStrip
                    ? ["piece", "pata", "box"]
                    : (l.pcsPerBox ?? 1) > 1
                      ? ["piece", "box"]
                      : ["piece"];
                  const batchInfo = liveBatchInfo?.earliest?.[l.product_id];
                  return (
                    <div key={l.product_id} className={cn(
                      "flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-2xs transition-all",
                      lineProfit < 0
                        ? "border-rose-400 bg-rose-50/30 dark:bg-rose-950/10"
                        : lowStock
                          ? "border-destructive/40"
                          : "border-border hover:border-emerald-500/40",
                    )}>
                      {/* Top row: Medicine name, price, speaker, remove */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold leading-snug break-words text-foreground">{l.name}</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 rounded-full text-muted-foreground hover:text-emerald-600"
                              onClick={() => speakMedicine(l.name, l.unit_price)}
                              title="নাম ও দাম শুনুন"
                            >
                              <Volume2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {l.generic_name && (
                            <p className="truncate text-xs text-muted-foreground">{l.generic_name}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="h-4.5 px-1.5 text-[10px] font-mono border-muted bg-muted/30">
                              {batchInfo?.batch_no ? `BT:${batchInfo.batch_no}` : (l.sku || "FEFO")}
                            </Badge>
                            {batchInfo?.expiry_date ? (
                              <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
                                মেয়াদ {batchInfo.expiry_date.slice(2, 7)}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="h-4.5 px-1.5 text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
                                FEFO
                              </Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground">· স্টক {l.stock}</span>
                            {lowStock && (
                              <Badge variant="outline" className="h-4.5 gap-0.5 border-destructive/40 bg-destructive/10 px-1 text-[9px] text-destructive">
                                <AlertTriangle className="h-2.5 w-2.5" /> {t("ipos.shortBadge")}
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-muted-foreground">৳</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={Number(lineTotal.toFixed(2))}
                            onChange={(e) => {
                              const target = Math.max(0, Number(e.target.value) || 0);
                              const gross = l.unit_price * l.qty;
                              if (target <= gross) {
                                updateLine(l.product_id, { discount: Math.round((gross - target) * 100) / 100 });
                              } else {
                                updateLine(l.product_id, {
                                  discount: 0,
                                  unit_price: l.qty > 0 ? Math.round((target / l.qty) * 10000) / 10000 : target,
                                });
                              }
                            }}
                            className={cn(
                              "h-8 w-24 text-right text-sm font-black rounded-lg",
                              lineProfit < 0
                                ? "text-rose-600 border-rose-300"
                                : "text-emerald-600 dark:text-emerald-400",
                            )}
                            title="সরাসরি মোট দাম এডিট করুন"
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLine(l.product_id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Bottom row: [বক্স] [পাতা] [পিস] Segmented Toggle + Stepper */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
                        {/* 1-Tap Unit Selector */}
                        <div className="flex items-center gap-1">
                          <div className="inline-flex rounded-lg bg-muted/70 p-0.5 border border-border">
                            {availableUnits.map((u) => {
                              const active = (l.unit_type || "piece") === u;
                              const label = u === "box" ? "বক্স" : u === "pata" ? "পাতা" : "পিস";
                              return (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => updateLineUnit(l.product_id, u)}
                                  className={cn(
                                    "rounded-md px-2.5 py-1 text-xs font-bold transition-all",
                                    active
                                      ? "bg-emerald-700 text-white shadow-2xs"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          <span className="text-[11px] font-semibold text-muted-foreground ml-1.5 hidden sm:inline">
                            ৳{l.unit_price} / প্রতি {unitLabel}
                          </span>
                        </div>

                        {/* Quantity Stepper + Line Discount */}
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <span>ছাড় ৳</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.discount || ""}
                              placeholder="0"
                              onChange={(e) => updateLine(l.product_id, { discount: Math.max(0, Number(e.target.value) || 0) })}
                              className="h-8 w-16 px-1.5 text-right text-xs font-semibold rounded-lg"
                            />
                          </label>
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-[11px] font-bold",
                              lineProfit < 0
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-50 text-emerald-700",
                            )}
                          >
                            {lineProfit < 0
                              ? `লস: -৳${Math.abs(lineProfit).toFixed(2)}`
                              : `লাভ: +৳${lineProfit.toFixed(2)}`}
                          </span>
                          <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-lg shrink-0 border-border font-bold"
                            onClick={() => updateLine(l.product_id, { qty: Math.max(1, l.qty - 1) })}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Input
                            type="number"
                            className="h-8 w-12 px-1 text-center font-bold text-sm rounded-lg"
                            data-qty-input={l.product_id}
                            value={l.qty}
                            onChange={(e) => updateLine(l.product_id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                            onFocus={(e) => e.target.select()}
                          />
                          <Button
                            size="icon"
                            className="h-8 w-8 rounded-lg shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            onClick={() => updateLine(l.product_id, { qty: l.qty + 1 })}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* RIGHT — Billing */}
        <Card className={cn(
          "flex min-h-0 flex-col shadow-card transition-all duration-300 w-full lg:w-[400px] shrink-0",
          "lg:flex",
          mobileView === "checkout" ? "flex flex-1" : "hidden lg:flex"
        )}>
          <div ref={customerSectionRef} className="border-b border-border bg-gradient-to-br from-primary/5 to-transparent p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("ipos.customerSection")}</p>
            <POSCustomerSelect value={customer} onChange={setCustomer} />
          </div>

          <CardContent className="flex-1 space-y-3 overflow-y-auto p-4 text-sm scrollbar-hide">
            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <Row label={t("ipos.subtotalRow")} value={`৳ ${subtotal.toFixed(2)}`} />
              <Row label={t("ipos.lineDiscount")} value={`− ৳ ${lineDiscTotal.toFixed(2)}`} muted />
              <Row label={`${t("ipos.invoiceDiscount")}${invoiceDiscountType === "percent" ? ` (${invoiceDiscount || 0}%)` : ""}`}
                value={`− ৳ ${invoiceDiscountAmount.toFixed(2)}`} muted />
              <Row label={t("ipos.lineVat")} value={`+ ৳ ${lineVatTotal.toFixed(2)}`} muted />
              <Row label={`${t("ipos.extraTax")}${invoiceTaxType === "percent" ? ` (${invoiceTax || 0}%)` : ""}`}
                value={`+ ৳ ${invoiceTaxAmount.toFixed(2)}`} muted />
            </div>

            {/* Discount editor with type toggle */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("ipos.invoiceDiscount")}</p>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
                  <button type="button"
                    onClick={() => setInvoiceDiscountType("amount")}
                    className={cn("px-2.5 h-7 text-xs rounded-sm font-semibold transition-colors",
                      invoiceDiscountType === "amount" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>
                    ৳
                  </button>
                  <button type="button"
                    onClick={() => setInvoiceDiscountType("percent")}
                    className={cn("px-2.5 h-7 text-xs rounded-sm font-semibold transition-colors",
                      invoiceDiscountType === "percent" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>
                    %
                  </button>
                </div>
                <Input type="number" step="0.01" min={0}
                  max={invoiceDiscountType === "percent" ? 100 : undefined}
                  className="h-8 flex-1 text-right font-semibold"
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(Math.max(0, Number(e.target.value) || 0))}
                  onFocus={(e) => e.target.select()} />
              </div>
            </div>

            {/* Tax editor with type toggle */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("ipos.extraTaxVat")}</p>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md border border-border bg-muted p-0.5">
                  <button type="button"
                    onClick={() => setInvoiceTaxType("amount")}
                    className={cn("px-2.5 h-7 text-xs rounded-sm font-semibold transition-colors",
                      invoiceTaxType === "amount" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>
                    ৳
                  </button>
                  <button type="button"
                    onClick={() => setInvoiceTaxType("percent")}
                    className={cn("px-2.5 h-7 text-xs rounded-sm font-semibold transition-colors",
                      invoiceTaxType === "percent" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}>
                    %
                  </button>
                </div>
                <Input type="number" step="0.01" min={0}
                  className="h-8 flex-1 text-right font-semibold"
                  value={invoiceTax}
                  onChange={(e) => setInvoiceTax(Math.max(0, Number(e.target.value) || 0))}
                  onFocus={(e) => e.target.select()} />
              </div>
            </div>

            <Separator />

            <div className="rounded-lg bg-primary/10 px-3 py-2.5 flex items-baseline justify-between">
              <span className="text-sm font-bold text-primary/80">{t("ipos.grandTotal")}</span>
              <span className="text-2xl font-extrabold text-primary tracking-tight">৳ {total.toFixed(2)}</span>
            </div>

            {/* Change Calculator — ফেরতের হিসাব */}
            <ChangeCalculatorCard
              total={total}
              received={cashReceived > 0 ? cashReceived : paid}
              onReceivedChange={(val) => {
                setCashReceived(val);
                setPayments([{ method: "cash", amount: Math.min(val, total) }]);
                setPaymentsTouched(true);
              }}
            />

            {originalSale && (
              <div className={cn(
                "rounded-lg border px-3 py-2.5 text-xs space-y-1.5",
                originalSale.paid > total + 0.01
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-warning/40 bg-warning/5"
              )}>
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">{t("ipos.editingInvoice", { no: originalSale.invoice_no })}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(originalSale.created_at).toLocaleDateString()} · {originalSale.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/40">
                  <div><div className="text-[10px] text-muted-foreground">{t("ipos.originalTotal")}</div><div className="font-mono font-semibold">৳{originalSale.total.toFixed(2)}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">{t("ipos.previouslyPaid")}</div><div className="font-mono font-semibold">৳{originalSale.paid.toFixed(2)}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">{t("ipos.previousDue")}</div><div className="font-mono font-semibold">৳{originalSale.due.toFixed(2)}</div></div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div><div className="text-[10px] text-muted-foreground">{t("ipos.editedTotal")}</div><div className="font-mono font-semibold">৳{total.toFixed(2)}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">{t("ipos.editedPaid")}</div><div className="font-mono font-semibold">৳{paid.toFixed(2)}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">{t("ipos.editedDue")}</div><div className="font-mono font-semibold">৳{due.toFixed(2)}</div></div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border/40">
                  <span className="text-[10px] text-muted-foreground">{t("ipos.difference")}</span>
                  <span className={cn("font-mono font-bold", total - originalSale.total >= 0 ? "text-success" : "text-destructive")}>
                    {total - originalSale.total >= 0 ? "+" : ""}৳{(total - originalSale.total).toFixed(2)}
                  </span>
                </div>
                {originalSale.paid > total + 0.01 && (
                  <div className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                    {t("ipos.overpaidWarn", { paid: originalSale.paid.toFixed(2), total: total.toFixed(2), diff: (originalSale.paid - total).toFixed(2) })}
                  </div>
                )}
              </div>
            )}

            {/* Quick payment method buttons */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("ipos.quickPayFull")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {(["cash", "card", "bkash", "due"] as PayMethod[]).map((m) => {
                  const active = payments.length === 1 && payments[0].method === m;
                  return (
                    <button key={m} type="button"
                      onClick={() => {
                        setPayments([{ method: m, amount: m === "due" ? 0 : Math.round(total * 100) / 100 }]);
                        setPaymentsTouched(m === "due");
                      }}
                      className={cn(
                        "h-9 rounded-md border text-xs font-semibold transition-all",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-card hover:border-primary/40 hover:bg-accent",
                      )}>
                      {PAY_LABEL[m]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("ipos.paymentSplit")}</p>
                <Button size="sm" variant="ghost" className="h-7 gap-1"
                  onClick={() => {
                    setPayments((ps) => [...ps, { method: "cash", amount: Math.max(0, total - paid) }]);
                    setPaymentsTouched(true);
                  }}>
                  <Plus className="h-3 w-3" /> {t("ipos.addBtn")}
                </Button>
              </div>
              {payments.map((p, i) => (
                <div key={i} className="space-y-1.5 rounded-md border border-border bg-card p-2">
                  <div className="flex items-center gap-2">
                    <Select value={p.method} onValueChange={(v) => {
                      setPayments((ps) => ps.map((x, j) => j === i ? { ...x, method: v as PayMethod, amount: v === "due" ? 0 : x.amount } : x));
                      setPaymentsTouched(true);
                    }}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["cash","card","bkash","nagad","rocket","bank","other","due"] as PayMethod[]).map((m) => (
                          <SelectItem key={m} value={m}>{PAY_LABEL[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" step="0.01" min={0} className="h-8 flex-1 text-right font-semibold"
                      value={p.amount}
                      disabled={p.method === "due"}
                      onChange={(e) => {
                        setPayments((ps) => ps.map((x, j) => j === i ? { ...x, amount: Math.max(0, Number(e.target.value) || 0) } : x));
                        setPaymentsTouched(true);
                      }}
                      onFocus={(e) => e.target.select()} />
                    {payments.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => {
                          setPayments((ps) => ps.filter((_, j) => j !== i));
                          setPaymentsTouched(true);
                        }}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {p.method !== "due" && (
                    <div className="flex flex-wrap gap-1">
                      <button type="button"
                        onClick={() => {
                          setPayments((ps) => ps.map((x, j) => j === i ? { ...x, amount: Math.max(0, total - (paid - (Number(ps[i].amount) || 0))) } : x));
                          setPaymentsTouched(true);
                        }}
                        className="h-6 rounded border border-border bg-muted/40 px-2 text-[10px] font-semibold hover:bg-accent">
                        {t("ipos.exactBtn")}
                      </button>
                      {[100, 500, 1000].map((v) => (
                        <button key={v} type="button"
                          onClick={() => {
                            setPayments((ps) => ps.map((x, j) => j === i ? { ...x, amount: (Number(x.amount) || 0) + v } : x));
                            setPaymentsTouched(true);
                          }}
                          className="h-6 rounded border border-border bg-muted/40 px-2 text-[10px] font-semibold hover:bg-accent">
                          +{v}
                        </button>
                      ))}
                      <button type="button"
                        onClick={() => {
                          setPayments((ps) => ps.map((x, j) => j === i ? { ...x, amount: 0 } : x));
                          setPaymentsTouched(true);
                        }}
                        className="h-6 rounded border border-border bg-muted/40 px-2 text-[10px] font-semibold hover:bg-accent">
                        {t("ipos.clearBtn")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {due > 0 && !payments.some((p) => p.method === "due") && (
                <div className="flex items-center justify-between rounded-md border border-dashed border-warning/50 bg-warning/5 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-warning">{t("ipos.autoDue")}</span>
                    <span className="text-[11px] text-muted-foreground">{t("ipos.addedOnSale")}</span>
                  </div>
                  <span className="text-sm font-bold text-warning">৳ {due.toFixed(2)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="text-[10px] uppercase text-muted-foreground">{t("ipos.paidLbl")}</p>
                  <p className="text-sm font-bold">৳ {paid.toFixed(2)}</p>
                </div>
                <div className={cn("rounded-md px-2 py-1.5", due > 0 ? "bg-warning/10" : "bg-success/10")}>
                  <p className="text-[10px] uppercase text-muted-foreground">{t("ipos.dueLbl")}</p>
                  <p className={cn("text-sm font-bold", due > 0 ? "text-warning" : "text-success")}>৳ {due.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <Input placeholder={t("ipos.notesOptionalPh")} value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8" />
          </CardContent>

          <div className="space-y-2 border-t border-border bg-muted/30 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-2">
              <Button variant="outline" className="h-10 w-full" onClick={() => setHoldOpen(true)} disabled={!cart.length}>
                <Pause className="mr-2 h-4 w-4" /> {t("ipos.holdSale")}
              </Button>
              <Button variant="outline" className="h-10 w-full" onClick={() => setRecallOpen(true)}>
                <RotateCcw className="mr-2 h-4 w-4" /> {t("ipos.recallSale")}
              </Button>
            </div>
            {(() => {
              const disabledReason =
                !warehouseId
                  ? (warehouses.length === 0
                      ? "Create a warehouse before making sales"
                      : "Select a warehouse first")
                  : !cart.length
                    ? "Cart is empty"
                    : checkout.isPending
                      ? "Sale already processing"
                       : (!editInvoiceId && due > 0 && !customer)
                         ? "Due sales require a customer (walk-in cannot owe)"
                         : null;
              return (
                <>
                  {disabledReason && (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                      <span>⚠ {disabledReason}</span>
                      {!warehouseId && (
                        <Button size="sm" variant="outline"
                          className="h-7 border-warning/50 text-warning hover:bg-warning/20"
                          onClick={() => navigate({ to: "/setup" })}>
                          Create Warehouse
                        </Button>
                      )}
                      {warehouseId && disabledReason === "Due sales require a customer (walk-in cannot owe)" && (
                        <Button size="sm" variant="outline"
                          className="h-7 border-warning/50 text-warning hover:bg-warning/20"
                          onClick={focusCustomer}>
                          {t("ipos.selectCustomerBtn")}
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="sticky bottom-0 bg-card pt-2 lg:pt-0">
                    <Button
                      className={cn(
                        "h-12 w-full text-base font-bold shadow-md",
                        !warehouseId && "cursor-not-allowed opacity-60",
                      )}
                      title={!warehouseId ? "Warehouse required" : (disabledReason ?? undefined)}
                      onClick={() => {
                        if (disabledReason) { toast.error(disabledReason); return; }
                        checkout.mutate();
                      }}>
                      {checkout.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {t("ipos.completeSale", { amt: total.toFixed(2) })}
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>

        </Card>
      </div>

      {/* Mobile Toggle Switcher */}
      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card p-1 shadow-2xl lg:hidden">
        <Button
          variant={mobileView === "cart" ? "default" : "ghost"}
          size="sm"
          className={cn("h-10 rounded-full px-4", mobileView === "cart" && "bg-primary text-primary-foreground hover:bg-primary/90")}
          onClick={() => setMobileView("cart")}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          {t("ipos.cartItemsLbl")}
        </Button>
        <Button
          variant={mobileView === "checkout" ? "default" : "ghost"}
          size="sm"
          className={cn("h-10 rounded-full px-4", mobileView === "checkout" && "bg-primary text-primary-foreground hover:bg-primary/90")}
          onClick={() => setMobileView("checkout")}
        >
          <CreditCard className="mr-2 h-4 w-4" />
          {t("ipos.checkout")}
        </Button>
      </div>


      {/* Warehouse Required modal */}
      <Dialog open={warehousesFetched && warehouses.length === 0}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Warehouse Required
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You cannot make purchases, sales, stock transfers, or inventory transactions until a warehouse is created.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/sales" })}>Close</Button>
            <Button onClick={() => navigate({ to: "/setup" })}>Create Warehouse</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <Dialog open={!!confirm} onOpenChange={(v) => { if (!v) startNewSale(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              {confirm?.mode === "edit" ? t("ipos.invoiceUpdatedTitle") : t("ipos.saleCompletedTitle")}
            </DialogTitle>
            {confirm && (
              <p className="text-sm text-muted-foreground pt-1">
                {confirm.mode === "edit"
                  ? t("ipos.invoiceUpdatedNote", { no: confirm.invoice_no })
                  : t("ipos.invoiceCreatedNote", { no: confirm.invoice_no })}
              </p>
            )}
          </DialogHeader>
          {confirm && (
            <div className="space-y-2 text-sm">
              <Row label={t("ipos.rowInvoice")} value={confirm.invoice_no} />
              {confirm.customer_name && <Row label={t("ipos.rowCustomer")} value={confirm.customer_name} />}
              <Row label={t("ipos.rowTotal")} value={`৳ ${confirm.total.toFixed(2)}`} />
              <Row label={t("ipos.rowPaid")} value={`৳ ${confirm.paid.toFixed(2)}`} />
              <Row label={t("ipos.rowDue")} value={`৳ ${confirm.due.toFixed(2)}`} />
              <Row label={t("ipos.rowStatus")} value={confirm.status} />
            </div>
          )}
          {confirm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              <Button variant="outline" onClick={() => setPrintOpen(true)}>
                <Printer className="mr-1 h-4 w-4" /> {t("ipos.printInvoice")}
              </Button>
              <Button
                variant="outline"
                className="border-success/50 text-success hover:bg-success/10"
                onClick={() => setShareOpen(true)}>
                <MessageCircle className="mr-1 h-4 w-4" /> {t("ipos.whatsapp")}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/invoices/$id", params: { id: confirm.id } })}>
                {t("ipos.viewInvoice")}
              </Button>
              <Button onClick={startNewSale}>
                {confirm.mode === "edit" ? t("ipos.done") : t("ipos.newSale")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>


      <HoldSaleDialog
        open={holdOpen}
        onOpenChange={setHoldOpen}
        tenantId={tenantId}
        payload={holdPayload}
        onHeld={clearCart}
      />
      <RecallSaleDialog
        open={recallOpen}
        onOpenChange={setRecallOpen}
        tenantId={tenantId}
        onResume={handleResume}
      />

      <OpenRegisterDialog
        open={openRegOpen}
        onOpenChange={(v) => { setOpenRegOpen(v); if (!v) refetchRegister(); }}
      />
      <CloseRegisterDialog
        open={closeRegOpen}
        onOpenChange={(v) => { setCloseRegOpen(v); if (!v) refetchRegister(); }}
        register={register ?? null}
      />
      <CashTxnDialog
        open={!!cashTxn}
        onOpenChange={(v) => { if (!v) setCashTxn(null); }}
        register={register ?? null}
        type={cashTxn ?? "cash_in"}
      />
      <InvoicePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        saleId={confirm?.id ?? null}
        tenantId={tenantId}
      />
      <InvoiceShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        invoiceNo={confirm?.invoice_no ?? ""}
        total={confirm?.total ?? 0}
        phone={customer?.phone ?? undefined}
        url={typeof window !== "undefined" && confirm
          ? `${window.location.origin}/invoices/${confirm.id}`
          : ""}
        onPrint={() => { setShareOpen(false); setPrintOpen(true); }}
      />
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn("flex justify-between", muted && "text-muted-foreground")}>
      <span className={muted ? "" : "text-muted-foreground"}>{label}</span>
      <span className={muted ? "" : "font-semibold"}>{value}</span>
    </div>
  );
}
