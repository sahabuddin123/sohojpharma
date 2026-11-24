// B8.6 — Register an FCM/APNs device token for the authenticated user.
import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, guard } from "@/lib/public-api/auth";
import { mobileError, mobileOk } from "@/lib/public-api/mobile";

export const Route = createFileRoute("/api/mobile/v1/push/register")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const g = await guard(request, "write");
        if (!g.ok) return g.response;

        let body: {
          user_id?: string;
          platform?: "android" | "ios" | "web";
          token?: string;
          app_version?: string;
          device_model?: string;
        };
        try {
          body = await request.json();
        } catch {
          await g.finish(400);
          return mobileError("invalid_json", "Body must be JSON", 400, { request });
        }
        if (!body.user_id || !body.platform || !body.token) {
          await g.finish(400);
          return mobileError("missing_fields", "user_id, platform, token required", 400, { request });
        }
        if (!["android", "ios", "web"].includes(body.platform)) {
          await g.finish(400);
          return mobileError("invalid_platform", "platform must be android|ios|web", 400, { request });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
