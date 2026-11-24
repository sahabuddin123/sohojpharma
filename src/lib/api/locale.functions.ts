import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const LANGUAGES = ["en", "bn"] as const;
export const CURRENCIES = ["BDT", "USD", "EUR", "GBP"] as const;
export const TIMEZONES = ["Asia/Dhaka", "Asia/Kolkata", "Asia/Dubai", "UTC"] as const;
export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export const NUMBER_FORMATS = ["en-BD", "en-US", "bn-BD"] as const;

export type LocaleSettings = {
  language: (typeof LANGUAGES)[number];
  currency: (typeof CURRENCIES)[number];
  timezone: (typeof TIMEZONES)[number];
  date_format: (typeof DATE_FORMATS)[number];
  number_format: (typeof NUMBER_FORMATS)[number];
};

export const DEFAULT_LOCALE: LocaleSettings = {
  language: "bn",
  currency: "BDT",
  timezone: "Asia/Dhaka",
  date_format: "DD/MM/YYYY",
  number_format: "en-BD",
};

const WRITE_ROLES = ["owner", "corporate_admin"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertMember(ctx: { supabase: any; userId: string }, tenant_id: string) {
  const { data, error } = await ctx.supabase
    .from("tenant_members").select("user_id")
    .eq("tenant_id", tenant_id).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertWrite(ctx: { supabase: any; userId: string }, tenant_id: string) {
  for (const r of WRITE_ROLES) {
    const { data, error } = await ctx.supabase.rpc("has_role", {
      _user_id: ctx.userId, _tenant_id: tenant_id, _role: r,
    });
    if (error) throw new Error(error.message);
    if (data) return r;
  }
  throw new Error("Forbidden: owner or corporate_admin role required (403)");
}

const LocalePatch = z.object({
  language: z.enum(LANGUAGES).optional(),
  currency: z.enum(CURRENCIES).optional(),
  timezone: z.enum(TIMEZONES).optional(),
  date_format: z.enum(DATE_FORMATS).optional(),
  number_format: z.enum(NUMBER_FORMATS).optional(),
});

export const getLocaleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tenant_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<LocaleSettings> => {
    await assertMember(context, data.tenant_id);
    const { data: row, error } = await context.supabase
      .from("tenant_settings").select("locale").eq("tenant_id", data.tenant_id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_LOCALE, ...((row?.locale ?? {}) as Partial<LocaleSettings>) };
  });

export const updateLocaleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    tenant_id: z.string().uuid(),
    patch: LocalePatch,
  }).parse(d))
  .handler(async ({ data, context }): Promise<LocaleSettings> => {
    await assertMember(context, data.tenant_id);
    await assertWrite(context, data.tenant_id);

    const { data: before } = await context.supabase
      .from("tenant_settings").select("locale").eq("tenant_id", data.tenant_id).maybeSingle();
    const prev = (before?.locale ?? {}) as Partial<LocaleSettings>;
    const next: LocaleSettings = { ...DEFAULT_LOCALE, ...prev, ...data.patch };

    const { data: row, error } = await context.supabase
      .from("tenant_settings")
      .upsert(
        { tenant_id: data.tenant_id, locale: next, updated_by: context.userId },
        { onConflict: "tenant_id" },
      )
      .select("locale").single();
    if (error) throw new Error(error.message);

    await context.supabase.rpc("audit_log_event", {
      _tenant_id: data.tenant_id,
      _action: "locale.updated",
      _entity_table: "tenant_settings",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _before: prev as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _after: row?.locale as any,
    });

    return { ...DEFAULT_LOCALE, ...((row?.locale ?? {}) as Partial<LocaleSettings>) };
  });
