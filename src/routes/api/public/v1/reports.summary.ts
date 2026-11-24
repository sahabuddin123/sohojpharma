// B6.8 — Dashboard / report metrics summary.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonOk, preflight } from "@/lib/public-api/auth";

export const Route = createFileRoute("/api/public/v1/reports/summary")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const tenant = g.key.tenantId;
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

        const [salesToday, productsCount, customersDue] = await Promise.all([
          supabaseAdmin
            .from("sales")
            .select("total", { count: "exact" })
            .eq("tenant_id", tenant)
            .neq("status", "void")
            .gte("sale_date", startOfDay),
          supabaseAdmin
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant)
            .is("deleted_at", null),
          supabaseAdmin
            .from("v_customer_due")
            .select("due_balance")
            .eq("tenant_id", tenant)
            .gt("due_balance", 0),
        ]);

        const salesTotal = (salesToday.data ?? []).reduce(
          (s, r) => s + Number(r.total ?? 0),
          0,
        );
        const totalDue = (customersDue.data ?? []).reduce(
          (s, r) => s + Number(r.due_balance ?? 0),
          0,
        );

        const res = jsonOk({
          sales_today: { count: salesToday.count ?? 0, total: salesTotal },
          products: { count: productsCount.count ?? 0 },
          customers: { total_due: totalDue, with_due: customersDue.data?.length ?? 0 },
          generated_at: new Date().toISOString(),
        });
        await g.finish(200);
        return res;
      },
    },
  },
});
