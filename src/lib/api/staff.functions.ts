import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireActiveSubscription } from "@/lib/api/middleware/require-active-subscription";

const TenantOnly = z.object({ tenant_id: z.string().uuid() });

/* ---------- Shifts ---------- */
export const listShifts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => TenantOnly.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("shifts")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("start_time");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ShiftUpsert = z.object({
  tenant_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(80),
  start_time: z.string(),
  end_time: z.string(),
  break_minutes: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const upsertShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => ShiftUpsert.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("shifts")
      .upsert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* ---------- Staff ---------- */
export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({
      branch_id: z.string().uuid().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("staff")
      .select("*")
      .eq("tenant_id", data.tenant_id)
      .order("full_name");
    if (data.branch_id) q = q.eq("branch_id", data.branch_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("full_name", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const StaffUpsert = z.object({
  tenant_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  branch_id: z.string().uuid().nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  shift_id: z.string().uuid().nullable().optional(),
  employee_code: z.string().max(40).optional(),
  full_name: z.string().min(1).max(120),
  designation: z.string().max(80).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional().or(z.literal("")),
  national_id: z.string().max(40).optional(),
  address: z.string().max(500).optional(),
  join_date: z.string().optional(),
  basic_salary: z.number().min(0).default(0),
  allowances: z.number().min(0).default(0),
  status: z.enum(["active", "inactive", "terminated"]).default("active"),
  notes: z.string().max(1000).optional(),
  create_login: z.boolean().optional(),
  password: z.string().min(6).max(128).optional().or(z.literal("")),
  access_role: z.enum(["manager", "pharmacist", "cashier", "staff", "auditor"]).optional(),
});

export const upsertStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => StaffUpsert.parse(i))
  .handler(async ({ data, context }) => {
    const { create_login, password, access_role, ...staffPayload } = data;

    if (create_login) {
      const email = (staffPayload.email ?? "").trim().toLowerCase();
      if (!email) throw new Error("লগইন অ্যাকাউন্ট তৈরি করতে ইমেইল দিন");
      if (!password || password.length < 6) {
        throw new Error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Ensure caller is owner/manager of this tenant or platform admin
      const [{ data: callerRole }, { data: adminRole }, { data: tenantRow }] = await Promise.all([
        supabaseAdmin
          .from("tenant_memberships")
          .select("role")
          .eq("tenant_id", staffPayload.tenant_id)
          .eq("user_id", context.userId)
          .eq("is_active", true)
          .maybeSingle(),
        supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", context.userId)
          .in("role", ["app_admin", "super_admin"])
          .maybeSingle(),
        supabaseAdmin
          .from("tenants")
          .select("owner_user_id")
          .eq("id", staffPayload.tenant_id)
          .maybeSingle(),
      ]);

      const isAuthorized =
        Boolean(adminRole) ||
        tenantRow?.owner_user_id === context.userId ||
        Boolean(callerRole && ["owner", "manager"].includes(callerRole.role));

      if (!isAuthorized) {
        throw new Error("শুধুমাত্র স্টোর Owner বা Manager নতুন স্টাফ লগইন তৈরি করতে পারবেন");
      }
      let staffUserId: string | null = staffPayload.user_id ?? null;

      if (!staffUserId) {
        const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: staffPayload.full_name,
            phone: staffPayload.phone ?? undefined,
          },
        });
        if (cErr) {
          if (/already|registered|exists|duplicate/i.test(cErr.message)) {
            const { data: list, error: lErr } = await supabaseAdmin.auth.admin.listUsers({
              page: 1,
              perPage: 200,
            });
            if (lErr) throw new Error(lErr.message);
            const found = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
            if (!found) throw new Error(cErr.message);
            staffUserId = found.id;
            await supabaseAdmin.auth.admin.updateUserById(staffUserId, { password });
          } else {
            throw new Error(cErr.message);
          }
        } else {
          staffUserId = created.user?.id ?? null;
        }
      } else {
        await supabaseAdmin.auth.admin.updateUserById(staffUserId, { password });
      }

      if (staffUserId) {
        const role = access_role ?? "cashier";
        const { error: mErr } = await supabaseAdmin
          .from("tenant_memberships")
          .upsert(
            {
              tenant_id: staffPayload.tenant_id,
              user_id: staffUserId,
              role,
              is_active: true,
            },
            { onConflict: "tenant_id,user_id" },
          );
        if (mErr) throw new Error(mErr.message);
        staffPayload.user_id = staffUserId;
      }
    }

    const { data: row, error } = await context.supabase
      .from("staff")
      .upsert(staffPayload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("staff").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Attendance ---------- */
export const listAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) =>
    TenantOnly.extend({
      from_date: z.string(),
      to_date: z.string(),
      staff_id: z.string().uuid().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("attendance")
      .select("*, staff:staff_id(full_name, employee_code)")
      .eq("tenant_id", data.tenant_id)
      .gte("attendance_date", data.from_date)
      .lte("attendance_date", data.to_date)
      .order("attendance_date", { ascending: false });
    if (data.staff_id) q = q.eq("staff_id", data.staff_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const AttendanceUpsert = z.object({
  tenant_id: z.string().uuid(),
  id: z.string().uuid().optional(),
  staff_id: z.string().uuid(),
  attendance_date: z.string(),
  check_in: z.string().nullable().optional(),
  check_out: z.string().nullable().optional(),
  status: z.enum(["present", "absent", "late", "leave", "half_day"]).default("present"),
  worked_minutes: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(500).optional(),
});

export const upsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) => AttendanceUpsert.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("attendance")
      .upsert(data, { onConflict: "staff_id,attendance_date" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const checkInStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) =>
    z.object({ tenant_id: z.string().uuid(), staff_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await context.supabase
      .from("attendance")
      .upsert(
        {
          tenant_id: data.tenant_id,
          staff_id: data.staff_id,
          attendance_date: today,
          check_in: new Date().toISOString(),
          status: "present",
        },
        { onConflict: "staff_id,attendance_date" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const checkOutStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireActiveSubscription])
  .inputValidator((i: unknown) =>
    z.object({ tenant_id: z.string().uuid(), staff_id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const { data: existing } = await context.supabase
      .from("attendance")
      .select("check_in")
      .eq("staff_id", data.staff_id)
      .eq("attendance_date", today)
      .maybeSingle();
    const worked = existing?.check_in
      ? Math.max(0, Math.round((new Date(now).getTime() - new Date(existing.check_in).getTime()) / 60000))
      : null;
    const { data: row, error } = await context.supabase
      .from("attendance")
      .upsert(
        {
          tenant_id: data.tenant_id,
          staff_id: data.staff_id,
          attendance_date: today,
          check_out: now,
          worked_minutes: worked,
        },
        { onConflict: "staff_id,attendance_date" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
