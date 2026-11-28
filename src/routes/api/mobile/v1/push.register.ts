// B8.6 — Register an FCM/APNs device token for the authenticated user.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CORS_HEADERS, guard } from "@/lib/public-api/auth";
import { mobileError, mobileOk } from "@/lib/public-api/mobile";

const RegisterPushZ = z.object({
  user_id: z.string().uuid(),
  platform: z.enum(["android", "ios", "web"]),
  token: z.string().trim().min(8).max(512),
  app_version: z.string().trim().max(40).optional(),
  device_model: z.string().trim().max(80).optional(),
});

export const Route = createFileRoute("/api/mobile/v1/push/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const g = await guard(request, "write");
        if (!g.ok) return g.response;

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          await g.finish(400);
          return mobileError("invalid_json", "Body must be JSON", 400, { request });
        }
        const parsed = RegisterPushZ.safeParse(raw);
        if (!parsed.success) {
          await g.finish(400);
          return mobileError("invalid_fields", "valid user_id (UUID), platform, and token required", 400, { request });
        }
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Verify target user actually belongs to the API key's tenant (prevents cross-tenant push hijacking)
        const { data: member } = await supabaseAdmin
          .from("tenant_members")
          .select("user_id")
          .eq("tenant_id", g.key.tenantId)
          .eq("user_id", body.user_id)
          .maybeSingle();
        if (!member) {
          await g.finish(403);
          return mobileError("forbidden", "user_id does not belong to this tenant", 403, { request });
        }

        const { data, error } = await supabaseAdmin
          .from("device_push_tokens")
          .upsert(
            {
              tenant_id: g.key.tenantId,
              user_id: body.user_id,
              platform: body.platform,
              token: body.token,
              app_version: body.app_version ?? null,
              device_model: body.device_model ?? null,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: "user_id,token" },
          )
          .select("id")
          .maybeSingle();

        if (error) {
          await g.finish(500);
          return mobileError("db_error", error.message, 500, { request });
        }
        await g.finish(200);
        return mobileOk({ id: data?.id }, { request, message: "Push token registered" });
      },
    },
  },
});
