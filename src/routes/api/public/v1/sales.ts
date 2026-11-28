// B6.6 — POS sales: create + list + detail.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

const itemSchema = z.object({
  product_id: z.string().uuid(),
  batch_id: z.string().uuid().optional(),
  qty: z.number().positive(),
  unit_price: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  vat: z.number().nonnegative().default(0),
});

const saleSchema = z.object({
  branch_id: z.string().uuid(),
  invoice_no: z.string().min(1),
  customer_id: z.string().uuid().optional(),
  payment_method: z.string().default("cash"),
  discount: z.number().nonnegative().default(0),
  paid: z.number().nonnegative().default(0),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

export const Route = createFileRoute("/api/public/v1/sales")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, count, error } = await supabaseAdmin
          .from("sales")
          .select("id, invoice_no, customer_id, sale_date, total, paid, due, status", { count: "exact" })
          .eq("tenant_id", g.key.tenantId)
          .order("sale_date", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) return jsonError("server_error", error.message, 500);
        const res = jsonOk({ data: data ?? [], total: count ?? 0, limit, offset });
        await g.finish(200);
        return res;
      },
      POST: async ({ request }) => {
        const g = await guard(request, "write", 60);
        if (!g.ok) return g.response;
        const parsed = saleSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return jsonError("invalid_request", parsed.error.message, 400);
        const body = parsed.data;
        const subtotal = body.items.reduce((s, i) => s + i.qty * i.unit_price - i.discount, 0);
        const vat = body.items.reduce((s, i) => s + i.vat, 0);
        if (subtotal < 0) return jsonError("invalid_request", "Line discount exceeds item total", 400);
        if (body.discount > subtotal + vat) {
          return jsonError("invalid_request", "Invoice discount exceeds subtotal + vat", 400);
        }
        const total = subtotal + vat - body.discount;
        const due = Math.max(total - body.paid, 0);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: branch } = await supabaseAdmin
          .from("branches")
          .select("id")
          .eq("id", body.branch_id)
          .eq("tenant_id", g.key.tenantId)
          .maybeSingle();
        if (!branch) return jsonError("invalid_branch", "branch_id does not belong to this tenant", 400);

        if (body.customer_id) {
          const { data: customer } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("id", body.customer_id)
            .eq("tenant_id", g.key.tenantId)
            .maybeSingle();
          if (!customer) return jsonError("invalid_customer", "customer_id does not belong to this tenant", 400);
        }

        const productIds = Array.from(new Set(body.items.map((i) => i.product_id)));
        const { data: validProducts } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("tenant_id", g.key.tenantId)
          .in("id", productIds);
        if ((validProducts ?? []).length !== productIds.length) {
          return jsonError("invalid_product", "One or more product_id values do not belong to this tenant", 400);
        }

        const batchIds = Array.from(
          new Set(body.items.map((i) => i.batch_id).filter((id): id is string => Boolean(id))),
        );
        if (batchIds.length > 0) {
          const { data: validBatches } = await supabaseAdmin
            .from("batches")
            .select("id")
            .eq("tenant_id", g.key.tenantId)
            .in("id", batchIds);
          if ((validBatches ?? []).length !== batchIds.length) {
            return jsonError("invalid_batch", "One or more batch_id values do not belong to this tenant", 400);
          }
        }
        const { data: sale, error } = await supabaseAdmin
          .from("sales")
          .insert({
            tenant_id: g.key.tenantId,
            branch_id: body.branch_id,
            invoice_no: body.invoice_no,
            customer_id: body.customer_id ?? null,
            payment_method: body.payment_method,
            subtotal, discount: body.discount, vat, total, paid: body.paid, due,
            notes: body.notes ?? null,
          })
          .select("id, invoice_no")
          .single();
        if (error || !sale) return jsonError("server_error", error?.message ?? "Insert failed", 500);

        const itemsRows = body.items.map((i) => ({
          tenant_id: g.key.tenantId,
          branch_id: body.branch_id,
          sale_id: sale.id,
          product_id: i.product_id,
          batch_id: i.batch_id ?? null,
          qty: i.qty,
          unit_price: i.unit_price,
          discount: i.discount,
          vat: i.vat,
          line_total: i.qty * i.unit_price - i.discount + i.vat,
        }));
        const { error: itemsErr } = await supabaseAdmin.from("sale_items").insert(itemsRows);
        if (itemsErr) return jsonError("server_error", itemsErr.message, 500);

        // Fire webhook (B6.10)
        const { dispatchWebhook } = await import("@/lib/public-api/webhooks");
        void dispatchWebhook(g.key.tenantId, "sale.created", { sale_id: sale.id, invoice_no: sale.invoice_no, total });

        const res = jsonOk({ sale_id: sale.id, invoice_no: sale.invoice_no, total, due }, 201);
        await g.finish(201);
        return res;
      },
    },
  },
});
