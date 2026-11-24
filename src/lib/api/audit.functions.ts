import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getRequestHeader,
  getRequestIP,
} from "@tanstack/react-start/server";

function parseDeviceBrowser(ua: string | null) {
  if (!ua) return { device: undefined, browser: undefined };
  const browser =
    /edg\//i.test(ua) ? "Edge" :
    /chrome\//i.test(ua) ? "Chrome" :
    /firefox\//i.test(ua) ? "Firefox" :
    /safari\//i.test(ua) ? "Safari" : "Other";
  const device = /mobile/i.test(ua) ? "Mobile" : /tablet/i.test(ua) ? "Tablet" : "Desktop";
  return { device, browser };
}

const EventSchema = z.object({
  tenant_id: z.string().uuid().optional(),
  action: z.string().min(1),
  entity_table: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  before: z.record(z.unknown()).optional(),
  after: z.record(z.unknown()).optional(),
  branch_id: z.string().uuid().optional(),
  user_role: z.string().optional(),
  session_id: z.string().optional(),
});

export const logAuditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => EventSchema.parse(i))
  .handler(async ({ data, context }) => {
    const ua = getRequestHeader("user-agent") ?? undefined;
    const ip = getRequestIP({ xForwardedFor: true }) ?? undefined;
    const { device, browser } = parseDeviceBrowser(ua ?? null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: any = {
      _tenant_id: data.tenant_id,
      _action: data.action,
      _entity_table: data.entity_table,
      _entity_id: data.entity_id,
      _before: data.before,
      _after: data.after,
      _ip: ip,
      _user_agent: ua,
      _device: device,
      _browser: browser,
      _session_id: data.session_id,
      _branch_id: data.branch_id,
      _user_role: data.user_role,
    };
    const { error } = await context.supabase.rpc("audit_log_event", args);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SearchSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  action: z.string().optional(),
  entity_table: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const searchAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SearchSchema.parse(i))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("audit_log")
      .select("*", { count: "exact" })
      .eq("tenant_id", data.tenant_id)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.user_id) q = q.eq("user_id", data.user_id);
    if (data.action) q = q.ilike("action", `${data.action}%`);
    if (data.entity_table) q = q.eq("entity_table", data.entity_table);
    if (data.entity_id) q = q.eq("entity_id", data.entity_id);
    if (data.from_date) q = q.gte("created_at", data.from_date);
    if (data.to_date) q = q.lte("created_at", data.to_date);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    // ip_address (inet) comes back as unknown; coerce to string for serialization
    const safe = (rows ?? []).map((r) => ({
      ...r,
      ip_address: r.ip_address == null ? null : String(r.ip_address),
    }));
    return { rows: safe, total: count ?? 0 };
  });
