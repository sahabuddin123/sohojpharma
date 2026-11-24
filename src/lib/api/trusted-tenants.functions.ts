import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type TrustedTenant = { id: string; name: string; logo_url: string };

/**
 * Public — returns active tenants with logos for the landing page marquee.
 * Uses the service-role client because the underlying RPC is no longer
 * callable by the anon role (hardened against anonymous SECURITY DEFINER
 * execution). Only returns id/name/logo_url which are non-sensitive.
 */
export const listTrustedTenantsPublic = createServerFn({ method: "GET" })
  .inputValidator(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
  .handler(async ({ data }): Promise<TrustedTenant[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("list_public_trusted_tenants", {
      _limit: data?.limit ?? 24,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as TrustedTenant[];
  });
