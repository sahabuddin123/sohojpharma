// B6.9 — Prescription upload, list, detail.
import { createFileRoute } from "@tanstack/react-router";
import { guard, jsonError, jsonOk, preflight } from "@/lib/public-api/auth";
import { verifySafeUploadBytes } from "@/lib/security/upload-validation.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/v1/prescriptions")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => {
        const g = await guard(request, "read");
        if (!g.ok) return g.response;
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, count, error } = await supabaseAdmin
          .from("prescriptions")
          .select("id, customer_id, patient_name, doctor_name, file_kind, status, image_path, created_at", { count: "exact" })
          .eq("tenant_id", g.key.tenantId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) return jsonError("server_error", error.message, 500);
        const res = jsonOk({ data: data ?? [], total: count ?? 0, limit, offset });
        await g.finish(200);
        return res;
      },
      // Upload: multipart/form-data with fields: file, customer_id?, patient_name?, doctor_name?, notes?
      POST: async ({ request }) => {
        const g = await guard(request, "write", 30);
        if (!g.ok) return g.response;
        let form: FormData;
        try { form = await request.formData(); }
        catch { return jsonError("invalid_request", "Expected multipart/form-data", 400); }
        const file = form.get("file");
        if (!(file instanceof File)) return jsonError("invalid_request", "file is required", 400);
        if (file.size === 0 || file.size > 10 * 1024 * 1024) {
          return jsonError("invalid_request", "file must be between 1 byte and 10MB", 400);
        }

        const branchId = String(form.get("branch_id") || "").trim();
        if (!UUID_RE.test(branchId)) {
          return jsonError("invalid_request", "valid branch_id is required", 400);
        }
        const customerIdRaw = String(form.get("customer_id") || "").trim();
        if (customerIdRaw && !UUID_RE.test(customerIdRaw)) {
          return jsonError("invalid_request", "invalid customer_id", 400);
        }

        const buf = new Uint8Array(await file.arrayBuffer());
        let verified: ReturnType<typeof verifySafeUploadBytes>;
        try {
          verified = verifySafeUploadBytes(buf, file.type);
        } catch (err) {
          return jsonError("invalid_request", err instanceof Error ? err.message : "Unsupported file type", 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: branchRow } = await supabaseAdmin
          .from("branches")
          .select("id")
          .eq("id", branchId)
          .eq("tenant_id", g.key.tenantId)
          .maybeSingle();
        if (!branchRow) return jsonError("forbidden", "Invalid branch_id for this tenant", 403);

        if (customerIdRaw) {
          const { data: custRow } = await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("id", customerIdRaw)
            .eq("tenant_id", g.key.tenantId)
            .maybeSingle();
          if (!custRow) return jsonError("forbidden", "Invalid customer_id for this tenant", 403);
        }

        const path = `${g.key.tenantId}/${crypto.randomUUID()}.${verified.ext}`;
        const up = await supabaseAdmin.storage.from("prescriptions").upload(path, buf, {
          contentType: verified.contentType,
        });
        if (up.error) return jsonError("server_error", up.error.message, 500);

        const { data, error } = await supabaseAdmin
          .from("prescriptions")
          .insert({
            tenant_id: g.key.tenantId,
            branch_id: branchId,
            customer_id: customerIdRaw || null,
            patient_name: (form.get("patient_name") as string)?.slice(0, 120) || null,
            doctor_name: (form.get("doctor_name") as string)?.slice(0, 120) || null,
            notes: (form.get("notes") as string)?.slice(0, 1000) || null,
            image_path: path,
            file_kind: verified.fileKind,
          })
          .select("id, image_path, status")
          .single();
        if (error || !data) return jsonError("server_error", error?.message ?? "Insert failed", 500);
        const res = jsonOk({ prescription_id: data.id, image_path: data.image_path, status: data.status }, 201);
        await g.finish(201);
        return res;
      },
    },
  },
});
