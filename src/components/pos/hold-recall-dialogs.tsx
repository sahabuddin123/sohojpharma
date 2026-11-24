import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, PlayCircle, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "react-i18next";

export type HoldCartPayload = {
  items: Array<Record<string, unknown>>;
  customer_id: string | null;
  discount: number;
  invoice_discount?: number;
  invoice_discount_type?: "amount" | "percent";
  invoice_tax?: number;
  invoice_tax_type?: "amount" | "percent";
  override_stock?: boolean;
  notes: string;
  payments: Array<Record<string, unknown>>;
};

function suggestHoldName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `HOLD-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function HoldSaleDialog({
  open, onOpenChange, tenantId, payload, onHeld,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  payload: HoldCartPayload;
  onHeld: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [label, setLabel] = useState(suggestHoldName());
  const [notes, setNotes] = useState("");

  useEffect(() => { if (open) { setLabel(suggestHoldName()); setNotes(payload.notes || ""); } }, [open, payload.notes]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error(t("toast.noTenant"));
      if (!payload.items.length) throw new Error(t("toast.cartIsEmpty"));
      const cart = { ...payload, notes };
      const { data, error } = await supabase
        .from("held_sales")
        .insert({
          tenant_id: tenantId,
          customer_id: payload.customer_id,
          label,
          cart,
          held_by: user?.id ?? null,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await supabase.rpc("audit_log_event", {
        _tenant_id: tenantId,
        _action: "hold_sale.created",
        _entity_table: "held_sales",
        _entity_id: (data as { id: string }).id,
        _after: { label, items: payload.items.length } as never,
      });
    },
    onSuccess: () => {
      toast.success(t("toast.saleHeld"));
      qc.invalidateQueries({ queryKey: ["held-sales"] });
      onHeld();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("dialog.holdSale")}</DialogTitle>
          <DialogDescription>{t("ipos.holdDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{t("ipos.holdNameLbl")}</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{t("ipos.notesLbl")}</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("ipos.optional")} />
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {t("ipos.itemsSummary", { n: payload.items.length, amt: payload.discount.toFixed(2) })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("ipos.cancelBtn")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !label.trim()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("ipos.holdSaleBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type HeldRow = {
  id: string;
  label: string | null;
  customer_id: string | null;
  cart: HoldCartPayload;
  held_by: string | null;
  created_at: string;
  customer?: { name: string } | null;
  cashier?: { full_name: string | null } | null;
};

export function RecallSaleDialog({
  open, onOpenChange, tenantId, onResume,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  onResume: (row: HeldRow) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: holds = [], isFetching } = useQuery({
    queryKey: ["held-sales", tenantId],
    enabled: open && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("held_sales")
        .select("id,label,customer_id,cart,held_by,created_at,customer:customers(name),cashier:profiles!held_sales_held_by_fkey(full_name)")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .is("resumed_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        // Fallback without joins if FK aliases not present
        const { data: d2, error: e2 } = await supabase
          .from("held_sales").select("id,label,customer_id,cart,held_by,created_at")
          .eq("tenant_id", tenantId).is("deleted_at", null).is("resumed_at", null)
          .order("created_at", { ascending: false }).limit(200);
        if (e2) throw new Error(e2.message);
        return (d2 ?? []) as unknown as HeldRow[];
      }
      return (data ?? []) as unknown as HeldRow[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return holds;
    return holds.filter((h) =>
      (h.label ?? "").toLowerCase().includes(term) ||
      (h.customer?.name ?? "").toLowerCase().includes(term) ||
      (h.cashier?.full_name ?? "").toLowerCase().includes(term),
    );
  }, [holds, q]);

  const resume = useMutation({
    mutationFn: async (row: HeldRow) => {
      const { error } = await supabase
        .from("held_sales")
        .update({ resumed_at: new Date().toISOString() } as never)
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      await supabase.rpc("audit_log_event", {
        _tenant_id: tenantId, _action: "hold_sale.resumed",
        _entity_table: "held_sales", _entity_id: row.id,
      });
      return row;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["held-sales"] });
      onResume(row);
      onOpenChange(false);
      toast.success(t("toast.resumedHold", { name: row.label ?? "hold" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (row: HeldRow) => {
      if (!window.confirm(t("ipos.deleteHoldConfirm", { name: row.label ?? "" }))) {
        throw new Error("cancelled");
      }
      const { error } = await supabase
        .from("held_sales")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      await supabase.rpc("audit_log_event", {
        _tenant_id: tenantId, _action: "hold_sale.deleted",
        _entity_table: "held_sales", _entity_id: row.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["held-sales"] });
      toast.success(t("toast.holdDeleted"));
    },
    onError: (e: Error) => { if (e.message !== "cancelled") toast.error(e.message); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("dialog.recallHeldSales")}</DialogTitle>
          <DialogDescription>{t("ipos.recallDesc")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t("ipos.recallSearchPh")} className="pl-9" autoFocus />
        </div>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase">
              <tr>
                <th className="px-3 py-2 text-left">{t("ipos.thHold")}</th>
                <th className="px-3 py-2 text-left">{t("ipos.thCustomer")}</th>
                <th className="px-3 py-2 text-left">{t("ipos.thCashier")}</th>
                <th className="px-3 py-2 text-left">{t("ipos.thCreated")}</th>
                <th className="px-3 py-2 text-right">{t("ipos.thItems")}</th>
                <th className="px-3 py-2 text-right">{t("ipos.thAmount")}</th>
                <th className="px-3 py-2 text-right">{t("ipos.thActions")}</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td></tr>
              )}
              {!isFetching && filtered.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{t("ipos.noHeldSales")}</td></tr>
              )}
              {filtered.map((h) => {
                const items = Array.isArray(h.cart?.items) ? h.cart.items : [];
                const amount = items.reduce((s, it) => {
                  const qty = Number((it as { qty?: number }).qty ?? 0);
                  const price = Number((it as { unit_price?: number }).unit_price ?? 0);
                  const disc = Number((it as { discount?: number }).discount ?? 0);
                  return s + qty * price - disc;
                }, 0) - Number(h.cart?.discount ?? 0);
                return (
                  <tr key={h.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{h.label ?? "—"}</td>
                    <td className="px-3 py-2">{h.customer?.name ?? <span className="text-muted-foreground">{t("ipos.walkIn")}</span>}</td>
                    <td className="px-3 py-2">{h.cashier?.full_name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right"><Badge variant="secondary">{items.length}</Badge></td>
                    <td className="px-3 py-2 text-right font-semibold">৳ {amount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="default" onClick={() => resume.mutate(h)} disabled={resume.isPending}>
                          <PlayCircle className="mr-1 h-3.5 w-3.5" /> {t("ipos.resumeBtn")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => del.mutate(h)} disabled={del.isPending}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("ipos.closeBtn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { HeldRow };
