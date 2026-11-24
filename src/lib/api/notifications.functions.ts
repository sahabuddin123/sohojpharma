import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export type NotificationItem = {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read: boolean;
  archived: boolean;
};

export type NotificationsPayload = {
  unread: number;
  items: NotificationItem[];
};

const TenantInput = z.object({ tenant_id: z.string().uuid() });

function toItem(n: Record<string, unknown>): NotificationItem {
  return {
    id: n.id as string,
    type: (n.type as string) ?? "info",
    severity: ((n.severity as string) ?? "info") as NotificationSeverity,
    title: n.title as string,
    body: (n.body as string | null) ?? null,
    link: (n.link as string | null) ?? null,
    entity_type: (n.entity_type as string | null) ?? null,
    entity_id: (n.entity_id as string | null) ?? null,
    created_at: n.created_at as string,
    read: n.read_at != null,
    archived: n.archived_at != null,
  };
}

export const getNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TenantInput.parse(i))
  .handler(async ({ data, context }): Promise<NotificationsPayload> => {
    const sb = context.supabase;
    const [recent, unread] = await Promise.all([
      sb.from("notifications")
        .select("id, type, severity, title, body, link, entity_type, entity_id, created_at, read_at, archived_at")
        .eq("tenant_id", data.tenant_id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
      sb.rpc("unread_notifications_count" as never, { _tenant_id: data.tenant_id } as never),
    ]);
    if (recent.error) throw new Error(recent.error.message);
    const items = ((recent.data ?? []) as Record<string, unknown>[]).map(toItem);
    const unreadVal = (unread as { data?: unknown }).data;
    const unreadCount = typeof unreadVal === "number" ? unreadVal : 0;
    return { unread: unreadCount, items };
  });

const MarkInput = z.object({ ids: z.array(z.string().uuid()).min(1) });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MarkInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "mark_notifications_read" as never,
      { _ids: data.ids } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TenantInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "mark_all_notifications_read" as never,
      { _tenant_id: data.tenant_id } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MarkInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "archive_notifications" as never,
      { _ids: data.ids } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MarkInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "delete_notifications" as never,
      { _ids: data.ids } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CenterInput = z.object({
  tenant_id: z.string().uuid(),
  status: z.enum(["all", "unread", "read", "archived"]).default("all"),
  severity: z.enum(["all", "info", "success", "warning", "error"]).default("all"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

export type CenterPayload = {
  items: NotificationItem[];
  total: number;
  unread: number;
};

export const listNotificationCenter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CenterInput.parse(i))
  .handler(async ({ data, context }): Promise<CenterPayload> => {
    const sb = context.supabase;
    const offset = (data.page - 1) * data.page_size;
    let q = sb.from("notifications")
      .select("id, type, severity, title, body, link, entity_type, entity_id, created_at, read_at, archived_at", { count: "exact" })
      .eq("tenant_id", data.tenant_id);
    if (data.status === "unread") q = q.is("read_at", null).is("archived_at", null);
    else if (data.status === "read") q = q.not("read_at", "is", null).is("archived_at", null);
    else if (data.status === "archived") q = q.not("archived_at", "is", null);
    else q = q.is("archived_at", null);
    if (data.severity !== "all") q = q.eq("severity", data.severity);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    q = q.order("created_at", { ascending: false }).range(offset, offset + data.page_size - 1);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    const unread = await sb.rpc("unread_notifications_count" as never, { _tenant_id: data.tenant_id } as never);
    const unreadVal = (unread as { data?: unknown }).data;
    return {
      items: ((rows ?? []) as Record<string, unknown>[]).map(toItem),
      total: count ?? 0,
      unread: typeof unreadVal === "number" ? unreadVal : 0,
    };
  });

// ---- Legacy-compatible exports used by /alerts page ----

export type LegacyNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const ListInput = z.object({
  tenant_id: z.string().uuid(),
  unread_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const listMyNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInput.parse(i))
  .handler(async ({ data, context }): Promise<LegacyNotificationRow[]> => {
    let q = context.supabase.from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("tenant_id", data.tenant_id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.unread_only) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as LegacyNotificationRow[];
  });

const MarkOneInput = z.object({ id: z.string().uuid() });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => MarkOneInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "mark_notifications_read" as never,
      { _ids: [data.id] } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
