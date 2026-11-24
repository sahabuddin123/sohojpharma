import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      throw redirect({ to: "/auth", replace: true });
    }

    const { data: isAdmin } = await supabase.rpc("is_app_admin", {
      _user_id: user.id,
    });
    if (isAdmin) {
      throw redirect({ to: "/admin", replace: true });
    }

    // Check store owner's tenant membership & status
    const { data: mems } = await supabase
      .from("tenant_members")
      .select("tenant_id, is_default, tenants(id, status)")
      .eq("user_id", user.id);

    const activeMems = (mems ?? []).filter((m: any) => m.tenants?.status === "active");

    // If no active store exists, kick out to auth with blocked notice
    if (activeMems.length === 0) {
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        localStorage.removeItem("pc_tenant");
      }
      throw redirect({ to: "/auth", search: { blocked: "pending" }, replace: true });
    }

    // Determine target tenant
    const targetTenantId =
      activeMems.find((m: any) => m.is_default)?.tenant_id ??
      activeMems[0]?.tenant_id;

    if (targetTenantId) {
      if (typeof window !== "undefined") {
        localStorage.setItem("pc_tenant", targetTenantId);
      }
      // Check onboarding completeness (must have at least 1 branch and 1 warehouse)
      const [branches, warehouses] = await Promise.all([
        supabase
          .from("branches")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", targetTenantId)
          .is("deleted_at", null),
        supabase
          .from("warehouses")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", targetTenantId)
          .is("deleted_at", null),
      ]);

      const branchCount = branches.count ?? 0;
      const warehouseCount = warehouses.count ?? 0;

      // If setup is incomplete, direct the store admin to Setup Wizard first!
      if (branchCount === 0 || warehouseCount === 0) {
        throw redirect({ to: "/setup", replace: true });
      }
    }

    // Setup is complete, redirect to Store Dashboard
    throw redirect({ to: "/store", replace: true });
  },
});
