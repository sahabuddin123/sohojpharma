import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  tenant_id: z.string().uuid(),
  branch_id: z.string().uuid(),
});

export type BranchDashboardData = {
  kpi: {
    todaySales: number;
    todayPurchase: number;
    grossProfit: number;
    netProfit: number;
    cashCollection: number;
    dueCollection: number;
    totalCustomers: number;
    totalSuppliers: number;
    inventoryValue: number;
    expiring30: number;
    lowStock: number;
    outOfStock: number;
  };
  trend7: { day: string; sales: number }[];
  trend30: { day: string; sales: number }[];
  topMedicines: { name: string; qty: number; revenue: number }[];
  topCategories: { name: string; revenue: number }[];
  topCustomers: { name: string; revenue: number }[];
  topCashiers: { name: string; invoices: number; revenue: number }[];
};

export const getBranchDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof Input>) => Input.parse(data))
  .handler(async ({ data, context }): Promise<BranchDashboardData> => {
    const { data: res, error } = await context.supabase.rpc("branch_dashboard_metrics", {
      _tenant: data.tenant_id,
      _branch: data.branch_id,
    });
    if (error) throw new Error(error.message);
    return res as BranchDashboardData;
  });
