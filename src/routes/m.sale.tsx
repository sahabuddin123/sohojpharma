import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Minus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneChip, PhoneChipRow, PhoneEmpty, money } from "@/components/mobile/phone-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveRegister } from "@/hooks/use-active-register";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/sale")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Sale — Pharmacy Phone App" },
      { name: "description", content: "Fast mobile billing: search medicine, add quantity and complete the sale." },
      { property: "og:title", content: "Sale — Pharmacy Phone App" },
      { property: "og:description", content: "Fast mobile billing built for the counter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  price: number;
  vat_rate: number;
  stock: number;
  qty: number;
};

function MobileSale() {
  const { currentTenantId, user } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { data: register } = useActiveRegister();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showCost, setShowCost] = useState(false);
  const [cart, setCart] = useState<Line[]>([]);
  const [billingOpen, setBillingOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
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
        _limit: 40,
        _warehouse_id: null,
        _offset: 0,
      } as never);
      if (error) throw error;
      return ((data ?? []) as SearchRow[]).map((p) => ({
        product_id: p.id,
        name: p.name,
        form: p.medicine_type,
        strength: p.strength,
        cost: Number(p.purchase_price ?? 0),
        price: Number(p.effective_price ?? p.retail_price ?? 0),
        vat_rate: Number(p.vat_rate ?? 0),
        stock: Number(p.qty_on_hand ?? 0),
        qty: 0,
      }));
    },
  });

  const rows = useMemo(() => {
    const byId = new Map(cart.map((l) => [l.product_id, l]));
    const listed = results.map((r) => byId.get(r.product_id) ?? r);
    const extra = cart.filter((l) => !results.some((r) => r.product_id === l.product_id));
    return [...extra, ...listed];
  }, [results, cart]);

  function setQty(line: Line, qty: number) {
    setCart((prev) => {
      const next = prev.filter((l) => l.product_id !== line.product_id);
      if (qty > 0) next.push({ ...line, qty });
      return next;
    });
  }

  const totalQty = cart.reduce((s, l) => s + l.qty, 0);
  const totalPrice = cart.reduce((s, l) => s + l.qty * l.price, 0);
  const totalCost = cart.reduce((s, l) => s + l.qty * l.cost, 0);

  return (
    <PhoneShell title="Sale" back>
      <PhoneChipRow>
        <PhoneChip active onClick={() => setQuery("")}>Product name</PhoneChip>
        <PhoneChip active={showCost} onClick={() => setShowCost((v) => !v)}>
          {showCost ? "Hide cost" : "Show cost"}
        </PhoneChip>
        <PhoneChip onClick={() => setCart([])}>Clear all</PhoneChip>
      </PhoneChipRow>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search product name"
          className="h-12 rounded-xl pl-10"
          inputMode="search"
        />
      </div>

      <div className="mt-3 space-y-2 pb-28">
        {debounced.length === 0 && cart.length === 0 && (
          <PhoneEmpty title="Start billing" message="Search a medicine name to add it to the bill" />
        )}
        {isFetching && rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Searching…</p>
        )}
        {rows.map((r) => {
          const inCart = r.qty > 0;
          return (
            <div
              key={r.product_id}
              className={cn(
                "rounded-2xl border p-3",
                inCart ? "border-primary bg-primary/5" : "border-border bg-card",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold leading-tight text-foreground">{r.name}</p>
                  <p className="text-xs uppercase text-muted-foreground">
                    {[r.form, r.strength].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className={cn("mt-1 text-xs font-medium", r.stock > 0 ? "text-success" : "text-destructive")}>
                    Stk : {r.stock} pcs
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-extrabold text-foreground">{r.price.toFixed(2)}</p>
                  {showCost && (
                    <p className="text-xs text-muted-foreground">
                      <Eye className="mr-1 inline h-3 w-3" />
                      {r.cost.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 rounded-full"
                    onClick={() => setQty(r, Math.max(0, r.qty - 1))}
                    aria-label="Decrease"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    value={r.qty || ""}
                    onChange={(e) => setQty(r, Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    inputMode="numeric"
                    className="h-9 w-16 rounded-xl text-center"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => setQty(r, r.qty + 1)}
                    aria-label="Increase"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-foreground">
                    {(r.qty * r.price).toFixed(2)}
                  </span>
                  {inCart && (
                    <button
                      type="button"
                      onClick={() => setQty(r, 0)}
                      className="text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-2">
          <button
            type="button"
            onClick={() => setBillingOpen(true)}
            className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-lg"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full border border-primary-foreground/60 text-sm font-bold">
              {totalQty}
            </span>
            <span className="text-base font-bold">Billing</span>
            <span className="text-base font-bold">Tk {totalPrice.toFixed(2)}</span>
          </button>
        </div>
      )}

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
  const [discountPercent, setDiscountPercent] = useState(true);
  const [discount, setDiscount] = useState("");
  const [commission, setCommission] = useState("");
  const [pay, setPay] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [cashReceived, setCashReceived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneSale, setDoneSale] = useState<{ id: string; invoice_no: string } | null>(null);

  const discountAmount = discountPercent
    ? (totalPrice * (Number(discount) || 0)) / 100
    : Number(discount) || 0;
  const commissionAmount = (totalPrice * (Number(commission) || 0)) / 100;
  const finalPrice = Math.max(0, Math.round((totalPrice - discountAmount) * 100) / 100);
  const paid = pay === "" ? finalPrice : Number(pay) || 0;
  const profit = finalPrice - totalCost - commissionAmount;

  useEffect(() => {
    if (open) setPay(String(Math.round(finalPrice)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    if (!tenantId || !userId) return;
    if (!registerId) {
      toast.error("Open a cash register first");
      return;
    }
    setSaving(true);
    try {
      const items = cart.map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        unit_price: l.price,
        discount: 0,
        vat: Math.round(l.qty * l.price * (l.vat_rate / 100) * 100) / 100,
        allow_stock_override: true,
      }));
      const payments: Array<{ method: string; amount: number }> = [];
      if (paid > 0) payments.push({ method, amount: Math.min(paid, finalPrice) });
      const due = Math.max(0, Math.round((finalPrice - paid) * 100) / 100);
      if (due > 0) payments.push({ method: "due", amount: due });

      const { data, error } = await supabase.rpc("pos_checkout", {
        _tenant_id: tenantId,
        _customer_id: null as unknown as string,
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
      setDoneSale({ id: sale.id, invoice_no: sale.invoice_no });
      toast.success(`Sale complete — ${sale.invoice_no}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sale failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-center text-xl">Billing</SheetTitle>
          </SheetHeader>

          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Total Qty <span className="font-bold text-foreground">{totalQty}</span>
              </span>
              <span className="text-muted-foreground">
                Total price: <span className="font-bold text-foreground">{money(totalPrice)}</span>
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Discount :</span>
                <button
                  type="button"
                  onClick={() => setDiscountPercent((v) => !v)}
                  className="flex h-9 w-24 items-center rounded-full bg-primary px-1 text-primary-foreground"
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-full bg-card transition-transform",
                      !discountPercent && "translate-x-[3.25rem]",
                    )}
                  />
                  <span className="flex-1 text-center text-sm font-semibold">
                    {discountPercent ? "%" : "৳"}
                  </span>
                </button>
              </div>
              <Input
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                inputMode="decimal"
                className="h-11 w-32 rounded-xl text-right"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Card Commission ( % )</span>
              <Input
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                inputMode="decimal"
                className="h-11 w-32 rounded-xl text-right"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-primary">Final price</span>
              <span className="text-lg font-extrabold text-primary">{money(finalPrice)}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Customer will pay</span>
              <Input
                value={pay}
                onChange={(e) => setPay(e.target.value)}
                inputMode="decimal"
                className="h-11 w-32 rounded-xl text-right"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="font-semibold text-success">Profit</span>
              <span className="text-lg font-extrabold text-success">{money(profit)}</span>
            </div>

            <div>
              <p className="mb-1 text-sm text-muted-foreground">Payment type</p>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">CASH</SelectItem>
                  <SelectItem value="card">CARD</SelectItem>
                  <SelectItem value="mobile">MOBILE BANKING</SelectItem>
                  <SelectItem value="bank">BANK</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1 text-sm text-muted-foreground">Note</p>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note"
                className="h-11 rounded-xl"
              />
            </div>

            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={cashReceived} onCheckedChange={(v) => setCashReceived(!!v)} />
              Cash received
            </label>

            <Button
              className="h-14 w-full rounded-full text-base font-bold"
              disabled={saving || cart.length === 0}
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : "Sale"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!doneSale} onOpenChange={(v) => !v && setDoneSale(null)}>
        <DialogContent className="max-w-xs rounded-3xl">
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              className="rounded-full bg-success text-success-foreground hover:bg-success/90"
              onClick={async () => {
                const text = `Invoice ${doneSale?.invoice_no} — ${money(finalPrice)}`;
                if (navigator.share) await navigator.share({ title: "Invoice", text }).catch(() => {});
                else {
                  await navigator.clipboard.writeText(text);
                  toast.success("Invoice copied");
                }
              }}
            >
              Share invoice
            </Button>
            <Button
              className="rounded-full"
              onClick={() => {
                const id = doneSale?.id ?? null;
                setDoneSale(null);
                onDone(id);
              }}
            >
              Print
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-full text-primary"
              onClick={() => {
                setDoneSale(null);
                onContinue();
              }}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
