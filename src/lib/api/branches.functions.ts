import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BRANCH_ROLES = ["head_office", "branch", "sub_branch"] as const;
const WRITE_ROLES = ["owner", "corporate_admin"] as const;
const BRANCH_WRITE_ROLES = ["owner", "corporate_admin", "manager"] as const;
const MEMBER_ROLES = ["manager", "pharmacist", "cashier", "auditor"] as const;

export type BranchRole = (typeof BRANCH_ROLES)[number];

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function assertMember(ctx: Ctx, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function getRole(ctx: Ctx, tenant_id: string): Promise<string | null> {
  for (const r of ["owner", "corporate_admin", "manager", "auditor", "pharmacist", "cashier"]) {
    const { data } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (data) return r;
  }
  return null;
}

async function assertWrite(ctx: Ctx, tenant_id: string) {
  for (const r of WRITE_ROLES) {
    const { data } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (data) return r;
  }
  throw new Error("Forbidden: owner or corporate_admin required");
}

async function assertBranchWrite(ctx: Ctx, tenant_id: string, branch_id: string) {
  for (const r of WRITE_ROLES) {
    const { data } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (data) return r;
  }
  // manager only with branch access
  const { data: isManager } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId, _tenant_id: tenant_id, _role: "manager",
  });
  if (isManager) {
    const { data: hasAccess } = await ctx.supabase.rpc("has_branch_access", {
      _user: ctx.userId, _branch: branch_id,
    });
    if (hasAccess) return "manager";
  }
  throw new Error("Forbidden: no write access to this branch");
}

async function audit(
  ctx: Ctx,
  tenant_id: string,
  action: string,
  entity_id: string,
  before: unknown,
  after: unknown,
  branch_id?: string | null,
) {
  await ctx.supabase.rpc("audit_log_event", {
    _tenant_id: tenant_id,
    _action: action,
    _entity_table: "branches",
    _entity_id: entity_id,
    _before: before as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    _after: after as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    _branch_id: branch_id ?? null,
  });
}

function parsePlanLimitError(err: { message?: string } | null | undefined): {
  code: "PLAN_LIMIT_BRANCHES"; limit: number;
} | null {
  const msg = err?.message ?? "";
  if (!msg.includes("plan_limit_exceeded")) return null;
  const m = msg.match(/"limit":\s*(\d+)/);
  return { code: "PLAN_LIMIT_BRANCHES", limit: m ? Number(m[1]) : 0 };
}

/* ------------------------------ List branches ------------------------------ */

export type BranchRow = {
  id: string;
  code: string;
  name: string;
  branch_role: BranchRole;
  parent_branch_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_main: boolean;
  is_active: boolean;
  member_count: number;
};

export const listBranches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BranchRow[]> => {
    await assertMember(context, data.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("branches")
      .select("id, code, name, branch_role, parent_branch_id, phone, email, address, is_main, is_active")
      .eq("tenant_id", data.tenant_id)
      .is("deleted_at", null)
      .order("is_main", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    // Member counts (best-effort): default_branch_id assigned members
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: m } = await context.supabase
        .from("tenant_members")
        .select("default_branch_id")
        .eq("tenant_id", data.tenant_id)
        .in("default_branch_id", ids);
      for (const r of (m ?? []) as { default_branch_id: string }[]) {
        counts.set(r.default_branch_id, (counts.get(r.default_branch_id) ?? 0) + 1);
      }
    }
    return ((rows ?? []) as Omit<BranchRow, "member_count">[]).map((r) => ({
      ...r, member_count: counts.get(r.id) ?? 0,
    }));
  });

/* ------------------------------ Create branch ------------------------------ */

const CreateBranchInput = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(32),
  branch_role: z.enum(BRANCH_ROLES),
  parent_branch_id: z.string().uuid().nullable().optional(),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
});

export const createBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateBranchInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertWrite(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("branches")
      .insert({
        tenant_id: data.tenant_id,
        name: data.name,
        code: data.code,
        branch_role: data.branch_role,
        parent_branch_id: data.parent_branch_id ?? null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        is_main: data.branch_role === "head_office",
      })
      .select("*")
      .single();
    if (error) {
      const limit = parsePlanLimitError(error);
      if (limit) throw new Error(JSON.stringify(limit));
      throw new Error(error.message);
    }
    await audit(context, data.tenant_id, "branch.created", row.id, null, row, row.id);
    return row;
  });

