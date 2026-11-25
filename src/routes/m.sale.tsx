import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  Check,
  Eye,
  Loader2,
  Minus,
  Plus,
  ScanBarcode,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneChip, PhoneChipRow, PhoneEmpty, money } from "@/components/mobile/phone-ui";
import {
  MobileCameraScanner,
  type ScannedProductMatch,
} from "@/components/mobile/mobile-camera-scanner";
import {
  InvoiceShareDialog,
  type ShareInvoicePayload,
} from "@/components/mobile/invoice-share-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { createCustomer } from "@/lib/api/customer-crud.functions";
import { useAuth } from "@/hooks/use-auth";
import { useActiveRegister } from "@/hooks/use-active-register";
import {
  getAvailableUnits,
  getUnitMultiplier,
  resolvePackConfig,
  unitLabelBn,
  type MedicineUnitMode,
} from "@/lib/medicine-units";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/sale")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "বিক্রি (POS) — SohojPharma" },
      { name: "description", content: "দ্রুত মোবাইল POS বিলিং, ক্যামেরা স্ক্যানার ও প্রাইস এডিট।" },
    ],
  }),
  component: MobileSale,
});

type SearchRow = {
  id: string;
  name: string;
  sku: string | null;
  retail_price: number | string;
  purchase_price: number | string;
  effective_price: number | string | null;
  vat_rate: number | string | null;
  qty_on_hand: number | string | null;
  strength: string | null;
  medicine_type: string | null;
};

type Line = {
  product_id: string;
  name: string;
  form: string | null;
  strength: string | null;
  cost: number;
  price: number; // always per-piece price
  vat_rate: number;
  stock: number; // in pieces
  qty: number; // quantity in active unitMode
  unitMode: MedicineUnitMode;
  hasStrip: boolean;
  pcsPerStrip: number;
  pcsPerBox: number;
};

