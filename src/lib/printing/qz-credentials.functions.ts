// QZ credentials management — admin-only server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireAppAdmin } from "@/lib/api/middleware/require-app-admin";

export const saveQzCredentials = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((d: { privateKey: string; certificate: string }) => {
    if (typeof d?.privateKey !== "string" || typeof d?.certificate !== "string") {
      throw new Error("invalid payload");
    }
    if (!d.privateKey.includes("BEGIN") || !d.privateKey.includes("PRIVATE KEY")) {
      throw new Error("private key must be a PEM block");
    }
    if (!d.certificate.includes("BEGIN CERTIFICATE")) {
      throw new Error("certificate must be a PEM block");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb
      .from("qz_credentials")
      .upsert({
        id: 1,
        private_key: data.privateKey,
        certificate: data.certificate,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getQzCredentialsStatus = createServerFn({ method: "GET" })
  .middleware([requireAppAdmin])
  .handler(async ({ context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("qz_credentials")
      .select("private_key, certificate, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      hasPrivateKey: !!data?.private_key,
      hasCertificate: !!data?.certificate,
      updatedAt: data?.updated_at ?? null,
    };
  });
