import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Search, Trash2, Plus, Minus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneCard, PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { buildProductDisplayName } from "@/lib/product-display";
import { createPurchaseOrder, receivePurchaseOrder, updatePOStatus } from "@/lib/api/procurement.functions";
import { recordSupplierPayment } from "@/lib/api/supplier-ledger.functions";

export const Route = createFileRoute("/m/purchase")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "New Purchase — Pharmacy Phone App" },
      { name: "description", content: "Record supplier purchases and receive stock from your phone." },
      { property: "og:title", content: "New Purchase — Pharmacy Phone App" },
      { property: "og:description", content: "Add purchase invoices, batches and expiry from your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobilePurchase,
});

type SearchRow = {
  id: string; name: string; sku: string | null; barcode: string | null;
  purchase_price: number | string; retail_price: number | string;
  qty_on_hand: number | string | null;
  strength: string | null; medicine_type: string | null; volume: string | null; pack_size: number | null;
};

type Line = {
  uid: string;
  productId: string;
  name: string;
  batch_no: string;
  expiry_date: string;
  purchase_price: number;
  sale_price: number;
  qty: number;
  bonus: number;
  discount: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: string) => (v === "" ? 0 : Number(v) || 0);

function MobilePurchase() {
  const { i18n } = useTranslation();
  const isBn = i18n.language !== "en";
  const tr = (bn: string, en: string) => (isBn ? bn : en);

  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createPO = useServerFn(createPurchaseOrder);
  const receivePO = useServerFn(receivePurchaseOrder);
  const updateStatus = useServerFn(updatePOStatus);
  const payPO = useServerFn(recordSupplierPayment);

  const [supplierId, setSupplierId] = useState("");
  const [addSupOpen, setAddSupOpen] = useState(false);
  const [supForm, setSupForm] = useState({ name: "", phone: "", address: "" });
  const [invoiceNo, setInvoiceNo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paid, setPaid] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [saving, setSaving] = useState(false);

  const addSupplierMut = useMutation({
    mutationFn: async () => {
      if (!supForm.name.trim()) throw new Error(tr("সরবরাহকারীর নাম আবশ্যক", "Supplier name is required"));
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          tenant_id: tenantId,
          name: supForm.name.trim(),
          phone: supForm.phone.trim() || null,
          address: supForm.address.trim() || null,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success(tr("নতুন সরবরাহকারী যোগ হয়েছে", "Supplier added"));
      qc.invalidateQueries({ queryKey: ["suppliers-active", tenantId] });
      setSupplierId(id);
      setSupForm({ name: "", phone: "", address: "" });
      setAddSupOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-active", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name,phone,due_balance")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const supplier = suppliers.find((s) => s.id === supplierId) ?? null;

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["m-purchase-search", tenantId, debounced],
    enabled: !!tenantId && debounced.length >= 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_products" as never, {
        _tenant_id: tenantId, _query: debounced, _branch_id: null, _limit: 15,
      } as never);
      if (error) throw error;
      return (data ?? []) as SearchRow[];
    },
  });

  function addProduct(p: SearchRow) {
    setLines((prev) => [
      ...prev,
      {
        uid: `${p.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: p.id,
        name: buildProductDisplayName(p),
        batch_no: "",
        expiry_date: "",
        purchase_price: Number(p.purchase_price ?? 0),
        sale_price: Number(p.retail_price ?? 0),
        qty: 1,
        bonus: 0,
        discount: 0,
      },
    ]);
    setQuery("");
  }

  const update = (uid: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const remove = (uid: string) => setLines((ls) => ls.filter((l) => l.uid !== uid));

  const grandTotal = lines.reduce((s, l) => s + Math.max(0, l.qty * l.purchase_price - l.discount), 0);
  const due = Math.max(0, grandTotal - paid);

  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!supplierId) errs.push(tr("সরবরাহকারী নির্বাচন করুন", "Select a supplier"));
    if (!lines.length) errs.push(tr("অন্তত একটি পণ্য যোগ করুন", "Add at least one product"));
    const t = today();
    lines.forEach((l, i) => {
      if (!l.batch_no.trim()) errs.push(tr(`সারি ${i + 1}: ব্যাচ নম্বর দিন`, `Row ${i + 1}: batch number required`));
      if (!l.expiry_date) errs.push(tr(`সারি ${i + 1}: মেয়াদ দিন`, `Row ${i + 1}: expiry date required`));
      else if (l.expiry_date <= t) errs.push(tr(`সারি ${i + 1}: মেয়াদ ভবিষ্যতের হতে হবে`, `Row ${i + 1}: expiry must be in the future`));
      if (l.qty <= 0) errs.push(tr(`সারি ${i + 1}: পরিমাণ ০-এর বেশি হতে হবে`, `Row ${i + 1}: quantity must be > 0`));
      if (l.purchase_price <= 0) errs.push(tr(`সারি ${i + 1}: ক্রয়মূল্য ০-এর বেশি হতে হবে`, `Row ${i + 1}: purchase price must be > 0`));
      if (l.sale_price < l.purchase_price) errs.push(tr(`সারি ${i + 1}: বিক্রয়মূল্য ক্রয়মূল্যের সমান বা বেশি হতে হবে`, `Row ${i + 1}: sale price must be ≥ purchase price`));
    });
    return errs;
  }, [supplierId, lines, isBn]);

  async function handleSave() {
    if (errors.length || !tenantId) return toast.error(errors[0] ?? "Cannot save");
    if (!branchId) return toast.error("Please select a branch first");
    setSaving(true);
    try {
      const { id: poId } = await createPO({
        data: {
          tenantId,
          branch_id: branchId,
          supplier_id: supplierId,
          expected_delivery_date: dueDate || undefined,
          notes: invoiceNo ? `Invoice: ${invoiceNo}` : undefined,
          items: lines.map((l) => ({
            product_id: l.productId,
            qty_ordered: l.qty + l.bonus,
            unit_cost: l.purchase_price,
            discount: l.discount + l.bonus * l.purchase_price,
            vat: 0,
            notes: l.bonus > 0 ? `Bonus: ${l.bonus}` : undefined,
          })),
        },
      });
      await updateStatus({ data: { id: poId, branch_id: branchId, action: "approve" } });

      const { data: items, error: itErr } = await supabase
        .from("purchase_order_items")
        .select("id,product_id")
        .eq("purchase_order_id", poId);
      if (itErr) throw new Error(itErr.message);

      const used = new Set<string>();
      const recvLines = lines.map((l) => {
        const match = (items ?? []).find((it) => it.product_id === l.productId && !used.has(it.id));
        if (!match) throw new Error(`Could not link product ${l.name}`);
        used.add(match.id);
        return { item_id: match.id, qty: l.qty + l.bonus, batch_no: l.batch_no.trim(), expiry_date: l.expiry_date };
      });
      await receivePO({ data: { id: poId, branch_id: branchId, lines: recvLines } });

      if (paid > 0) {
        await payPO({
          data: {
            tenantId, branch_id: branchId, supplierId, amount: paid, method: "cash",
            reference: invoiceNo || undefined, notes: `Payment on PO ${poId}`,
          },
        });
      }

      toast.success("Purchase saved — stock & ledger updated");
      setLines([]); setPaid(0); setInvoiceNo("");
      navigate({ to: "/m/purchases" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PhoneShell title={tr("নতুন ক্রয়", "New Purchase")} back>
      <PhoneKpiGrid>
        <PhoneKpi tone="sky" accent="info" value={money(grandTotal)} label={tr("মোট বিল", "Grand Total")} />
        <PhoneKpi tone="rose" accent="danger" value={money(due)} label={tr("বাকি", "Due")} />
      </PhoneKpiGrid>

      <PhoneCard className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>{tr("সরবরাহকারী *", "Supplier *")}</Label>
            <button
              type="button"
              onClick={() => setAddSupOpen(true)}
              className="flex items-center gap-1 rounded-lg bg-[#0d5c46] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#094735]"
            >
              <UserPlus className="h-3 w-3" />
              {tr("+ নতুন সরবরাহকারী", "+ Add Supplier")}
            </button>
          </div>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="h-11">
              <SelectValue
                placeholder={
                  suppliers.length
                    ? tr("সরবরাহকারী নির্বাচন করুন", "Select supplier")
                    : tr("কোনো সরবরাহকারী নেই — নতুন যোগ করুন", "No suppliers yet — add one")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {supplier && (
            <p className="text-xs text-muted-foreground">
              {tr("বাকি", "Due")}: {money(Number(supplier.due_balance ?? 0))}
              {supplier.phone ? ` · ${supplier.phone}` : ""}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{tr("ইনভয়েস নং", "Invoice no.")}</Label>
            <Input className="h-11" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-1024" />
          </div>
          <div className="space-y-1.5">
            <Label>{tr("পরিশোধের তারিখ", "Due date")}</Label>
            <Input className="h-11" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </PhoneCard>

      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-card px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("পণ্য যোগ করতে খুঁজুন…", "Search product to add…")}
          className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {debounced.length >= 1 && (
        <div className="mt-2 space-y-2">
          {isFetching && <p className="text-center text-sm text-muted-foreground">{tr("খোঁজা হচ্ছে…", "Searching…")}</p>}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addProduct(p)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3 py-3 text-left active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{buildProductDisplayName(p)}</span>
                <span className="block text-xs text-muted-foreground">
                  {tr("স্টক", "Stock")} {Number(p.qty_on_hand ?? 0)} · {tr("ক্রয়", "Cost")} {money(Number(p.purchase_price ?? 0))}
                </span>
              </span>
              <Plus className="h-5 w-5 shrink-0 text-primary" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-3 pb-28">
        {lines.length === 0 && (
          <PhoneEmpty
            title={tr("ক্রয় শুরু করুন", "Start Purchase")}
            message={tr("এই ক্রয়ে যোগ করতে ওপরের বক্সে পণ্য খুঁজুন", "Search and add products to this purchase")}
          />
        )}
        {lines.map((l, idx) => (
          <PhoneCard key={l.uid} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-bold text-foreground">{idx + 1}. {l.name}</p>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive" onClick={() => remove(l.uid)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{tr("ব্যাচ *", "Batch *")}</Label>
                <Input className="h-11" value={l.batch_no} onChange={(e) => update(l.uid, { batch_no: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tr("মেয়াদ *", "Expiry *")}</Label>
                <Input className="h-11" type="date" value={l.expiry_date} onChange={(e) => update(l.uid, { expiry_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tr("ক্রয়মূল্য", "Cost")}</Label>
                <Input className="h-11" type="number" inputMode="decimal" value={l.purchase_price} onChange={(e) => update(l.uid, { purchase_price: num(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tr("বিক্রয়মূল্য (MRP)", "MRP")}</Label>
                <Input className="h-11" type="number" inputMode="decimal" value={l.sale_price} onChange={(e) => update(l.uid, { sale_price: num(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tr("বোনাস", "Bonus")}</Label>
                <Input className="h-11" type="number" inputMode="numeric" value={l.bonus} onChange={(e) => update(l.uid, { bonus: num(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{tr("ডিসকাউন্ট", "Discount")}</Label>
                <Input className="h-11" type="number" inputMode="decimal" value={l.discount} onChange={(e) => update(l.uid, { discount: num(e.target.value) })} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" className="h-10 w-10" onClick={() => update(l.uid, { qty: Math.max(1, l.qty - 1) })}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  className="h-10 w-16 text-center"
                  type="number"
                  inputMode="numeric"
                  value={l.qty}
                  onChange={(e) => update(l.uid, { qty: Math.max(0, num(e.target.value)) })}
                />
                <Button size="icon" variant="outline" className="h-10 w-10" onClick={() => update(l.uid, { qty: l.qty + 1 })}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="font-extrabold text-primary">
                {money(Math.max(0, l.qty * l.purchase_price - l.discount))}
              </p>
            </div>
          </PhoneCard>
        ))}

        {lines.length > 0 && (
          <PhoneCard className="space-y-2">
            <Label className="text-xs">{tr("নগদ পরিশোধ", "Paid now")}</Label>
            <Input className="h-11" type="number" inputMode="decimal" value={paid} onChange={(e) => setPaid(num(e.target.value))} />
            {errors.length > 0 && <p className="text-xs text-destructive">{errors[0]}</p>}
          </PhoneCard>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-md px-4">
        <Button
          className="h-12 w-full rounded-2xl text-base font-bold bg-[#0d5c46] hover:bg-[#094735] text-white"
          disabled={saving || !!errors.length}
          onClick={handleSave}
        >
          {saving ? tr("সেভ হচ্ছে…", "Saving…") : `${tr("সেভ ও রিসিভ করুন", "Save & receive")} · ${money(grandTotal)}`}
        </Button>
      </div>

      <Dialog open={addSupOpen} onOpenChange={setAddSupOpen}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>{tr("নতুন সরবরাহকারী যোগ করুন", "Add New Supplier")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">{tr("নাম *", "Name *")}</Label>
              <Input
                value={supForm.name}
                onChange={(e) => setSupForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={tr("সরবরাহকারীর নাম", "Supplier name")}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{tr("ফোন নম্বর", "Phone")}</Label>
              <Input
                value={supForm.phone}
                onChange={(e) => setSupForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="01XXXXXXXXX"
                inputMode="tel"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{tr("ঠিকানা", "Address")}</Label>
              <Input
                value={supForm.address}
                onChange={(e) => setSupForm((p) => ({ ...p, address: e.target.value }))}
                placeholder={tr("ঠিকানা (ঐচ্ছিক)", "Address (optional)")}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setAddSupOpen(false)}>
              {tr("বাতিল", "Cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => addSupplierMut.mutate()}
              disabled={addSupplierMut.isPending}
              className="bg-[#0d5c46] hover:bg-[#094735] text-white"
            >
              {addSupplierMut.isPending ? tr("সেভ হচ্ছে…", "Saving…") : tr("সেভ করুন", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PhoneShell>
  );
}
