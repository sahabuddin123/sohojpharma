import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RouteErrorPanel } from "@/components/route-error";
import { InvoiceDoc, type InvoiceFormat, type InvoiceSettings } from "@/components/invoice/invoice-doc";

export const Route = createFileRoute("/settings/invoice")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Invoice Settings — SohojPharma" }] }),
  component: InvoiceSettingsPage,
});

const TEMPLATES = ["classic", "modern", "corporate", "pharmacy"];
const FONTS = ["system-ui", "Inter", "Roboto", "Arial", "Georgia"];

type Settings = InvoiceSettings & {
  id?: string;
  template?: string;
  thermal_width?: string;
  show_barcode?: boolean;
};

const SAMPLE = {
  invoice_no: "INV-2026-000123", date: new Date().toISOString(),
  cashier: "Demo Cashier", customer_name: "John Doe", customer_phone: "+8801XXXXXXXXX",
  items: [
    { name: "Napa 500mg", sku: "NAPA-500", qty: 2, unit_price: 12, discount: 0, vat: 0, line_total: 24 },
    { name: "Seclo 20mg", sku: "SEC-20", qty: 1, unit_price: 80, discount: 5, vat: 0, line_total: 75 },
  ],
  subtotal: 104, discount: 5, vat: 0, total: 99, paid: 99, due: 0,
  payment_method: "cash", notes: null, kind: "sale" as const,
};

function InvoiceSettingsPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const [s, setS] = useState<Settings>({
    company_name: "", address: "", phone: "", email: "", website: "",
    trade_license: "", bin_number: "", tin_number: "", logo_url: "",
    footer_message: "Thank you for your purchase!", terms_conditions: "",
    template: "classic", thermal_width: "80mm",
    primary_color: "#0ea5e9", font_family: "system-ui",
    show_qr: true, show_barcode: true,
  });
  const [preview, setPreview] = useState<InvoiceFormat>("a4");

  const { data } = useQuery({
    queryKey: ["invoice-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from("invoice_settings" as never)
        .select("*").eq("tenant_id", tenantId).is("branch_id", null).maybeSingle();
      return data as Settings | null;
    },
  });
  useEffect(() => { if (data) setS({ ...s, ...data }); /* eslint-disable-next-line */ }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const payload = { ...s, tenant_id: tenantId, branch_id: null };
      const { error } = await supabase
        .from("invoice_settings" as never)
        .upsert(payload as never, { onConflict: "tenant_id,branch_id" } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice settings saved");
      qc.invalidateQueries({ queryKey: ["invoice-settings", tenantId] });
      qc.invalidateQueries({ queryKey: ["pos-invoice-print-settings", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  return (
    <div className="container mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoice Settings</h1>
          <p className="text-sm text-muted-foreground">Branding, numbering, template & print layout.</p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="mr-1 h-4 w-4" /> Save
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Company</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Field label="Company Name"><Input value={s.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
            <Field label="Logo URL"><Input value={s.logo_url ?? ""} onChange={(e) => set("logo_url", e.target.value)} /></Field>
            <Field label="Address" full><Textarea rows={2} value={s.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="Phone"><Input value={s.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Email"><Input value={s.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Website"><Input value={s.website ?? ""} onChange={(e) => set("website", e.target.value)} /></Field>
            <Field label="Trade License"><Input value={s.trade_license ?? ""} onChange={(e) => set("trade_license", e.target.value)} /></Field>
            <Field label="BIN"><Input value={s.bin_number ?? ""} onChange={(e) => set("bin_number", e.target.value)} /></Field>
            <Field label="TIN"><Input value={s.tin_number ?? ""} onChange={(e) => set("tin_number", e.target.value)} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Template & Branding</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Field label="Template">
              <Select value={s.template} onValueChange={(v) => set("template", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TEMPLATES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Thermal Width">
              <Select value={s.thermal_width} onValueChange={(v) => set("thermal_width", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="38mm">38mm</SelectItem><SelectItem value="58mm">58mm</SelectItem><SelectItem value="80mm">80mm</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Primary Color"><Input type="color" value={s.primary_color ?? "#0ea5e9"} onChange={(e) => set("primary_color", e.target.value)} /></Field>
            <Field label="Font">
              <Select value={s.font_family} onValueChange={(v) => set("font_family", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Footer Message" full><Textarea rows={2} value={s.footer_message ?? ""} onChange={(e) => set("footer_message", e.target.value)} /></Field>
            <Field label="Terms & Conditions" full><Textarea rows={3} value={s.terms_conditions ?? ""} onChange={(e) => set("terms_conditions", e.target.value)} /></Field>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" /> Preview</CardTitle>
          <Select value={preview} onValueChange={(v) => setPreview(v as InvoiceFormat)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="thermal-38">38mm Thermal</SelectItem>
              <SelectItem value="thermal-58">58mm Thermal</SelectItem>
              <SelectItem value="thermal-80">80mm Thermal</SelectItem>
              <SelectItem value="a4">A4 Invoice</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-auto rounded border bg-muted/30 p-4">
            <div style={{ width: preview === "thermal-38" ? "38mm" : preview === "thermal-58" ? "58mm" : preview === "thermal-80" ? "80mm" : "100%", margin: "0 auto", background: "#fff" }}>
              <InvoiceDoc format={preview} data={SAMPLE} settings={s} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
