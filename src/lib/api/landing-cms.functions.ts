import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

export type LandingCmsPayload = {
  content_en: string;
  content_bn: string;
  updated_at: string | null;
};

/**
 * Fetch landing CMS content. Public — no auth required.
 * Returns the JSON content as strings for safe serialization across boundaries.
 */
export const getLandingCms = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingCmsPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_landing_cms");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      content_en: JSON.stringify(row?.content_en ?? {}),
      content_bn: JSON.stringify(row?.content_bn ?? {}),
      updated_at: (row?.updated_at as string | null) ?? null,
    };
  },
);

/**
 * Persist landing CMS content. App-admin only.
 */
export const updateLandingCms = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator(
    z.object({
      content_en: z.string().min(2),
      content_bn: z.string().min(2),
    }),
  )
  .handler(async ({ data, context }) => {
    let parsedEn: unknown;
    let parsedBn: unknown;
    try {
      parsedEn = JSON.parse(data.content_en);
      parsedBn = JSON.parse(data.content_bn);
    } catch (e) {
      throw new Error(`Invalid JSON: ${(e as Error).message}`);
    }
    const { error } = await context.supabase.rpc("update_landing_cms", {
      _content_en: parsedEn as never,
      _content_bn: parsedBn as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
