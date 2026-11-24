// B8.7 — File upload: return a signed upload URL into the prescriptions
// bucket so mobile clients can PUT the binary directly to storage without
// streaming it through the Worker.
import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, guard } from "@/lib/public-api/auth";
import { mobileError, mobileOk } from "@/lib/public-api/mobile";

const ALLOWED_KIND = new Set(["prescription", "medicine_photo", "document", "invoice", "profile_photo"]);

export const Route = createFileRoute("/api/mobile/v1/upload")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const g = await guard(request, "write");
        if (!g.ok) return g.response;

        let body: { kind?: string; filename?: string; content_type?: string };
        try {
          body = await request.json();
        } catch {
          await g.finish(400);
          return mobileError("invalid_json", "Body must be JSON", 400, { request });
        }
        const kind = body.kind ?? "";
        if (!ALLOWED_KIND.has(kind)) {
          await g.finish(400);
          return mobileError("invalid_kind", `kind must be one of ${[...ALLOWED_KIND].join(", ")}`, 400, { request });
        }
        const filename = (body.filename ?? "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
        const objectPath = `${g.key.tenantId}/${kind}/${Date.now()}-${crypto.randomUUID()}-${filename}`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .storage
          .from("prescriptions")
          .createSignedUploadUrl(objectPath);
        if (error || !data) {
          await g.finish(500);
          return mobileError("upload_url_failed", error?.message ?? "could not create upload url", 500, { request });
        }
        await g.finish(200);
        return mobileOk(
          {
            bucket: "prescriptions",
            path: data.path,
            upload_url: data.signedUrl,
            token: data.token,
            expires_in: 3600,
            content_type_hint: body.content_type ?? "application/octet-stream",
          },
          { request, message: "Signed upload URL issued (PUT the binary directly)" },
        );
      },
    },
  },
});
