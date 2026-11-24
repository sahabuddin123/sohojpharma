import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFeature } from "@/lib/api/middleware/require-feature";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const TenantInput = z.object({ tenantId: z.string().uuid() });

export const customerAgingReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription, requireFeature("accounting")])
  .inputValidator(TenantInput)
  .handler(async ({ data, context }) => {
    const { data: customers } = await context.supabase
      .from("v_customer_due")
      .select("customer_id,name,phone,net_due,last_purchase_at")
      .eq("tenant_id", data.tenantId)
      .gt("net_due", 0);

    const today = new Date();
    const ageDays = (iso: string) =>
      Math.floor((today.getTime() - new Date(iso).getTime()) / 86400000);

    type Row = {
      customer_id: string; customer_name: string; phone: string | null;
      current: number; d_1_30: number; d_31_60: number; d_61_90: number; d_90_plus: number;
      total_due: number; overdue: number;
    };
    const out: Row[] = [];

    for (const cust of customers ?? []) {
      const total_due = Number(cust.net_due ?? 0);
      if (total_due <= 0.01) continue;
      const buckets = { current: 0, d_1_30: 0, d_31_60: 0, d_61_90: 0, d_90_plus: 0 };
      const age = cust.last_purchase_at ? ageDays(cust.last_purchase_at) : 0;
      if (age <= 0) buckets.current = total_due;
      else if (age <= 30) buckets.d_1_30 = total_due;
      else if (age <= 60) buckets.d_31_60 = total_due;
      else if (age <= 90) buckets.d_61_90 = total_due;
      else buckets.d_90_plus = total_due;
      const overdue = buckets.d_1_30 + buckets.d_31_60 + buckets.d_61_90 + buckets.d_90_plus;
      if (!cust.customer_id || !cust.name) continue;
      out.push({
        customer_id: cust.customer_id,
        customer_name: cust.name,
        phone: cust.phone,
        ...buckets,
        total_due,
        overdue,
      });
    }
    out.sort((a, b) => b.total_due - a.total_due);
    return out;
  });
