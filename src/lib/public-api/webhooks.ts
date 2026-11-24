// B6.10 — Webhook dispatcher. Best-effort, fire-and-forget; logs delivery.
import { createHmac } from "node:crypto";

export async function dispatchWebhook(tenantId: string, event: string, payload: Record<string, unknown>) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: hooks } = await supabaseAdmin
      .from("webhooks")
      .select("id, url, secret, events")
      .eq("tenant_id", tenantId)
      .eq("active", true);
    if (!hooks?.length) return;

    const body = JSON.stringify({ event, tenant_id: tenantId, data: payload, at: new Date().toISOString() });
    await Promise.allSettled(
      hooks
        .filter((h) => !h.events?.length || h.events.includes(event))
        .map(async (h) => {
          const t0 = Date.now();
          let status = 0;
          try {
            const sig = h.secret ? createHmac("sha256", h.secret).update(body).digest("hex") : "";
            const r = await fetch(h.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-SohojPharma-Event": event,
                ...(sig ? { "X-SohojPharma-Signature": sig } : {}),
              },
              body,
              signal: AbortSignal.timeout(8000),
            });
            status = r.status;
          } catch {
            status = 0;
          }
          await supabaseAdmin.from("webhook_deliveries").insert({
            webhook_id: h.id,
            tenant_id: tenantId,
            event,
            status_code: status,
            latency_ms: Date.now() - t0,
          });
        }),
    );
  } catch {
    // never throw from dispatcher
  }
}
