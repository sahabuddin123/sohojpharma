import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminOverviewStats {
  tenants: Array<{
    id: string;
    name: string;
    plan: string | null;
    status: string | null;
    created_at: string;
  }>;
  userCount: number;
  productCount: number;
  salesCount: number;
  purchaseCount: number;
  totalRevenue: number;
  active: number;
  trial: number;
  expired: number;
}

export const getAdminOverviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverviewStats> => {
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc("is_app_admin", {
      _user_id: context.userId,
    });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("Forbidden: SaaS Admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [tenantsRes, subsRes, membersRes, productsRes, purchasesRes] = await Promise.all([
      supabaseAdmin.from("tenants").select("id,plan,created_at,name,status"),
      supabaseAdmin.from("subscriptions").select("tenant_id,status"),
      supabaseAdmin.from("tenant_members").select("user_id"),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("purchase_orders").select("id", { count: "exact", head: true }),
    ]);

    if (tenantsRes.error) throw new Error(tenantsRes.error.message);
    if (subsRes.error) throw new Error(subsRes.error.message);
    if (membersRes.error) throw new Error(membersRes.error.message);
    if (productsRes.error) throw new Error(productsRes.error.message);
    if (purchasesRes.error) throw new Error(purchasesRes.error.message);

    // Aggregate non-void sales revenue cleanly across all pages
    let totalRevenue = 0;
    let salesCount = 0;
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: salesPage, error: salesErr } = await supabaseAdmin
        .from("sales")
        .select("total")
        .neq("status", "void")
        .range(from, from + pageSize - 1);
      if (salesErr) throw new Error(salesErr.message);
      const rows = salesPage ?? [];
      for (const r of rows) {
        totalRevenue += Number(r.total ?? 0);
      }
      salesCount += rows.length;
      if (rows.length < pageSize) break;
    }

    const tt = tenantsRes.data ?? [];
    const subMap = new Map<string, string>();
    (subsRes.data ?? []).forEach((s) => {
      if (!subMap.has(s.tenant_id)) subMap.set(s.tenant_id, s.status ?? "active");
    });
    const statusOf = (id: string) => subMap.get(id) ?? "active";
    const distinctUsers = new Set((membersRes.data ?? []).map((m) => m.user_id)).size;

    return {
      tenants: tt,
      userCount: distinctUsers,
      productCount: productsRes.count ?? 0,
      salesCount,
      purchaseCount: purchasesRes.count ?? 0,
      totalRevenue,
      active: tt.filter((x) => statusOf(x.id) === "active").length,
      trial: tt.filter((x) => statusOf(x.id) === "trial").length,
      expired: tt.filter((x) => statusOf(x.id) === "expired").length,
    };
  });