/* ------------------------------ Update branch ------------------------------ */

const UpdateBranchInput = z.object({
  branch_id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    branch_role: z.enum(BRANCH_ROLES).optional(),
    parent_branch_id: z.string().uuid().nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z.string().trim().email().max(160).nullable().optional(),
    address: z.string().trim().max(500).nullable().optional(),
  }),
});

export const updateBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateBranchInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: before, error: be } = await context.supabase
      .from("branches").select("*").eq("id", data.branch_id).maybeSingle();
    if (be) throw new Error(be.message);
    if (!before) throw new Error("Not found");
    await assertWrite(context, before.tenant_id);

    const { data: row, error } = await context.supabase
      .from("branches").update(data.patch).eq("id", data.branch_id).select("*").single();
    if (error) throw new Error(error.message);
    await audit(context, before.tenant_id, "branch.updated", row.id, before, row, row.id);
    return row;
  });

export const setBranchActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    branch_id: z.string().uuid(), is_active: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: before } = await context.supabase
      .from("branches").select("*").eq("id", data.branch_id).maybeSingle();
    if (!before) throw new Error("Not found");
    await assertWrite(context, before.tenant_id);
    const { data: row, error } = await context.supabase
      .from("branches").update({ is_active: data.is_active }).eq("id", data.branch_id).select("*").single();
    if (error) throw new Error(error.message);
    await audit(
      context, before.tenant_id,
      data.is_active ? "branch.enabled" : "branch.disabled",
      row.id, before, row, row.id,
    );
    return row;
  });

/* ------------------------------ Branch settings ------------------------------ */

export type BranchSettingsRow = {
  branch_id: string;
  tenant_id: string;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  invoice_prefix: string | null;
  receipt_footer: string | null;
  low_stock_threshold: number;
  expiry_alert_days: number;
  printer_settings: Record<string, string | number | boolean | null>;
  pos_settings: Record<string, string | number | boolean | null>;
};

export const getBranchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ branch_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BranchSettingsRow | null> => {
    const { data: br } = await context.supabase
      .from("branches").select("tenant_id").eq("id", data.branch_id).maybeSingle();
    if (!br) throw new Error("Branch not found");
    await assertMember(context, br.tenant_id);
    const { data: row, error } = await context.supabase
      .from("branch_settings").select("*").eq("branch_id", data.branch_id).maybeSingle();
    if (error) throw new Error(error.message);
    return row as BranchSettingsRow | null;
  });

const SettingsPatch = z.object({
  address: z.string().max(500).nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  contact_email: z.string().email().max(160).nullable().optional().or(z.literal("")),
  invoice_prefix: z.string().max(16).nullable().optional(),
  receipt_footer: z.string().max(500).nullable().optional(),
  low_stock_threshold: z.number().int().min(0).max(100000).optional(),
  expiry_alert_days: z.number().int().min(0).max(3650).optional(),
  printer_settings: z.record(z.unknown()).optional(),
  pos_settings: z.record(z.unknown()).optional(),
});

export const upsertBranchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    branch_id: z.string().uuid(),
    patch: SettingsPatch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<BranchSettingsRow> => {
    const { data: br } = await context.supabase
      .from("branches").select("tenant_id").eq("id", data.branch_id).maybeSingle();
    if (!br) throw new Error("Branch not found");
    await assertBranchWrite(context, br.tenant_id, data.branch_id);

    const { data: before } = await context.supabase
      .from("branch_settings").select("*").eq("branch_id", data.branch_id).maybeSingle();

    const payload = {
      tenant_id: br.tenant_id,
      branch_id: data.branch_id,
      ...data.patch,
      contact_email: data.patch.contact_email === "" ? null : data.patch.contact_email,
    };
    const { data: row, error } = await context.supabase
      .from("branch_settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: "branch_id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    await audit(context, br.tenant_id, "branch.settings_updated", row.id, before, row, data.branch_id);
    return row as BranchSettingsRow;
  });

/* ------------------------------ Branch members ------------------------------ */

export type BranchMemberRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  is_default_branch: boolean;
};

