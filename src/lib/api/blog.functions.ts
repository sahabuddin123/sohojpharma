import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

export type BlogPostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image: string | null;
  category: string | null;
  tags: string[];
  language: string;
  status: "draft" | "published";
  author_name: string | null;
  reading_minutes: number;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPost = BlogPostSummary & {
  content: string;
  seo_title: string | null;
  seo_description: string | null;
};

const SUMMARY_COLUMNS =
  "id,slug,title,excerpt,cover_image,category,tags,language,status,author_name,reading_minutes,view_count,published_at,created_at,updated_at";
const FULL_COLUMNS = SUMMARY_COLUMNS + ",content,seo_title,seo_description";

function publicClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Public — list published posts (optionally filter). */
export const listPublishedPosts = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({
        language: z.string().optional(),
        category: z.string().optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<BlogPostSummary[]> => {
    const sb = publicClient();
    let q = sb
      .from("blog_posts")
      .select(SUMMARY_COLUMNS)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(data?.limit ?? 24);
    if (data?.language) q = q.eq("language", data.language);
    if (data?.category) q = q.eq("category", data.category);
    if (data?.tag) q = q.contains("tags", [data.tag]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as BlogPostSummary[];
  });

/** Public — fetch one published post by slug. */
export const getPublishedPost = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1) }))
  .handler(async ({ data }): Promise<BlogPost | null> => {
    const sb = publicClient();
    const { data: row, error } = await sb
      .from("blog_posts")
      .select(FULL_COLUMNS)
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    // fire-and-forget view increment (uses service role; RPC is no longer anon-callable)
    if (row) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("increment_blog_view", { _slug: data.slug });
    }
    return (row as unknown as BlogPost) ?? null;
  });

/** Admin — list all posts including drafts. */
export const adminListPosts = createServerFn({ method: "GET" })
  .middleware([requireAppAdmin])
  .handler(async ({ context }): Promise<BlogPostSummary[]> => {
    const { data, error } = await context.supabase
      .from("blog_posts")
      .select(SUMMARY_COLUMNS)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BlogPostSummary[];
  });

/** Admin — load one post for editing. */
export const adminGetPost = createServerFn({ method: "GET" })
  .middleware([requireAppAdmin])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }): Promise<BlogPost | null> => {
    const { data: row, error } = await context.supabase
      .from("blog_posts")
      .select(FULL_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as unknown as BlogPost) ?? null;
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/i, "Slug must be alphanumeric and dashes only"),
  title: z.string().min(1).max(200),
  excerpt: z.string().max(500).optional().nullable(),
  content: z.string().default(""),
  cover_image: z.string().url().optional().nullable().or(z.literal("")),
  category: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().max(40)).default([]),
  language: z.enum(["bn", "en"]).default("bn"),
  status: z.enum(["draft", "published"]).default("draft"),
  author_name: z.string().max(120).optional().nullable(),
  seo_title: z.string().max(200).optional().nullable(),
  seo_description: z.string().max(400).optional().nullable(),
  reading_minutes: z.number().int().min(1).max(120).default(3),
});

export const adminUpsertPost = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator(upsertSchema)
  .handler(async ({ data, context }) => {
    const payload = {
      ...data,
      slug: data.slug.toLowerCase(),
      cover_image: data.cover_image || null,
      author_id: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("blog_posts")
      .upsert(payload, { onConflict: "id" })
      .select("id,slug")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; slug: string };
  });

export const adminDeletePost = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blog_posts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
