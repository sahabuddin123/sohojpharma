// B8.8 — Prescription OCR contract. AI is NOT wired in yet; this endpoint
// stores the upload reference and returns a stable response shape so the
// Flutter / Android client can be built and tested against it today.
import { createFileRoute } from "@tanstack/react-router";
import { CORS_HEADERS, guard } from "@/lib/public-api/auth";
import { mobileError, mobileOk } from "@/lib/public-api/mobile";

export const Route = createFileRoute("/api/mobile/v1/prescription/analyze")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
      POST: async ({ request }) => {
        const g = await guard(request, "write");
        if (!g.ok) return g.response;

        let body: { image_url?: string; patient_id?: string; doctor_id?: string; notes?: string };
        try {
          body = await request.json();
        } catch {
          await g.finish(400);
          return mobileError("invalid_json", "Body must be JSON", 400, { request });
        }
        if (!body.image_url) {
          await g.finish(400);
          return mobileError("missing_image", "image_url is required", 400, { request });
        }

        await g.finish(202);
        return mobileOk(
          {
            status: "pending_ocr",
            confidence: null as number | null,
            detected_medicines: [] as Array<{
              brand_name: string;
              generic_name?: string;
              strength?: string;
              dosage?: string;
              confidence: number;
            }>,
            image_url: body.image_url,
            patient_id: body.patient_id ?? null,
            doctor_id: body.doctor_id ?? null,
            notes: body.notes ?? null,
            engine: "stub",
            processed_at: null,
          },
          {
            request,
            status: 202,
            message: "OCR queued — contract stub. AI engine not wired yet.",
          },
        );
      },
    },
  },
});
