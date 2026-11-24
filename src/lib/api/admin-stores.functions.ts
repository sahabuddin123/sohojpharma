import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLANS = ["basic", "starter", "business", "pro", "enterprise", "free"] as const;
const INITIAL_STATUS = ["pending", "active"] as const;

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("is_app_admin", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: SaaS Admin only");
}

const CreateInput = z.object({
  pharmacy_name: z.string().trim().min(2).max(120),
  owner_name: z.string().trim().min(2).max(120),
  mobile: z.string().trim().regex(/^(?:\+?880|0)1[3-9]\d{8}$/, "Invalid BD mobile"),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8).max(128),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  district: z.string().trim().max(120).optional().or(z.literal("")),
  trade_license: z.string().trim().max(120).optional().or(z.literal("")),
  plan: z.enum(PLANS).default("free"),
  status: z.enum(INITIAL_STATUS).default("pending"),
});

export const createStoreAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Create or reuse auth user
    let ownerUserId: string | null = null;
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.owner_name,
        pharmacy_name: data.pharmacy_name,
        phone: data.mobile,
        created_by_admin: true,
      },
    });
    if (cErr) {
      if (/already|registered|exists|duplicate/i.test(cErr.message)) {
        const { data: list, error: lErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1, perPage: 200,
        });
        if (lErr) throw new Error(lErr.message);
        const found = list.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
        if (!found) throw new Error(cErr.message);
        ownerUserId = found.id;
      } else {
        throw new Error(cErr.message);
      }
    } else {
      ownerUserId = created.user?.id ?? null;
    }
    if (!ownerUserId) throw new Error("Could not resolve owner user id");

    // 2) Register tenant + membership + owner role
    const { data: tenantId, error: rErr } = await context.supabase.rpc(
      "admin_register_pharmacy_store",
      {
        _owner_user_id: ownerUserId,
        _pharmacy_name: data.pharmacy_name,
        _owner_name: data.owner_name,
        _mobile: data.mobile,
        _email: data.email,
        _address: data.address || undefined,
        _district: data.district || undefined,
        _trade_license: data.trade_license || undefined,
        _initial_status: data.status,
        _initial_plan: data.plan,
      },
    );
    if (rErr) throw new Error(rErr.message);

    // 3) Provision HQ branch, warehouse, register, subscription, tax, number series
    const { error: pErr } = await context.supabase.rpc("provision_tenant", {
      _tenant_id: tenantId as string,
    });
    if (pErr) throw new Error(`provisioning_failed: ${pErr.message}`);

    return { tenantId: tenantId as string, ownerUserId };
  });

export const resetStorePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenantId: z.string().uuid(), password: z.string().min(8).max(128) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: owner, error: oErr } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", data.tenantId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!owner) throw new Error("Owner not found");

    const { error: uErr } = await supabaseAdmin.auth.admin.updateUserById(owner.user_id, {
      password: data.password,
    });
    if (uErr) throw new Error(uErr.message);

    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      user_id: context.userId,
      action: "store_password_reset",
      entity_table: "tenants",
      entity_id: data.tenantId,
    });
    return { ok: true };
  });

export const changeStorePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tenantId: z.string().uuid(), plan: z.enum(PLANS) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("tenants")
      .update({ plan: data.plan as any, updated_at: new Date().toISOString() })
      .eq("id", data.tenantId);
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_log").insert({
      tenant_id: data.tenantId,
      user_id: context.userId,
      action: "store_plan_changed",
      entity_table: "tenants",
      entity_id: data.tenantId,
      after_data: { plan: data.plan },
    });
    return { ok: true };
  });

export const getStoreDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: tenant, error } = await context.supabase
      .from("tenants")
      .select("id,name,slug,type,plan,status,email,phone,mobile,owner_name,address_line,district,trade_license_no,custom_domain,created_at,updated_at")
      .eq("id", data.tenantId)
      .single();
    if (error) throw new Error(error.message);

    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("status,trial_ends_at,current_period_end,plan_id")
      .eq("tenant_id", data.tenantId)
      .maybeSingle();

    // Resolve owner from user_roles → profiles → auth.users (admin client)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let owner: { user_id: string; full_name: string | null; email: string | null; phone: string | null } | null = null;
    const { data: ownerRole } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("tenant_id", data.tenantId)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ownerRole?.user_id) {
      const [profileRes, authRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("full_name,phone")
          .eq("id", ownerRole.user_id)
          .maybeSingle(),
        supabaseAdmin.auth.admin.getUserById(ownerRole.user_id),
      ]);
      owner = {
        user_id: ownerRole.user_id,
        full_name: profileRes.data?.full_name ?? null,
        phone: profileRes.data?.phone ?? authRes.data.user?.phone ?? null,
        email: authRes.data.user?.email ?? null,
      };
    }

    return { tenant, subscription: sub ?? null, owner };
  });

