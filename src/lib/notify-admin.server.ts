// Server-only helper to emit SaaS admin notifications from inside other
// createServerFn handlers / server routes (provisioning, webhooks, security).
// Import dynamically: `const { notifyAdmin } = await import("@/lib/notify-admin.server")`.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminEmitSeverity = "info" | "success" | "warning" | "error";

export type AdminEmitInput = {
  severity: AdminEmitSeverity;
  type: string;
  title: string;
  message?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

export async function notifyAdmin(input: AdminEmitInput): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("notify_admin" as never, {
    _severity: input.severity,
    _type: input.type,
    _title: input.title,
    _message: input.message ?? null,
    _link: input.link ?? null,
    _entity_type: input.entityType ?? null,
    _entity_id: input.entityId ?? null,
    _metadata: input.metadata ?? {},
    _idempotency_key: input.idempotencyKey ?? null,
  } as never);
  if (error) {
    console.error("notifyAdmin failed", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}
