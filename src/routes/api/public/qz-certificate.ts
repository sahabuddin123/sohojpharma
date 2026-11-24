// GET /api/public/qz-certificate — serves PEM byte-for-byte from qz_credentials.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/qz-certificate")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabaseAdmin as any;
        const { data, error } = await sb
          .from("qz_credentials")
          .select("certificate")
          .eq("id", 1)
          .maybeSingle();
        if (error || !data?.certificate) {
          return new Response("not configured", { status: 404 });
        }
        return new Response(data.certificate as string, {
          status: 200,
          headers: {
            "content-type": "application/x-pem-file",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
