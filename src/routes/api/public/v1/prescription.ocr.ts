// B12.17 — Public API: POST /prescription/ocr — persist OCR result for an image.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";

export const Route = createFileRoute("/api/public/v1/prescription/ocr")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => {
        const g = await guard(request, "write", 30);
        if (!g.ok) return g.response;
        type Body = {
          image_url?: string | null; source?: "camera"|"upload"|"pdf"|"mobile";
          provider?: "gemini"|"google_vision"|"azure"|"manual"; language?: string;
          raw_text?: string | null; parsed_json?: Record<string, unknown>;
          detected_medicines?: unknown[]; matched_medicines?: unknown[]; warnings?: unknown[];
          confidence?: number; doctor_id?: string | null; patient_id?: string | null;
          status?: "queued"|"processing"|"completed"|"failed"|"review_required";
        };
        let body: Body;
        try { body = (await request.json()) as Body; } catch { return jsonError("invalid_request", "Invalid JSON", 400); }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("prescription_ocr_jobs")
          .insert({
            tenant_id: g.key.tenantId,
            image_url: body.image_url ?? null,
            source: body.source ?? "upload",
            provider: body.provider ?? "gemini",
            language: body.language ?? "en",
            raw_text: body.raw_text ?? null,
            parsed_json: (body.parsed_json ?? {}) as never,
            detected_medicines: (body.detected_medicines ?? []) as never,
            matched_medicines: (body.matched_medicines ?? []) as never,
            warnings: (body.warnings ?? []) as never,
            confidence: Number(body.confidence ?? 0),
            doctor_id: body.doctor_id ?? null,
            patient_id: body.patient_id ?? null,
            status: body.status ?? "completed",
          })
          .select("id, confidence, pharmacist_review_status, status")
          .single();
        if (error || !data) return jsonError("server_error", error?.message ?? "insert failed", 500);
        const res = jsonOk({ data }, 201);
        await g.finish(201);
        return res;
      },
    },
  },
});
