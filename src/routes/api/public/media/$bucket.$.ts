import { createFileRoute } from "@tanstack/react-router";

// Serves published website pictures (blog + homepage) from private storage.
// Only these two buckets are reachable; everything else returns 404.
const ALLOWED = new Set(["blog-images", "landing-cms"]);
const PATH_RE = /^[A-Za-z0-9._\-/]{1,300}$/;

async function handle({ params }: { params: { bucket: string; _splat?: string } }) {
  const bucket = params.bucket;
  const path = params._splat ?? "";
  if (!ALLOWED.has(bucket) || !PATH_RE.test(path) || path.includes("..") || path.startsWith("/")) {
    return new Response("Not found", { status: 404 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) return new Response("Not found", { status: 404 });
  const type = data.type && data.type.startsWith("image/") ? data.type : "application/octet-stream";
  return new Response(data, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const Route = createFileRoute("/api/public/media/$bucket/$")({
  server: { handlers: { GET: handle } },
});
