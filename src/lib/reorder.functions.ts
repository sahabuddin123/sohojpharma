// Phase 10.5/10.10 — Smart Reorder Engine
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReorderSuggestion = {
  product_id: string;
  sku: string;
  name: string;
  on_hand: number;
  reorder_level: number;
  sold_last_30d: number;
  daily_velocity: number;
  days_of_cover: number | null;
  suggested_qty: number;
  urgency: "critical" | "high" | "medium" | "low";
};

export const getReorderSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      lead_time_days: z.number().int().min(1).max(90).default(7),
      cover_days: z.number().int().min(7).max(180).default(30),
      limit: z.number().int().min(1).max(500).default(100),
    }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ReorderSuggestion[]> => {
    const { tenant_id, lead_time_days, cover_days, limit } = data;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: products, error: pErr } = await context.supabase
      .from("products")
      .select("id, sku, name, reorder_level")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .limit(2000);
    if (pErr) throw new Error(pErr.message);
    if (!products?.length) return [];

    const ids = products.map((p) => p.id);

    const { data: batches } = await context.supabase
      .from("batches")
      .select("product_id, qty_on_hand")
      .eq("tenant_id", tenant_id)
      .in("product_id", ids);
    const onHand = new Map<string, number>();
    for (const b of batches ?? []) {
      onHand.set(b.product_id, (onHand.get(b.product_id) ?? 0) + Number(b.qty_on_hand ?? 0));
    }

    const { data: sales } = await context.supabase
      .from("sale_items")
      .select("product_id, qty, created_at")
      .eq("tenant_id", tenant_id)
      .in("product_id", ids)
      .gte("created_at", since.toISOString());
    const sold = new Map<string, number>();
    for (const s of sales ?? []) {
      sold.set(s.product_id, (sold.get(s.product_id) ?? 0) + Number(s.qty ?? 0));
    }

    const suggestions: ReorderSuggestion[] = [];
    for (const p of products) {
      const stock = onHand.get(p.id) ?? 0;
      const sold30 = sold.get(p.id) ?? 0;
      const velocity = sold30 / 30;
      const days = velocity > 0 ? stock / velocity : null;
      const reorderLvl = p.reorder_level ?? 0;
      const needs = stock <= reorderLvl || (days !== null && days <= lead_time_days);
      if (!needs && sold30 === 0) continue;

      const target = Math.max(reorderLvl, Math.ceil(velocity * (lead_time_days + cover_days)));
      const suggested = Math.max(0, target - stock);
      if (suggested <= 0) continue;

      let urgency: ReorderSuggestion["urgency"] = "low";
      if (stock === 0) urgency = "critical";
      else if (days !== null && days <= lead_time_days) urgency = "high";
      else if (stock <= reorderLvl) urgency = "medium";

      suggestions.push({
        product_id: p.id,
        sku: p.sku,
        name: p.name,
        on_hand: stock,
        reorder_level: reorderLvl,
        sold_last_30d: sold30,
        daily_velocity: Number(velocity.toFixed(2)),
        days_of_cover: days === null ? null : Math.floor(days),
        suggested_qty: suggested,
        urgency,
      });
    }

    const order: Record<ReorderSuggestion["urgency"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
    suggestions.sort((a, b) => order[a.urgency] - order[b.urgency] || b.sold_last_30d - a.sold_last_30d);
    return suggestions.slice(0, limit);
  });
