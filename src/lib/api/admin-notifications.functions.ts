import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminNotificationSeverity = "info" | "success" | "warning" | "error";

export type AdminNotificationItem = {
  id: string;
  type: string;
  severity: AdminNotificationSeverity;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read: boolean;
  archived: boolean;
};

export type AdminCenterPayload = {
  items: AdminNotificationItem[];
  total: number;
  unread: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAppAdmin(context: any) {
  const { data } = await context.supabase.rpc("is_app_admin", { _user_id: context.userId });
  if (!data) throw new Error("Forbidden");
}

function toItem(n: Record<string, unknown>): AdminNotificationItem {
  return {
    id: n.id as string,
    type: (n.type as string) ?? "info",
    severity: ((n.severity as string) ?? "info") as AdminNotificationSeverity,
    title: n.title as string,
    body: (n.message as string | null) ?? null,
    link: (n.link as string | null) ?? null,
    entity_type: (n.entity_type as string | null) ?? null,
    entity_id: (n.entity_id as string | null) ?? null,
    created_at: n.created_at as string,
    read: n.read_at != null,
    archived: n.archived_at != null,
  };
}

const CenterInput = z.object({
  status: z.enum(["all", "unread", "read", "archived"]).default("all"),
  severity: z.enum(["all", "info", "success", "warning", "error"]).default("all"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(20),
});

export const listAdminNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CenterInput.parse(i))
  .handler(async ({ data, context }): Promise<AdminCenterPayload> => {
    await assertAppAdmin(context);
    const sb = context.supabase;
    const offset = (data.page - 1) * data.page_size;
    let q = sb
      .from("admin_notifications" as never)
      .select(
        "id, type, severity, title, message, link, entity_type, entity_id, created_at, read_at, archived_at",
        { count: "exact" },
      );
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
    const unread = await sb.rpc("unread_admin_notifications_count" as never, {} as never);
    const unreadVal = (unread as { data?: unknown }).data;
    return {
      items: ((rows ?? []) as Record<string, unknown>[]).map(toItem),
      total: count ?? 0,
      unread: typeof unreadVal === "number" ? unreadVal : Number(unreadVal ?? 0),
    };
  });

export const getAdminNotificationsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context);
    const sb = context.supabase;
    const [recent, unread] = await Promise.all([
      sb
        .from("admin_notifications" as never)
        .select(
          "id, type, severity, title, message, link, entity_type, entity_id, created_at, read_at, archived_at",
        )
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
      sb.rpc("unread_admin_notifications_count" as never, {} as never),
    ]);
    if (recent.error) throw new Error(recent.error.message);
    const items = ((recent.data ?? []) as Record<string, unknown>[]).map(toItem);
    const unreadVal = (unread as { data?: unknown }).data;
    return {
      items,
      unread: typeof unreadVal === "number" ? unreadVal : Number(unreadVal ?? 0),
    };
  });

const IdsInput = z.object({ ids: z.array(z.string().uuid()).min(1) });

export const markAdminNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdsInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { error } = await context.supabase.rpc(
      "mark_admin_notifications_read" as never,
      { _ids: data.ids } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllAdminNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAppAdmin(context);
    const { error } = await context.supabase.rpc(
      "mark_all_admin_notifications_read" as never,
      {} as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveAdminNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdsInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { error } = await context.supabase.rpc(
      "archive_admin_notifications" as never,
      { _ids: data.ids } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAdminNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => IdsInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAppAdmin(context);
    const { error } = await context.supabase
      .from("admin_notifications" as never)
      .delete()
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
