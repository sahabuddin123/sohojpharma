// Server-only helper for emitting notifications from inside other
// createServerFn handlers (procurement, sales, accounting, system).
// Import dynamically: `const { emitNotification } = await import("@/lib/notify.server")`.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EmitSeverity = "info" | "success" | "warning" | "error";

export type EmitInput = {
  tenantId: string;
  severity: EmitSeverity;
  kind: string; // category, e.g. "po_approved", "large_sale", "import_failed"
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown>;
};

export async function emitNotification(input: EmitInput): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc(
    "notify_tenant_v2" as never,
    {
      _tenant_id: input.tenantId,
      _severity: input.severity,
      _kind: input.kind,
      _title: input.title,
      _body: input.body ?? null,
      _link: input.link ?? null,
      _entity_type: input.entityType ?? null,
      _entity_id: input.entityId ?? null,
      _data: input.data ?? {},
    } as never,
  );
  if (error) {
    console.error("emitNotification failed", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
