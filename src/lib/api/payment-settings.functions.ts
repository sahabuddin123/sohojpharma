import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const WRITE_ROLES = ["owner", "corporate_admin", "manager"] as const;

async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}
async function assertCanWrite(ctx: { supabase: any; userId: string }, tenant_id: string) {
  for (const r of WRITE_ROLES) {
    const { data } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (data) return;
  }
  throw new Error("Forbidden — requires owner, admin or manager role");
}
async function logAudit(ctx: { supabase: any }, args: { tenant_id: string; action: string; entity?: string; before?: unknown; after?: unknown }) {
  await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: args.tenant_id,
    _action: args.action,
    _entity_table: args.entity ?? "tenant_settings",
    _before: (args.before as any) ?? undefined,
    _after: (args.after as any) ?? undefined,
  });
}

export type PaymentMethod = "cash" | "card" | "bank" | "bkash" | "nagad" | "rocket";

export type PaymentSettings = {
  cash_enabled: boolean;
  card_enabled: boolean;
  bank_enabled: boolean;
  bkash_enabled: boolean;
  nagad_enabled: boolean;
  rocket_enabled: boolean;
  credit_sale_enabled: boolean;
  partial_payment_enabled: boolean;
  refund_enabled: boolean;
  auto_reconcile: boolean;
  default_payment_method: PaymentMethod;
};

const DEFAULTS: PaymentSettings = {
  cash_enabled: true,
  card_enabled: true,
  bank_enabled: true,
  bkash_enabled: true,
  nagad_enabled: true,
  rocket_enabled: true,
  credit_sale_enabled: true,
  partial_payment_enabled: true,
  refund_enabled: true,
  auto_reconcile: false,
  default_payment_method: "cash",
};

export const getPaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<PaymentSettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("payments")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULTS, ...((row?.payments as object) ?? {}) };
  });

export const updatePaymentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({
      tenant_id: z.string().uuid(),
      patch: z.record(z.string(), z.union([z.boolean(), z.string()])),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanWrite(context, data.tenant_id);
    const { data: cur } = await context.supabase
      .from("tenant_settings").select("payments")
      .eq("tenant_id", data.tenant_id).maybeSingle();
    const before = (cur?.payments as object) ?? {};
    const after = { ...DEFAULTS, ...before, ...data.patch };
    const { error } = await context.supabase
      .from("tenant_settings")
      .upsert({ tenant_id: data.tenant_id, payments: after, updated_by: context.userId }, { onConflict: "tenant_id" });
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "payment_settings.updated", before, after });
    return after as PaymentSettings;
  });

// Gateways
const GatewaySchema = z.object({
  id: z.string().uuid().optional(),
  provider: z.string().min(1).max(40),
  merchant_id: z.string().max(200).nullable().optional(),
  api_key: z.string().max(500).nullable().optional(),
  secret_key: z.string().max(500).nullable().optional(),
  webhook_url: z.string().max(500).nullable().optional(),
  sandbox: z.boolean().default(true),
  status: z.enum(["active","inactive"]).default("inactive"),
});

export const listGateways = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("payment_gateways")
      .select("id, provider, merchant_id, api_key, webhook_url, sandbox, status, updated_at")
      .eq("tenant_id", data.tenant_id)
      .order("provider", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), gateway: GatewaySchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanWrite(context, data.tenant_id);
    const payload: any = {
      tenant_id: data.tenant_id,
      provider: data.gateway.provider,
      merchant_id: data.gateway.merchant_id ?? null,
      api_key: data.gateway.api_key ?? null,
      secret_key: data.gateway.secret_key ?? null,
      webhook_url: data.gateway.webhook_url ?? null,
      sandbox: data.gateway.sandbox,
      status: data.gateway.status,
      created_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.gateway.id) payload.id = data.gateway.id;
    const { error } = await context.supabase
      .from("payment_gateways")
      .upsert(payload, { onConflict: "tenant_id,provider" });
    if (error) throw new Error(error.message);
    await logAudit(context, {
      tenant_id: data.tenant_id,
      action: data.gateway.id ? "gateway.updated" : "gateway.created",
      entity: "payment_gateways",
      after: { provider: data.gateway.provider, status: data.gateway.status, sandbox: data.gateway.sandbox },
    });
    return { ok: true };
  });

export const deleteGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanWrite(context, data.tenant_id);
    const { error } = await context.supabase
      .from("payment_gateways").delete()
      .eq("tenant_id", data.tenant_id).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, { tenant_id: data.tenant_id, action: "gateway.deleted", entity: "payment_gateways", after: { id: data.id } });
    return { ok: true };
  });

export const listSettlements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((d: unknown) =>
    z.object({ tenant_id: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("payment_settlements")
      .select("id, provider, amount, fees, net_amount, status, reference, settled_at, created_at")
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