function MobileSale() {
  const { currentTenantId, user } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { data: register } = useActiveRegister();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [searchQtyDraft, setSearchQtyDraft] = useState<Record<string, string>>({});
  const [showCost, setShowCost] = useState(false);
  const [cart, setCart] = useState<Line[]>([]);
  const [billingOpen, setBillingOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["m-pos-search", tenantId, debounced],
    enabled: !!tenantId && debounced.length >= 1,
    queryFn: async (): Promise<Line[]> => {
      const { data, error } = await supabase.rpc("search_products" as never, {
        _tenant_id: tenantId,
        _query: debounced,
        _branch_id: null,
        _limit: 30,
        _warehouse_id: null,
        _offset: 0,
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
      return list.map((p) => {
        const pk = packMap.get(p.id);
        const cfg = resolvePackConfig({
          medicine_type: p.medicine_type,
          name: p.name,
          pack_size: pk?.pack_size,
          qty_per_box: pk?.qty_per_box,
        });
        return {
          product_id: p.id,
          name: p.name,
          form: p.medicine_type,
          strength: p.strength,
          cost: Number(p.purchase_price ?? 0),
          price: Number(p.effective_price ?? p.retail_price ?? 0),
          vat_rate: Number(p.vat_rate ?? 0),
          stock: Number(p.qty_on_hand ?? 0),
          qty: 0,
          unitMode: "pc" as MedicineUnitMode,
          hasStrip: cfg.hasStrip,
          pcsPerStrip: cfg.pcsPerStrip,
          pcsPerBox: cfg.pcsPerBox,
        };
      });
    },
  });

  const clearSearch = () => {
    setQuery("");
    setDebounced("");
    setSearchQtyDraft({});
  };

  function addFromSearch(item: Line | ScannedProductMatch, addQty: number, clearAfter = true) {
    if (addQty <= 0) return;
    const cfg = "hasStrip" in item
      ? { hasStrip: item.hasStrip, pcsPerStrip: item.pcsPerStrip, pcsPerBox: item.pcsPerBox }
      : resolvePackConfig({ medicine_type: item.form, name: item.name });
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product_id === item.product_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + addQty };
        return next;
      }
      return [
        {
          ...item,
          qty: addQty,
          unitMode: "unitMode" in item ? item.unitMode : "pc",
          hasStrip: cfg.hasStrip,
          pcsPerStrip: cfg.pcsPerStrip,
          pcsPerBox: cfg.pcsPerBox,
        },
        ...prev,
      ];
    });
    if (clearAfter) {
      clearSearch();
    }
  }

  function updateCartUnit(productId: string, unitMode: MedicineUnitMode) {
    setCart((prev) =>
      prev.map((l) => (l.product_id === productId ? { ...l, unitMode } : l)),
    );
  }

  function updateCartQty(productId: string, qty: number) {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((l) => l.product_id !== productId);
      return prev.map((l) => (l.product_id === productId ? { ...l, qty } : l));
    });
  }

  function updateCartPrice(productId: string, price: number) {
    const safePrice = Math.max(0, Number.isFinite(price) ? price : 0);
    setCart((prev) =>
      prev.map((l) => (l.product_id === productId ? { ...l, price: safePrice } : l)),
    );
  }

  const lineMult = (l: Line) => getUnitMultiplier(l.unitMode, l.pcsPerStrip, l.pcsPerBox);
  const totalQty = cart.reduce((s, l) => s + l.qty * lineMult(l), 0);
  const totalPrice = cart.reduce((s, l) => s + l.qty * lineMult(l) * l.price, 0);
  const totalCost = cart.reduce((s, l) => s + l.qty * lineMult(l) * l.cost, 0);

  return (
    <PhoneShell
      title="বিক্রি (POS)"
      back
      help={
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          aria-label="ক্যামেরা স্ক্যান"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground active:scale-95 transition-transform"
        >
          <Camera className="h-5 w-5" />
        </button>
      }
    >
      {/* Search + Camera Scan Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ওষুধ, জেনেরিক বা বারকোড..."
            className="h-11 rounded-2xl border-slate-200 bg-white pl-9 pr-9 text-sm shadow-xs"
            inputMode="search"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="h-11 shrink-0 rounded-2xl bg-[#0d5c46] hover:bg-[#094735] px-3.5 text-white font-semibold gap-1.5 shadow-xs"
        >
          <ScanBarcode className="h-4.5 w-4.5" />
          <span className="text-xs">স্ক্যান</span>
        </Button>
      </div>

      {/* Quick Control Chips */}
      <PhoneChipRow className="mt-2.5">
        <PhoneChip active={showCost} onClick={() => setShowCost((v) => !v)}>
          <Eye className="mr-1 inline h-3.5 w-3.5" />
          {showCost ? "ক্রয়মূল্য লুকান" : "ক্রয়মূল্য দেখুন"}
        </PhoneChip>
        {cart.length > 0 && (
          <PhoneChip
            onClick={() => {
              setCart([]);
              toast.info("বিল তালিকা খালি করা হয়েছে");
            }}
          >
            সব মুছুন ({cart.length})
          </PhoneChip>
        )}
      </PhoneChipRow>

      {/* Active Search Results Panel (auto-clears once qty is added) */}
      {debounced.length > 0 && (
        <div className="mt-3 space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-[#0d5c46]">
              সার্চ ফলাফল {isFetching ? "" : `(${results.length})`}
            </span>
            <button
              type="button"
              onClick={clearSearch}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            >
              বন্ধ করুন
            </button>
          </div>

          {isFetching && results.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-[#0d5c46]" />
              খোঁজা হচ্ছে...
            </div>
          )}

          {!isFetching && results.length === 0 && (
            <p className="py-5 text-center text-xs text-slate-500">
              "{debounced}" নামে কোনো ওষুধ পাওয়া যায়নি
            </p>
          )}

          {results.map((r) => {
            const draftVal = searchQtyDraft[r.product_id] ?? "";
            return (
              <div
                key={r.product_id}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-snug text-slate-900">{r.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {[r.form, r.strength].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold text-[#0d5c46]">৳{r.price.toFixed(2)}</p>
                    <p
                      className={cn(
                        "text-[11px] font-semibold",
                        r.stock > 0 ? "text-emerald-600" : "text-rose-600",
                      )}
                    >
                      স্টক: {r.stock}
                    </p>
                  </div>
                </div>

                {/* Quick Qty buttons + Custom Qty input (clears search immediately!) */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    {[1, 5, 10].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => addFromSearch(r, q, true)}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#0d5c46] hover:bg-[#0d5c46] hover:text-white active:scale-95 transition"
                      >
                        +{q}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={1}
                      placeholder="পরিমাণ"
                      value={draftVal}
                      onChange={(e) =>
                        setSearchQtyDraft((prev) => ({ ...prev, [r.product_id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const q = Math.max(1, Number(draftVal) || 1);
                          addFromSearch(r, q, true);
                        }
                      }}
                      inputMode="numeric"
                      className="h-8 w-20 rounded-lg border-slate-200 text-center text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const q = Math.max(1, Number(draftVal) || 1);
                        addFromSearch(r, q, true);
                      }}
                      className="h-8 rounded-lg bg-[#0d5c46] hover:bg-[#094735] px-2.5 text-xs text-white"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      যোগ
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cart / Bill Items */}
      <div className="mt-3 space-y-2.5 pb-28">
        {debounced.length === 0 && cart.length === 0 && (
          <PhoneEmpty
            title="বিলিং শুরু করুন"
            message="ওষুধের নাম লিখে খুঁজুন অথবা স্ক্যান বাটনে ক্লিক করে বক্স/স্ট্রিপ স্ক্যান করুন"
          />
        )}

        {cart.length > 0 && (
          <div className="flex items-center justify-between px-1 pt-1">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <ShoppingBag className="h-3.5 w-3.5 text-[#0d5c46]" />
              বিল তালিকা ({cart.length}টি পণ্য)
            </span>
            <span className="text-xs font-semibold text-slate-500">
              মোট {totalQty} পিস
            </span>
          </div>
        )}

        {cart.map((r) => {
          const mult = lineMult(r);
          const totalPcs = r.qty * mult;
          const unitPriceDisplay = Math.round(r.price * mult * 100) / 100;
          const units = getAvailableUnits(r.hasStrip, r.pcsPerBox);
          return (
          <div
            key={r.product_id}
            className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold leading-snug text-slate-900">{r.name}</p>
                <p className="text-[11px] text-slate-500">
                  {[r.form, r.strength].filter(Boolean).join(" · ") || "—"}
                  {" · "}
                  <span className={r.stock > 0 ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                    স্টক: {r.stock} পিস
                  </span>
                </p>
                {showCost && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    ক্রয়মূল্য: ৳{r.cost.toFixed(2)}/পিস · লাভ:{" "}
                    <span className="font-semibold text-emerald-700">
                      ৳{((r.price - r.cost) * totalPcs).toFixed(2)}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-extrabold text-slate-900">
                  ৳{(totalPcs * r.price).toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => updateCartQty(r.product_id, 0)}
                  className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 transition"
                  aria-label="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Unit Selector (Pc / Strip / Box) */}
            {units.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                  {units.map((u) => {
                    const active = r.unitMode === u;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => updateCartUnit(r.product_id, u)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-bold transition",
                          active ? "bg-[#0d5c46] text-white shadow-2xs" : "text-slate-600",
                        )}
                      >
                        {unitLabelBn(u)}
                      </button>
                    );
                  })}
                </div>
                {mult > 1 && (
                  <span className="text-[11px] font-medium text-slate-500">
                    {r.qty} {unitLabelBn(r.unitMode)} = {totalPcs} পিস
                  </span>
                )}
              </div>
            )}

            {/* Qty + Editable Sale Price Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 rounded-lg border-slate-200"
                  onClick={() => updateCartQty(r.product_id, r.qty - 1)}
                  aria-label="Decrease"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Input
                  type="number"
                  value={r.qty || ""}
                  onChange={(e) => updateCartQty(r.product_id, Math.max(0, Number(e.target.value) || 0))}
                  inputMode="numeric"
                  className="h-8 w-14 rounded-lg border-slate-200 text-center text-xs font-bold"
                />
                <Button
                  type="button"
                  size="icon"
                  className="h-8 w-8 rounded-lg bg-[#0d5c46] hover:bg-[#094735] text-white"
                  onClick={() => updateCartQty(r.product_id, r.qty + 1)}
                  aria-label="Increase"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Editable Sale Price (in active unit!) */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">
                  দর/{unitLabelBn(r.unitMode)} ৳
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={unitPriceDisplay}
                  onChange={(e) => {
                    const entered = Number(e.target.value);
                    updateCartPrice(r.product_id, mult > 0 ? entered / mult : entered);
                  }}
                  inputMode="decimal"
                  className="h-8 w-20 rounded-lg border-slate-200 bg-slate-50 text-right text-xs font-bold text-slate-900 focus:bg-white"
                  aria-label="Sale price"
                />
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Floating Billing Bar */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-2">
          <button
            type="button"
            onClick={() => setBillingOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-[#0d5c46] px-4 py-3 text-white shadow-lg active:scale-[0.98] transition"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white/20 px-2 text-xs font-extrabold">
                {totalQty}
              </span>
              <div className="text-left">
                <p className="text-sm font-bold leading-tight">বিল করুন</p>
                <p className="text-[10px] text-white/80">{cart.length}টি পণ্য</p>
              </div>
            </div>
            <span className="text-base font-extrabold">৳ {totalPrice.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* Camera Scanner Dialog */}
      <MobileCameraScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        tenantId={tenantId}
        onAddProduct={(p) => addFromSearch(p, 1, false)}
      />

      {/* Billing Sheet */}
      <BillingSheet
        open={billingOpen}
        onOpenChange={setBillingOpen}
        cart={cart}
        totalQty={totalQty}
        totalPrice={totalPrice}
        totalCost={totalCost}
        tenantId={tenantId}
        userId={user?.id ?? ""}
        registerId={register?.id ?? null}
        onDone={(saleId) => {
          setCart([]);
          setBillingOpen(false);
          if (saleId) void navigate({ to: "/m/invoice/$saleId", params: { saleId } });
        }}
        onContinue={() => {
          setCart([]);
          setBillingOpen(false);
        }}
      />
    </PhoneShell>
  );
}

type CustomerLite = {
  id: string;
  name: string;
  phone: string | null;
  due_balance?: number | null;
};

function BillingSheet({
  open,
  onOpenChange,
  cart,
  totalQty,
  totalPrice,
  totalCost,
  tenantId,
  userId,
  registerId,
  onDone,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cart: Line[];
  totalQty: number;
  totalPrice: number;
  totalCost: number;
  tenantId: string;
  userId: string;
  registerId: string | null;
  onDone: (saleId: string | null) => void;
  onContinue: () => void;
}) {
  const queryClient = useQueryClient();
  const createCustomerFn = useServerFn(createCustomer);
  const { memberships } = useAuth();
  const shopName = memberships.find((m) => m.tenant_id === tenantId)?.tenants?.name ?? "SohojPharma";

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLite | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [showAddCust, setShowAddCust] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [addingCust, setAddingCust] = useState(false);

  const [discountPercent, setDiscountPercent] = useState(true);
  const [discount, setDiscount] = useState("");
  const [commission, setCommission] = useState("");
  const [pay, setPay] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [doneSale, setDoneSale] = useState<{ id: string; invoice_no: string; share: ShareInvoicePayload } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const { data: customerList = [] } = useQuery({
    queryKey: ["m-pos-customers", tenantId, custQuery.trim()],
    enabled: open && !!tenantId && !selectedCustomer && !showAddCust && custQuery.trim().length > 0,
    queryFn: async (): Promise<CustomerLite[]> => {
      let q = supabase
        .from("customers")
        .select("id, name, phone, due_balance")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name")
        .limit(20);
      const term = custQuery.trim();
      if (term) {
        q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CustomerLite[];
    },
  });

  async function handleAddCustomer() {
    if (!newCustName.trim()) {
      toast.error("গ্রাহকের নাম লিখুন");
      return;
    }
    if (!newCustPhone.trim()) {
      toast.error("ফোন নম্বর লিখুন");
      return;
    }
    setAddingCust(true);
    try {
      const created = await createCustomerFn({
        data: {
          tenantId,
          name: newCustName.trim(),
          phone: newCustPhone.trim(),
          address: newCustAddress.trim() || null,
        },
      });
      const cust: CustomerLite = {
        id: (created as any).id,
        name: (created as any).name ?? newCustName.trim(),
        phone: (created as any).phone ?? newCustPhone.trim(),
        due_balance: 0,
      };
      setSelectedCustomer(cust);
      setShowAddCust(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustAddress("");
      setCustQuery("");
      queryClient.invalidateQueries({ queryKey: ["m-pos-customers"] });
      toast.success(`গ্রাহক যোগ হয়েছে: ${cust.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "গ্রাহক যোগ করতে সমস্যা হয়েছে");
    } finally {
      setAddingCust(false);
    }
  }

  const discountAmount = discountPercent
    ? (totalPrice * (Number(discount) || 0)) / 100
    : Number(discount) || 0;
  const commissionAmount = (totalPrice * (Number(commission) || 0)) / 100;
  const finalPrice = Math.max(0, Math.round((totalPrice - discountAmount) * 100) / 100);
  const paid = pay === "" ? finalPrice : Math.max(0, Number(pay) || 0);
  const due = Math.max(0, Math.round((finalPrice - paid) * 100) / 100);
  const profit = finalPrice - totalCost - commissionAmount;

  useEffect(() => {
    if (open) setPay(String(Math.round(finalPrice)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, finalPrice]);

  async function submit() {
    if (!tenantId || !userId) return;
    if (!registerId) {
      toast.error("প্রথমে ক্যাশ রেজিস্টার ওপেন করুন");
      return;
    }
    setSaving(true);
    try {
      const items = cart.map((l) => {
        const mult = getUnitMultiplier(l.unitMode, l.pcsPerStrip, l.pcsPerBox);
        const pcsQty = l.qty * mult;
        return {
          product_id: l.product_id,
          qty: pcsQty,
          unit_price: l.price,
          discount: 0,
          vat: Math.round(pcsQty * l.price * (l.vat_rate / 100) * 100) / 100,
          allow_stock_override: true,
        };
      });
      const payments: Array<{ method: string; amount: number }> = [];
      if (paid > 0) payments.push({ method, amount: Math.min(paid, finalPrice) });
      if (due > 0) payments.push({ method: "due", amount: due });

      const { data, error } = await supabase.rpc("pos_checkout", {
        _tenant_id: tenantId,
        _customer_id: (selectedCustomer?.id ?? null) as unknown as string,
        _cashier_id: userId,
        _invoice_no: null as unknown as string,
        _discount: discountAmount,
        _notes: note || undefined,
        _client_op_id: crypto.randomUUID(),
        _items: items as never,
        _payments: payments as never,
        _register_id: registerId,
        _warehouse_id: null,
      } as never);
      if (error) throw new Error(error.message);
      const sale = data as unknown as { id: string; invoice_no: string };
      const itemsSummary = cart.map((l) => `${l.name} (${l.qty})`).join(", ");
      setDoneSale({
        id: sale.id,
        invoice_no: sale.invoice_no,
        share: {
          invoiceNo: sale.invoice_no,
          shopName,
          itemsSummary,
          total: finalPrice,
          paid,
          due,
          customerName: selectedCustomer?.name ?? null,
          customerPhone: selectedCustomer?.phone ?? null,
        },
      });
      setSelectedCustomer(null);
      setCustQuery("");
      toast.success(`বিক্রি সম্পন্ন — ${sale.invoice_no}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "বিক্রি সম্পন্ন করতে সমস্যা হয়েছে");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-center text-lg font-bold">বিলিং সামারি</SheetTitle>
          </SheetHeader>

          <div className="space-y-3.5 border-t border-border pt-4">
            {/* Customer Select / Quick Add */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <UserRound className="h-3.5 w-3.5 text-[#0d5c46]" />
                  গ্রাহক (Customer)
                </span>
                {!selectedCustomer && (
                  <button
                    type="button"
                    onClick={() => setShowAddCust((v) => !v)}
                    className="flex items-center gap-1 rounded-lg bg-[#0d5c46] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#094735]"
                  >
                    <UserPlus className="h-3 w-3" />
                    {showAddCust ? "তালিকা দেখুন" : "+ নতুন গ্রাহক"}
                  </button>
                )}
              </div>

              {selectedCustomer ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{selectedCustomer.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {selectedCustomer.phone || "ফোন নেই"}
                      {Number(selectedCustomer.due_balance ?? 0) > 0 &&
                        ` · পূর্বের বাকি: ৳${Number(selectedCustomer.due_balance).toFixed(0)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="rounded-full p-1 text-slate-500 hover:bg-white"
                    aria-label="Clear customer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : showAddCust ? (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
                  <Input
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    placeholder="গ্রাহকের নাম *"
                    className="h-9 text-xs"
                  />
                  <Input
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="ফোন নম্বর *"
                    inputMode="tel"
                    className="h-9 text-xs"
                  />
                  <Input
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    placeholder="ঠিকানা (ঐচ্ছিক)"
                    className="h-9 text-xs"
                  />
                  <Button
                    type="button"
                    onClick={() => void handleAddCustomer()}
                    disabled={addingCust}
                    className="h-9 w-full rounded-lg bg-[#0d5c46] hover:bg-[#094735] text-xs font-semibold text-white"
                  >
                    {addingCust ? "সেভ হচ্ছে..." : "সেভ ও সিলেক্ট করুন"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Input
                    value={custQuery}
                    onChange={(e) => setCustQuery(e.target.value)}
                    placeholder="নাম বা ফোন দিয়ে খুঁজুন (ঐচ্ছিক — সাধারণ গ্রাহক)..."
                    className="h-9 bg-white text-xs"
                  />
                  {custQuery.trim().length > 0 && customerList.length > 0 ? (
                    <div className="max-h-28 overflow-y-auto space-y-1 rounded-lg border border-slate-200 bg-white p-1">
                      {customerList.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustQuery("");
                          }}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-emerald-50"
                        >
                          <span className="font-semibold text-slate-900 truncate">{c.name}</span>
                          <span className="shrink-0 text-[11px] text-slate-500">{c.phone || ""}</span>
                        </button>
                      ))}
                    </div>
                  ) : custQuery.trim().length > 0 ? (
                    <p className="px-2 py-1 text-[11px] text-slate-500">
                      "{custQuery.trim()}" নামে কোনো গ্রাহক পাওয়া যায়নি
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                মোট পরিমাণ: <span className="font-bold text-foreground">{totalQty} পিস</span>
              </span>
              <span className="text-muted-foreground">
                সাবটোটাল: <span className="font-bold text-foreground">{money(totalPrice)}</span>
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-sm text-muted-foreground">ডিসকাউন্ট</span>
                <button
                  type="button"
                  onClick={() => setDiscountPercent((v) => !v)}
                  className="flex h-8 w-20 items-center rounded-full bg-[#0d5c46] px-1 text-white"
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-full bg-white transition-transform",
                      !discountPercent && "translate-x-10",
                    )}
                  />
                  <span className="flex-1 text-center text-xs font-bold">
                    {discountPercent ? "%" : "৳"}
                  </span>
                </button>
              </div>
              <Input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="h-10 w-28 rounded-xl text-right"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">কার্ড কমিশন (%)</span>
              <Input
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                className="h-10 w-28 rounded-xl text-right"
              />
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">সর্বমোট বিল</span>
                <span className="text-lg font-extrabold text-[#0d5c46]">{money(finalPrice)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">আনুমানিক লাভ</span>
                <span className={cn("font-bold", profit >= 0 ? "text-emerald-700" : "text-rose-600")}>
                  {money(profit)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">গ্রাহক পরিশোধ করছে</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPay(String(Math.round(finalPrice)))}
                    className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                  >
                    পুরো টাকা
                  </button>
                  <button
                    type="button"
                    onClick={() => setPay("0")}
                    className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                  >
                    বাকি (৳0)
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  value={pay}
                  onChange={(e) => setPay(e.target.value)}
                  inputMode="decimal"
                  className="h-11 flex-1 rounded-xl text-right text-base font-bold"
                />
                {due > 0 && (
                  <span className="shrink-0 text-xs font-bold text-amber-700">
                    বাকি: {money(due)}
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">পেমেন্ট মাধ্যম</p>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">নগদ (CASH)</SelectItem>
                  <SelectItem value="mobile">মোবাইল ব্যাংকিং (bKash/Nagad)</SelectItem>
                  <SelectItem value="card">কার্ড (CARD)</SelectItem>
                  <SelectItem value="bank">ব্যাংক (BANK)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">নোট (ঐচ্ছিক)</p>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="প্রয়োজনীয় নোট লিখুন..."
                className="h-10 rounded-xl"
              />
            </div>

            <Button
              className="h-12 w-full rounded-2xl bg-[#0d5c46] hover:bg-[#094735] text-base font-bold text-white"
              disabled={saving || cart.length === 0}
              onClick={() => void submit()}
            >
              {saving ? "সেভ হচ্ছে..." : "বিক্রি সম্পন্ন করুন"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!doneSale} onOpenChange={(v) => !v && setDoneSale(null)}>
        <DialogContent className="max-w-xs rounded-3xl">
          <div className="text-center space-y-1 pb-1">
            <p className="text-base font-bold text-slate-900">বিক্রি সম্পন্ন হয়েছে!</p>
            <p className="text-xs text-slate-500">ইনভয়েস: {doneSale?.invoice_no}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setShareOpen(true)}
            >
              শেয়ার (SMS / WhatsApp)
            </Button>
            <Button
              className="rounded-full bg-[#0d5c46] hover:bg-[#094735]"
              onClick={() => {
                const id = doneSale?.id ?? null;
                setDoneSale(null);
                onDone(id);
              }}
            >
              প্রিন্ট / দেখুন
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-full text-[#0d5c46]"
              onClick={() => {
                setDoneSale(null);
                onContinue();
              }}
            >
              নতুন বিক্রি শুরু করুন
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <InvoiceShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        tenantId={tenantId}
        invoice={doneSale?.share ?? null}
      />
    </>
  );
}
