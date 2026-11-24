import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ tenant_id: z.string().uuid() });

export type CorporateDashboardData = {
  kpi: {
    totalSales: number;
    totalPurchase: number;
    totalProfit: number;
    totalInventory: number;
    totalDue: number;
    totalCollections: number;
    activeCustomers: number;
    activeSuppliers: number;
  };
  branches: {
    branch_id: string;
    branch_name: string;
    branch_role: string;
    sales: number;
    profit: number;
    collections: number;
    inventory_value: number;
  }[];
  lowStock: { product: string; branch: string; qty: number; reorder: number }[];
  expiry: {
    product: string;
    branch: string | null;
    batch_no: string;
    expiry_date: string;
    qty_on_hand: number;
    bucket: "expired" | "7d" | "30d" | "90d";
  }[];
};

export const getCorporateDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof Input>) => Input.parse(data))
  .handler(async ({ data, context }): Promise<CorporateDashboardData> => {
    const { data: res, error } = await context.supabase.rpc("corporate_dashboard_metrics", {
      _tenant: data.tenant_id,
    });
    if (error) throw new Error(error.message);
    return res as CorporateDashboardData;
  });