export const listBranchMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ branch_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BranchMemberRow[]> => {
    const { data: br } = await context.supabase
      .from("branches").select("tenant_id").eq("id", data.branch_id).maybeSingle();
    if (!br) throw new Error("Branch not found");
    await assertMember(context, br.tenant_id);

    const { data: members } = await context.supabase
      .from("tenant_members")
      .select("user_id, default_branch_id")
      .eq("tenant_id", br.tenant_id);

    const rows = (members ?? []) as { user_id: string; default_branch_id: string | null }[];
    const userIds = rows.map((r) => r.user_id);
    const profiles = userIds.length === 0 ? [] : (await context.supabase
      .from("profiles").select("id, full_name").in("id", userIds)).data ?? [];
    const profMap = new Map<string, { full_name: string | null }>();
    for (const p of profiles as unknown as { id: string; full_name: string | null }[]) {
      profMap.set(p.id, { full_name: p.full_name });
    }

    const result: BranchMemberRow[] = [];
    for (const r of rows) {
      if (r.default_branch_id !== data.branch_id) continue;
      const p = profMap.get(r.user_id) ?? { full_name: null };
      let role: string | null = null;
      for (const candidate of MEMBER_ROLES) {
        const { data: ok } = await context.supabase.rpc("has_role", {
          _user_id: r.user_id, _tenant_id: br.tenant_id, _role: candidate,
        });
        if (ok) { role = candidate; break; }
      }
      result.push({ user_id: r.user_id, email: null, full_name: p.full_name, role, is_default_branch: true });
    }
    return result;
  });

export const listAssignableMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const { data: members } = await context.supabase
      .from("tenant_members")
      .select("user_id, default_branch_id")
      .eq("tenant_id", data.tenant_id);
    const rows = (members ?? []) as { user_id: string; default_branch_id: string | null }[];
    if (rows.length === 0) return [];
    const { data: profiles } = await context.supabase
      .from("profiles").select("id, full_name").in("id", rows.map((r) => r.user_id));
    const profList = (profiles ?? []) as unknown as { id: string; full_name: string | null }[];
    return rows.map((r) => {
      const p = profList.find((x) => x.id === r.user_id);
      return {
        user_id: r.user_id,
        email: null as string | null,
        full_name: p?.full_name ?? null,
        default_branch_id: r.default_branch_id,
      };
    });
  });

export const assignMemberDefaultBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    user_id: z.string().uuid(),
    branch_id: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertWrite(context, data.tenant_id);
    const { data: before } = await context.supabase
      .from("tenant_members").select("default_branch_id")
      .eq("tenant_id", data.tenant_id).eq("user_id", data.user_id).maybeSingle();
    const { error } = await context.supabase
      .from("tenant_members")
      .update({ default_branch_id: data.branch_id })
      .eq("tenant_id", data.tenant_id).eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    await audit(
      context, data.tenant_id,
      data.branch_id ? "branch.member_assigned" : "branch.member_removed",
      data.user_id,
      { default_branch_id: before?.default_branch_id ?? null },
      { default_branch_id: data.branch_id },
      data.branch_id,
    );
    return { ok: true };
  });

/* ------------------------------ Audit ------------------------------ */

export const listBranchAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ branch_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: br } = await context.supabase
      .from("branches").select("tenant_id").eq("id", data.branch_id).maybeSingle();
    if (!br) throw new Error("Branch not found");
    await assertMember(context, br.tenant_id);
    const { data: rows, error } = await context.supabase
      .from("audit_log")
      .select("id, action, created_at, before_data, after_data, user_id")
      .eq("tenant_id", br.tenant_id)
      .or(`entity_id.eq.${data.branch_id},branch_id.eq.${data.branch_id}`)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ------------------------------ Plan limit info ------------------------------ */

export const getBranchPlanInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context, data.tenant_id);
    const role = await getRole(context, data.tenant_id);
    const { data: sub } = await context.supabase
      .from("subscriptions").select("plan_id, plans(code, name, max_branches)")
      .eq("tenant_id", data.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const plan = (sub?.plans ?? null) as { code: string; name: string; max_branches: number | null } | null;
    const { count } = await context.supabase
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", data.tenant_id).is("deleted_at", null);
    return {
      plan_code: plan?.code ?? null,
      plan_name: plan?.name ?? null,
      max_branches: plan?.max_branches ?? null,
      current_count: count ?? 0,
      role,
      can_create: role === "owner" || role === "corporate_admin",
    };
  });
