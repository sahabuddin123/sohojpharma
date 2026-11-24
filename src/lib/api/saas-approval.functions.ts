import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUSES = [
  "pending",
  "active",
  "suspended",
  "expired",
  "rejected",
] as const;
export type TenantStatus = (typeof STATUSES)[number];

async function assertAppAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_app_admin", {
    _user_id: ctx.userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: SaaS Admin only");
}

export const listTenantsByStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(STATUSES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("tenants")
      .select(
        "id,name,slug,status,plan,email,phone,mobile,owner_name,created_at,updated_at",
      )
      .eq("status", data.status)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

async function setStatus(
  ctx: { supabase: any; userId: string },
  tenantId: string,
  to: TenantStatus,
  remarks?: string,
) {
  await assertAppAdmin(ctx);
  const { data: cur, error: gErr } = await ctx.supabase
    .from("tenants")
    .select("status")
    .eq("id", tenantId)
    .single();
  if (gErr) throw new Error(gErr.message);
  const from = cur.status as TenantStatus;
  if (from === to) return { ok: true, unchanged: true };

  const { data: upd, error: uErr } = await ctx.supabase
    .from("tenants")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", tenantId)
    .select("id");
  if (uErr) throw new Error(uErr.message);
  if (!upd || upd.length === 0) {
    throw new Error("Store status update blocked by RLS or row not found");
  }

  // Trigger writes approval_logs + notifications automatically, but remarks
  // are user-supplied. Update the most recent matching log row with remarks.
  if (remarks) {
    await ctx.supabase
      .from("approval_logs")
      .update({ remarks })
      .eq("tenant_id", tenantId)
      .eq("to_status", to)
      .order("created_at", { ascending: false })
      .limit(1);
  }
  const auditAction =
    to === "active" ? "store_approved" :
    to === "rejected" ? "store_rejected" :
    to === "suspended" ? "store_suspended" :
    to === "expired" ? "store_expired" : `store_${to}`;
  await ctx.supabase.from("audit_log").insert({
    tenant_id: tenantId,
    user_id: ctx.userId,
    action: auditAction,
    entity_table: "tenants",
    entity_id: tenantId,
    before_data: { status: from },
    after_data: { status: to, remarks: remarks ?? null },
  });
  return { ok: true };
}

const ActionInput = z.object({
  tenantId: z.string().uuid(),
  remarks: z.string().max(2000).optional(),
});

const ApproveInput = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid().optional().nullable(),
  durationMonths: z.number().int().min(0).max(60).default(0), // 0 = 7-day trial, 1, 3, 6, 12 months
  remarks: z.string().max(2000).optional(),
});

export const approveTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApproveInput.parse(d))
  .handler(async ({ data, context }) => {
    const res = await setStatus(context, data.tenantId, "active", data.remarks);
    const { notifyAdmin } = await import("@/lib/notify-admin.server");
    // Idempotent provisioning of HQ branch, warehouse, register, subscription, etc.
    const { error: pErr } = await context.supabase.rpc("provision_tenant", {
      _tenant_id: data.tenantId,
    });
    if (pErr) {
      await notifyAdmin({
        severity: "error",
        type: "tenant_provision_failed",
        title: "Tenant Provisioning Failed",
        message: `Provisioning failed for tenant ${data.tenantId}: ${pErr.message}`,
        link: "/admin/stores",
        entityType: "tenant",
        entityId: data.tenantId,
        metadata: { error: pErr.message },
        idempotencyKey: `tenant_provision_failed:${data.tenantId}:${Date.now()}`,
      });
      throw new Error(`provisioning_failed: ${pErr.message}`);
    }

    // Assign chosen plan & duration
    try {
      let targetPlan: any = null;
      if (data.planId) {
        const { data: p } = await context.supabase
          .from("plans")
          .select("id,code,name,price_bdt,trial_days")
          .eq("id", data.planId)
          .maybeSingle();
        targetPlan = p;
      }
      if (!targetPlan) {
        const { data: p } = await context.supabase
          .from("plans")
          .select("id,code,name,price_bdt,trial_days")
          .eq("code", "basic")
          .maybeSingle();
        targetPlan = p;
      }
      if (!targetPlan) {
        const { data: p } = await context.supabase
          .from("plans")
          .select("id,code,name,price_bdt,trial_days")
          .order("sort_order", { ascending: true })
          .limit(1)
          .maybeSingle();
        targetPlan = p;
      }

      if (targetPlan) {
        const periodStart = new Date();
        const periodEnd = new Date(periodStart);
        const isTrial = data.durationMonths === 0;

        if (isTrial) {
          periodEnd.setDate(periodEnd.getDate() + (targetPlan.trial_days || 7));
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + data.durationMonths);
        }

        // Update tenant plan
        await context.supabase
          .from("tenants")
          .update({ plan: targetPlan.code })
          .eq("id", data.tenantId);

        // Upsert subscription with configured plan and duration
        await context.supabase
          .from("subscriptions")
          .upsert({
            tenant_id: data.tenantId,
            plan_id: targetPlan.id,
            status: isTrial ? "trial" : "active",
            billing_cycle: data.durationMonths >= 12 ? "yearly" : "monthly",
            current_period_start: periodStart.toISOString(),
            current_period_end: periodEnd.toISOString(),
            expires_at: periodEnd.toISOString(),
            trial_ends_at: isTrial ? periodEnd.toISOString() : null,
            grace_until: new Date(periodEnd.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            starts_at: periodStart.toISOString(),
            auto_renew: false,
          }, { onConflict: "tenant_id" });
      }
    } catch (e: any) {
      console.error("Error setting plan during approval:", e);
    }

    await notifyAdmin({
      severity: "success",
      type: "tenant_provisioned",
      title: "Tenant Provisioned",
      message: `Tenant ${data.tenantId} was provisioned and activated successfully.`,
      link: "/admin/stores",
      entityType: "tenant",
      entityId: data.tenantId,
      idempotencyKey: `tenant_provisioned:${data.tenantId}`,
    });
    return res;
  });


export const rejectTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ActionInput.parse(d))
  .handler(({ data, context }) =>
    setStatus(context, data.tenantId, "rejected", data.remarks),
  );

export const suspendTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ActionInput.parse(d))
  .handler(({ data, context }) =>
    setStatus(context, data.tenantId, "suspended", data.remarks),
  );

export const activateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ActionInput.parse(d))
  .handler(({ data, context }) =>
    setStatus(context, data.tenantId, "active", data.remarks),
  );

export const expireTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ActionInput.parse(d))
  .handler(({ data, context }) =>
    setStatus(context, data.tenantId, "expired", data.remarks),
  );

export const getApprovalLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenantId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("approval_logs")
      .select("id,action,from_status,to_status,remarks,approved_by,created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
