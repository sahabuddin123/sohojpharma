// B6.9 — Prescription detail + signed image URL.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

export const Route = createFileRoute("/api/public/v1/prescriptions/$id")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request, params }) => {
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("prescriptions")
          .select("id, customer_id, patient_name, doctor_name, prescription_date, file_kind, image_path, status, notes, ocr_text, created_at")
          .eq("tenant_id", g.key.tenantId).eq("id", params.id).maybeSingle();
        if (error) return jsonError("server_error", error.message, 500);
        if (!data) return jsonError("not_found", "Prescription not found", 404);
        let signed_url: string | null = null;
        if (data.image_path) {
          const s = await supabaseAdmin.storage.from("prescriptions").createSignedUrl(data.image_path, 600);
          signed_url = s.data?.signedUrl ?? null;
        }
        const res = jsonOk({ ...data, signed_url });
        await g.finish(200);
        return res;
      },
    },
  },
});