export const updateStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      tenantId: z.string().uuid(),
      name: z.string().trim().min(2).max(120).optional(),
      owner_name: z.string().trim().min(2).max(120).optional(),
      mobile: z.string().trim().optional(),
      email: z.string().trim().email().optional(),
      address_line: z.string().trim().max(500).optional(),
      district: z.string().trim().max(120).optional(),
      trade_license_no: z.string().trim().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { tenantId, ...patch } = data;
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) return { ok: true };

    // Pre-validate uniqueness (mobile/email/name) against other non-rejected tenants
    const STATUS_LABEL: Record<string, string> = {
      pending: "Pending",
      active: "Active",
      suspended: "Suspended",
      expired: "Expired",
      rejected: "Rejected",
    };
    const uniqueChecks: Array<{ field: "mobile" | "email" | "name"; value: string; msg: (n: string, s: string) => string }> = [];
    if (typeof patch.mobile === "string" && patch.mobile.length > 0) {
      uniqueChecks.push({
        field: "mobile", value: patch.mobile,
        msg: (n, s) => `এই মোবাইল নম্বরটি ইতোমধ্যে অন্য একটি স্টোরে ব্যবহৃত হয়েছে।\nMobile already used by: ${n} (${s})`,
      });
    }
    if (typeof patch.email === "string" && patch.email.length > 0) {
      uniqueChecks.push({
        field: "email", value: patch.email,
        msg: (n, s) => `এই ইমেইল ঠিকানাটি ইতোমধ্যে ব্যবহৃত হয়েছে।\nEmail already used by: ${n} (${s})`,
      });
    }
    if (typeof patch.name === "string" && patch.name.length > 0) {
      uniqueChecks.push({
        field: "name", value: patch.name,
        msg: (n, s) => `এই স্টোরের নাম ইতোমধ্যে নিবন্ধিত আছে।\nName already used by: ${n} (${s})`,
      });
    }
    for (const c of uniqueChecks) {
      const { data: dup } = await context.supabase
        .from("tenants")
        .select("id,name,status")
        .eq(c.field, c.value)
        .neq("id", tenantId)
        .neq("status", "rejected")
        .limit(1)
        .maybeSingle();
      if (dup) throw new Error(c.msg(dup.name, STATUS_LABEL[dup.status] ?? dup.status));
    }

    // Mirror tenants (keeps the row searchable)
    const { error } = await context.supabase
      .from("tenants")
      .update({ ...clean, updated_at: new Date().toISOString() })
      .eq("id", tenantId);
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        const m = String(error.message || "");
        if (m.includes("tenants_mobile_unique_active")) throw new Error("এই মোবাইল নম্বরটি ইতোমধ্যে অন্য একটি স্টোরে ব্যবহৃত হয়েছে।");
        if (m.includes("tenants_email_unique_active")) throw new Error("এই ইমেইল ঠিকানাটি ইতোমধ্যে ব্যবহৃত হয়েছে।");
        if (m.includes("tenants_name_unique_active")) throw new Error("এই স্টোরের নাম ইতোমধ্যে নিবন্ধিত আছে।");
        throw new Error("একটি ডুপ্লিকেট এন্ট্রি পাওয়া গেছে। অনুগ্রহ করে ডেটা যাচাই করুন।");
      }
      throw new Error(error.message);
    }

    // Propagate owner-identity fields to profiles + auth.users (source of truth)
    if (patch.owner_name !== undefined || patch.mobile !== undefined || patch.email !== undefined) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: ownerRole } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("role", "owner")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (ownerRole?.user_id) {
        const profilePatch: Record<string, unknown> = {};
        if (patch.owner_name !== undefined) profilePatch.full_name = patch.owner_name;
        if (patch.mobile !== undefined) profilePatch.phone = patch.mobile;
        if (Object.keys(profilePatch).length > 0) {
          await supabaseAdmin.from("profiles")
            .update({ ...profilePatch, updated_at: new Date().toISOString() })
            .eq("id", ownerRole.user_id);
        }
        if (patch.email !== undefined) {
          await supabaseAdmin.auth.admin.updateUserById(ownerRole.user_id, { email: patch.email });
        }
      }
    }

    await context.supabase.from("audit_log").insert({
      tenant_id: tenantId,
      user_id: context.userId,
      action: "store_updated",
      entity_table: "tenants",
      entity_id: tenantId,
      after_data: clean,
    });
    return { ok: true };
  });

export const getStoreStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t = data.tenantId;

    const [branches, members, payments, audit, subHistory] = await Promise.all([
      supabaseAdmin.from("branches")
        .select("id,name,code,is_main,is_active,created_at")
        .eq("tenant_id", t).is("deleted_at", null)
        .order("is_main", { ascending: false }).order("created_at", { ascending: true }),
      supabaseAdmin.from("tenant_members")
        .select("user_id,is_default,created_at")
        .eq("tenant_id", t),
      supabaseAdmin.from("subscription_payments")
        .select("id,amount,currency,method,status,billing_cycle,created_at,reviewed_at")
        .eq("tenant_id", t)
        .order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("audit_log")
        .select("id,action,entity_table,entity_id,user_id,after_data,created_at")
        .eq("tenant_id", t)
        .order("created_at", { ascending: false }).limit(25),
      supabaseAdmin.from("subscriptions")
        .select("id,status,plan_id,trial_ends_at,current_period_start,current_period_end,created_at")
        .eq("tenant_id", t)
        .order("created_at", { ascending: false }).limit(10),
    ]);

    return {
      branches: branches.data ?? [],
      branchCount: branches.data?.length ?? 0,
      userCount: members.data?.length ?? 0,
      members: members.data ?? [],
      payments: payments.data ?? [],
      audit: audit.data ?? [],
      subscriptionHistory: subHistory.data ?? [],
    };
  });
