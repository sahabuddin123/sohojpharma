// Server function: load a sale + items + payments + customer/tenant info,
// returning a ReceiptData DTO ready for the print service.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReceiptData } from "@/lib/print/receipt-templates";

const Input = z.object({ sale_id: z.string().uuid() });

export const getReceiptData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ReceiptData> => {
    const { supabase } = context;

    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .select(
        `id, invoice_no, created_at, subtotal, discount, vat, total, paid, due,
         tenant_id, cashier_id, customer_id`
      )
      .eq("id", data.sale_id)
      .single();
    if (saleErr || !sale) throw new Error(saleErr?.message ?? "Sale not found");

    const [tenantRes, brandingRes, customerRes, cashierRes, itemsRes, paymentsRes] = await Promise.all([
      supabase
        .from("tenants")
        .select("name, phone, mobile, email, website, bin, tin, trade_license_no, drug_license_no, address_line, area, district, division, postal_code, country, logo_url, receipt_logo_url")
        .eq("id", sale.tenant_id)
        .maybeSingle(),
      supabase
        .from("tenant_settings")
        .select("branding")
        .eq("tenant_id", sale.tenant_id)
        .maybeSingle(),

      sale.customer_id
        ? supabase
            .from("customers")
            .select("name, phone")
            .eq("id", sale.customer_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      sale.cashier_id
        ? supabase
            .from("profiles")
            .select("full_name")
            .eq("id", sale.cashier_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("sale_items")
        .select(
          `qty, unit_price, discount, vat, line_total,
           products(name), batches(batch_no, expiry_date)`
        )
        .eq("sale_id", sale.id),
      supabase
        .from("sale_payments")
        .select("method, amount, reference")
        .eq("sale_id", sale.id),
    ]);

    if (itemsRes.error) throw new Error(itemsRes.error.message);

    const tenant = (tenantRes.data ?? {}) as Record<string, unknown>;
    const branding = ((brandingRes.data?.branding ?? {}) as Record<string, unknown>);
    const customer = customerRes.data as { name?: string; phone?: string } | null;
    const cashier = cashierRes.data as { full_name?: string } | null;

    const addressParts = [
      tenant.address_line,
      tenant.area,
      tenant.district,
      tenant.division,
      tenant.postal_code,
      tenant.country,
    ].filter((v): v is string => !!v && typeof v === "string");
    const composedAddress = addressParts.length ? addressParts.join(", ") : undefined;

    return {
      pharmacy_name: String(tenant.name ?? ""),
      pharmacy_address: composedAddress,
      pharmacy_phone: (tenant.phone as string | undefined) ?? (tenant.mobile as string | undefined),
      pharmacy_vat_no: (tenant.bin as string | undefined) ?? (tenant.tin as string | undefined),
      logo_url:
        (branding.receipt_logo_url as string | undefined) ??
        (branding.logo_url as string | undefined) ??
        (tenant.receipt_logo_url as string | undefined) ??
        (tenant.logo_url as string | undefined),
      signature_url: (branding.signature_url as string | undefined) ?? undefined,
      show_signature: true,
      footer_note: (branding.receipt_footer as string | undefined) ?? undefined,



      invoice_no: sale.invoice_no,
      invoice_date: sale.created_at,
      cashier_name: cashier?.full_name,
      customer_name: customer?.name,
      customer_phone: customer?.phone,
      items: (itemsRes.data ?? []).map((r) => {
        const prod = r.products as { name?: string } | null;
        const batch = r.batches as { batch_no?: string; expiry_date?: string | null } | null;
        return {
          name: prod?.name ?? "Item",
          qty: Number(r.qty),
          unit_price: Number(r.unit_price),
          discount: Number(r.discount ?? 0),
          vat: Number(r.vat ?? 0),
          line_total: Number(r.line_total),
          batch_no: batch?.batch_no,
          expiry_date: batch?.expiry_date ?? null,
        };
      }),
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      vat: Number(sale.vat),
      total: Number(sale.total),
      paid: Number(sale.paid),
      due: Number(sale.due),
      payments: (paymentsRes.data ?? []).map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        reference: p.reference,
      })),
    };
  });
