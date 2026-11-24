// B6.7 — Purchases / POs / GRNs / Suppliers (list).
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

const RESOURCES = {
  purchases: { table: "purchases", cols: "id, invoice_no, supplier_id, purchase_date, total, paid, due, status", order: "purchase_date" },
  "purchase-orders": { table: "purchase_orders", cols: "*", order: "created_at" },
  grn: { table: "goods_receipts", cols: "id, grn_no, po_id, supplier_id, received_at, total_value", order: "received_at" },
  suppliers: { table: "suppliers", cols: "id, name, phone, email, due_balance, is_active", order: "created_at" },
} as const;

type ResourceKey = keyof typeof RESOURCES;

export const Route = createFileRoute("/api/public/v1/$resource")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        const key = params.resource as ResourceKey;
        const spec = RESOURCES[key];
        if (!spec) return jsonError("not_found", `Unknown resource: ${params.resource}`, 404);
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, count, error } = await supabaseAdmin
          .from(spec.table)
          .select(spec.cols, { count: "exact" })
          .eq("tenant_id", g.key.tenantId)
          .order(spec.order, { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) return jsonError("server_error", error.message, 500);
        const res = jsonOk({ data: data ?? [], total: count ?? 0, limit, offset });
        await g.finish(200);
        return res;
      },
    },
  },
});
