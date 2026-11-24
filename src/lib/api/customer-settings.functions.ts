import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

export type CustomerSettings = {
  loyalty_enabled: boolean;
  points_per_taka: number;
  minimum_purchase: number;
  maximum_points_per_sale: number;
  credit_control_enabled: boolean;
  birthday_wishes_enabled: boolean;
  anniversary_wishes_enabled: boolean;
  due_reminders_enabled: boolean;
  credit_warn_pct: number;
};

const DEFAULTS: CustomerSettings = {
  loyalty_enabled: true,
  points_per_taka: 1,
  minimum_purchase: 100,
  maximum_points_per_sale: 500,
  credit_control_enabled: true,
  birthday_wishes_enabled: true,
  anniversary_wishes_enabled: true,
  due_reminders_enabled: true,
  credit_warn_pct: 80,
};

const SettingsInput = z.object({
  tenantId: z.string().uuid(),
  settings: z.object({
    loyalty_enabled: z.boolean(),
    points_per_taka: z.number().min(0),
    minimum_purchase: z.number().min(0),
    maximum_points_per_sale: z.number().min(0),
    credit_control_enabled: z.boolean(),
    birthday_wishes_enabled: z.boolean(),
    anniversary_wishes_enabled: z.boolean(),
    due_reminders_enabled: z.boolean(),
    credit_warn_pct: z.number().min(0).max(100),
  }),
});

export const getCustomerSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("tenant_settings")
      .select("customer")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    return { ...DEFAULTS, ...((row?.customer as Partial<CustomerSettings>) ?? {}) };
  });

export const saveCustomerSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: z.input<typeof SettingsInput>) => SettingsInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("tenant_settings")
      .select("tenant_id")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("tenant_settings")
        .update({ customer: data.settings as never })
        .eq("tenant_id", data.tenantId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("tenant_settings")
        .insert({ tenant_id: data.tenantId, customer: data.settings as never });
      if (error) throw error;
    }
    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenantId,
      _action: "settings.customer.updated",
      _entity_table: "tenant_settings",
      _after: data.settings as never,
    });
    return data.settings;
  });

/* ───────────────── AUTO LOYALTY EARN (called from POS post-checkout) ───────────────── */
const EarnInput = z.object({
  tenantId: z.string().uuid(),
  customerId: z.string().uuid(),
  saleId: z.string().uuid(),
  saleAmount: z.number().min(0),
});
export const autoEarnLoyalty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: z.input<typeof EarnInput>) => EarnInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("tenant_settings")
      .select("customer")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();
    const s = { ...DEFAULTS, ...((row?.customer as Partial<CustomerSettings>) ?? {}) };
    if (!s.loyalty_enabled) return { earned: 0, skipped: "loyalty_disabled" };
    if (data.saleAmount < s.minimum_purchase) return { earned: 0, skipped: "below_minimum" };

    const raw = Math.floor(data.saleAmount * s.points_per_taka);
    const earned = s.maximum_points_per_sale > 0 ? Math.min(raw, s.maximum_points_per_sale) : raw;
    if (earned <= 0) return { earned: 0, skipped: "zero" };

    const { data: agg } = await supabase
      .from("customer_points")
      .select("points_earned,points_used")
      .eq("tenant_id", data.tenantId)
      .eq("customer_id", data.customerId);
    const prev = (agg ?? []).reduce(
      (a, r) => a + Number(r.points_earned ?? 0) - Number(r.points_used ?? 0),
      0,
    );
    const balance = prev + earned;

    const { data: inserted } = await supabase
      .from("customer_points")
      .insert({
        tenant_id: data.tenantId,
        customer_id: data.customerId,
        sale_id: data.saleId,
        points_earned: earned,
        points_used: 0,
        balance,
        note: `Auto-earned from sale`,
      })
      .select("id,balance")
      .single();

    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenantId,
      _action: "customer.points.earned",
      _entity_table: "customer_points",
      _entity_id: inserted?.id ?? undefined,
      _after: { earned, balance, sale_id: data.saleId } as never,
    });
    return { earned, balance };
  });

/* ───────────────── CAMPAIGNS ───────────────── */
const CampaignInput = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(150),
  channel: z.enum(["in_app", "sms", "whatsapp", "email"]).default("in_app"),
  segment: z.enum(["all", "vip", "dealer", "wholesale", "retail", "inactive", "due", "birthday_month"]).default("all"),
  message: z.string().min(1).max(1000),
  scheduledAt: z.string().optional(),
});

export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: z.input<typeof CampaignInput>) => CampaignInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("customer_campaigns")
      .insert({
        tenant_id: data.tenantId,
        name: data.name,
        channel: data.channel,
        segment: data.segment,
        message: data.message,
        scheduled_at: data.scheduledAt ?? null,
        status: "draft",
        created_by: userId,
      })
      .select("id,name,channel,segment,status,created_at")
      .single();
    if (error) throw error;
    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenantId,
      _action: "campaign.created",
      _entity_table: "customer_campaigns",
      _entity_id: row.id ?? undefined,
      _after: row as never,
    });
    return row;
  });

export const listCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: { tenantId: string }) =>
    z.object({ tenantId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("customer_campaigns")
      .select("id,name,channel,segment,status,scheduled_at,sent_at,recipient_count,message,created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

export const sendCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: { tenantId: string; campaignId: string }) =>
    z.object({ tenantId: z.string().uuid(), campaignId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: campaign } = await supabase
      .from("customer_campaigns")
      .select("*")
      .eq("tenant_id", data.tenantId)
      .eq("id", data.campaignId)
      .single();
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status === "sent") throw new Error("Campaign already sent");

    // Resolve recipients per segment
    const { data: custs } = await supabase
      .from("customers")
      .select("id,type,due_balance,date_of_birth,is_active")
      .eq("tenant_id", data.tenantId);
    const now = new Date();
    const thisMonth = now.getMonth();

    const seg = campaign.segment as string;
    const recipients = (custs ?? []).filter((c) => {
      if (c.is_active === false) return seg === "inactive";
      if (seg === "all") return true;
      if (seg === "vip") return Number(c.due_balance ?? 0) === 0;
      if (seg === "dealer") return c.type === "dealer";
      if (seg === "wholesale") return c.type === "wholesale";
      if (seg === "retail") return c.type === "retail";
      if (seg === "due") return Number(c.due_balance ?? 0) > 0;
      if (seg === "birthday_month")
        return c.date_of_birth ? new Date(c.date_of_birth).getMonth() === thisMonth : false;
      return false;
    });

    if (recipients.length > 0) {
      const notes = recipients.map((c) => ({
        tenant_id: data.tenantId,
        user_id: userId,
        type: "marketing_campaign",
        title: campaign.name,
        body: campaign.message,
        entity_type: "customer",
        entity_id: c.id,
        severity: "low",
      }));
      await supabase.from("notifications").insert(notes);
    }

    const { data: updated, error } = await supabase
      .from("customer_campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: recipients.length,
      })
      .eq("id", data.campaignId)
      .select()
      .single();
    if (error) throw error;

    await supabase.rpc("audit_log_event", {
      _tenant_id: data.tenantId,
      _action: "campaign.sent",
      _entity_table: "customer_campaigns",
      _entity_id: data.campaignId,
      _after: { recipient_count: recipients.length, channel: campaign.channel } as never,
    });

    return { recipient_count: recipients.length, campaign: updated };
  });
