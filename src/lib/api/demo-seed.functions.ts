import { createServerFn } from "@tanstack/react-start";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

/**
 * Seeds two demo accounts for development:
 *   - superadmin@gmail.com / 123456  (system owner)
 *   - admin@gmail.com    / 123456    (owner of "MedPlus Dhanmondi")
 *
 * Restricted to platform app-admins and disabled in production.
 * Idempotent: skips users that already exist.
 */
export const seedDemoAccounts = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .handler(
  async () => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Demo seeding is disabled in production");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const accounts = [
      {
        email: "superadmin@gmail.com",
        password: "123456",
        full_name: "Super Admin",
        pharmacy_name: "SohojPharma System",
      },
      {
        email: "admin@gmail.com",
        password: "123456",
        full_name: "Store Admin",
        pharmacy_name: "MedPlus Dhanmondi",
      },
    ];

    const results: Array<{ email: string; status: "created" | "exists" | "error"; detail?: string }> = [];

    for (const acc of accounts) {
      try {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const exists = list?.users?.some((u) => u.email?.toLowerCase() === acc.email);
        if (exists) {
          results.push({ email: acc.email, status: "exists" });
          continue;
        }
        const { error } = await supabaseAdmin.auth.admin.createUser({
          email: acc.email,
          password: acc.password,
          email_confirm: true,
          user_metadata: {
            full_name: acc.full_name,
            pharmacy_name: acc.pharmacy_name,
          },
        });
        if (error) {
          results.push({ email: acc.email, status: "error", detail: error.message });
        } else {
          results.push({ email: acc.email, status: "created" });
        }
      } catch (e) {
        results.push({
          email: acc.email,
          status: "error",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { ok: true, results };
  },
);
