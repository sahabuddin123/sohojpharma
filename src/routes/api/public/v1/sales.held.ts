// B6.6 — Hold sale / list held / resume held cart.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

const holdSchema = z.object({
  label: z.string().max(120).optional(),
  customer_id: z.string().uuid().optional(),
  cart: z.record(z.string(), z.unknown()),
});

export const Route = createFileRoute("/api/public/v1/sales/held")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("held_sales")
          .select("id, label, customer_id, cart, created_at, resumed_at")
          .eq("tenant_id", g.key.tenantId)
          .is("resumed_at", null)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return jsonError("server_error", error.message, 500);
        const res = jsonOk({ data: data ?? [] });
        await g.finish(200);
        return res;
      },
      POST: async ({ request }) => {
        const g = await guard(request, "write", 60);
        if (!g.ok) return g.response;
        const parsed = holdSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonError("invalid_request", parsed.error.message, 400);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("held_sales")
          .insert({
            tenant_id: g.key.tenantId,
            label: parsed.data.label ?? null,
            customer_id: parsed.data.customer_id ?? null,
            cart: parsed.data.cart as never,
          })
          .select("id")
          .single();
        if (error || !data) return jsonError("server_error", error?.message ?? "Insert failed", 500);
        const res = jsonOk({ held_sale_id: data.id }, 201);
        await g.finish(201);
        return res;
      },
    },
  },
});
