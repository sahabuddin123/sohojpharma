import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { tool } from "ai";
import { z } from "zod";

export function makeUserSupabase(token: string): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    },
  );
}

function dayRange(daysBack: number) {
  const end = new Date();
  const start = new Date();
  if (daysBack <= 0) {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setDate(start.getDate() - daysBack);
    start.setHours(0, 0, 0, 0);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export function buildTools(supabase: SupabaseClient<Database>, tenantId: string) {
  return {
    salesSummary: tool({
      description: "Sales totals (count, revenue, paid, due) for a period.",
      inputSchema: z.object({
        period: z.enum(["today", "week", "month", "year", "custom"]).default("today"),
        days: z.number().int().min(1).max(365).optional(),
      }),
      execute: async ({ period, days }) => {
        const daysBack =
          period === "today" ? 0 :
          period === "week" ? 7 :
          period === "month" ? 30 :
          period === "year" ? 365 : (days ?? 1);
        const { start, end } = dayRange(daysBack);
        const { data, error } = await supabase
          .from("sales")
          .select("total,paid,due,status,created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", start)
          .lte("created_at", end);
        if (error) return { error: error.message };
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        return {
          period, from: start, to: end, count: rows.length,
          revenue: rows.reduce((s, r) => s + num(r.total), 0),
          paid: rows.reduce((s, r) => s + num(r.paid), 0),
          due: rows.reduce((s, r) => s + num(r.due), 0),
        };
      },
    }),

    topProducts: tool({
      description: "Top selling products by quantity over the last N days.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).default(30),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      execute: async ({ days, limit }) => {
        const { start, end } = dayRange(days);
        const { data, error } = await supabase
          .from("sale_items")
          .select("product_id,qty,line_total,products(name),sales!inner(tenant_id,created_at)")
          .eq("sales.tenant_id", tenantId)
          .gte("sales.created_at", start)
          .lte("sales.created_at", end)
          .limit(2000);
        if (error) return { error: error.message };
        const map = new Map<string, { name: string; qty: number; revenue: number }>();
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          const k = String(r.product_id);
          const name = ((r.products as { name?: string } | null)?.name) ?? "Unknown";
          const cur = map.get(k) ?? { name, qty: 0, revenue: 0 };
          cur.qty += num(r.qty);
          cur.revenue += num(r.line_total);
          map.set(k, cur);
        }
        return Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, limit);
      },
    }),

    lowStock: tool({
      description: "Products at or below their reorder level (computed from batch stock).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(25) }),
      execute: async ({ limit }) => {
        const { data: prods, error } = await supabase
          .from("products")
          .select("id,name,sku,reorder_level")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .limit(5000);
        if (error) return { error: error.message };
        const { data: batches, error: bErr } = await supabase
          .from("batches")
          .select("product_id,qty_on_hand")
          .eq("tenant_id", tenantId)
          .gt("qty_on_hand", 0)
          .limit(20000);
        if (bErr) return { error: bErr.message };
        const stock = new Map<string, number>();
        for (const b of batches ?? []) {
          stock.set(b.product_id as string, (stock.get(b.product_id as string) ?? 0) + num((b as Record<string, unknown>).qty_on_hand));
        }
        const low = (prods ?? [])
          .map((p) => ({ ...p, stock: stock.get(p.id) ?? 0 }))
          .filter((p) => p.stock <= num(p.reorder_level))
          .sort((a, b) => a.stock - b.stock)
          .slice(0, limit);
        return low;
      },
    }),

    expiringMedicines: tool({
      description: "Medicine batches expiring within N days.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).default(30),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      execute: async ({ days, limit }) => {
        const future = new Date();
        future.setDate(future.getDate() + days);
        const { data, error } = await supabase
          .from("batches")
          .select("id,batch_no,expiry_date,qty_on_hand,products(name,sku)")
          .eq("tenant_id", tenantId)
          .lte("expiry_date", future.toISOString().slice(0, 10))
          .gt("qty_on_hand", 0)
          .order("expiry_date", { ascending: true })
          .limit(limit);
        if (error) return { error: error.message };
        return data;
      },
    }),

    duesOverview: tool({
      description: "Customers with outstanding dues.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
      execute: async ({ limit }) => {
        const { data, error } = await supabase
          .from("v_customer_due")
          .select("id:customer_id,name,phone,due_balance")
          .eq("tenant_id", tenantId)
          .gt("due_balance", 0)
          .order("due_balance", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        const total = (data ?? []).reduce((s, r) => s + num((r as Record<string, unknown>).due_balance), 0);
        return { totalDue: total, customers: data };
      },
    }),

    profitSummary: tool({
      description: "Revenue, cost, gross profit, and margin % for last N days.",
      inputSchema: z.object({ days: z.number().int().min(1).max(365).default(30) }),
      execute: async ({ days }) => {
        const { start, end } = dayRange(days);
        const { data, error } = await supabase
          .from("sale_items")
          .select("qty,line_total,unit_cost,sales!inner(tenant_id,created_at)")
          .eq("sales.tenant_id", tenantId)
          .gte("sales.created_at", start)
          .lte("sales.created_at", end)
          .limit(5000);
        if (error) return { error: error.message };
        let revenue = 0, cost = 0;
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          revenue += num(r.line_total);
          cost += num(r.unit_cost) * num(r.qty);
        }
        const profit = revenue - cost;
        return {
          days, revenue, cost, profit,
          marginPct: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(2)) : 0,
        };
      },
    }),

    inventoryValue: tool({
      description: "Total inventory value (units, cost, retail).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("batches")
          .select("qty_on_hand,purchase_price,products(retail_price)")
          .eq("tenant_id", tenantId)
          .gt("qty_on_hand", 0)
          .limit(20000);
        if (error) return { error: error.message };
        let units = 0, atCost = 0, atRetail = 0;
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          const q = num(r.qty_on_hand);
          units += q;
          atCost += q * num(r.purchase_price);
          atRetail += q * num((r.products as { retail_price?: number } | null)?.retail_price);
        }
        return { batchCount: data?.length ?? 0, units, atCost, atRetail };
      },
    }),
  };
}
