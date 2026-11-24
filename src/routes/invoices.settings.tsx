import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  getInvoiceSettings, updateInvoiceSettings,
  type InvoiceSettings, InvoiceSettingsSchema,
} from "@/lib/api/invoices.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/invoices/settings")({
  head: () => ({ meta: [{ title: "Invoice Settings — SohojPharma" }] }),
  component: InvoiceSettingsPage,
  errorComponent: (props) => <RouteErrorPanel {...props} />,
});

function InvoiceSettingsPage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const get = useServerFn(getInvoiceSettings);
  const save = useServerFn(updateInvoiceSettings);
  const { data, refetch } = useQuery({
    queryKey: ["invoice-settings", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => get({ data: { tenantId: currentTenantId! } }),
  });
  const [form, setForm] = useState<InvoiceSettings | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);

  if (!form) {
    return <AppShell variant="store" title="Invoice Settings"><div className="p-6 text-muted-foreground">Loading…</div></AppShell>;
  }

  const update = <K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) =>
    setForm((s) => s ? { ...s, [k]: v } : s);

  const onSave = async () => {
    const parsed = InvoiceSettingsSchema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Invalid"); return; }
    await save({ data: { tenantId: currentTenantId!, settings: parsed.data } });
    toast.success(t("toast.settingsSaved"));
    refetch();
  };

  return (
    <AppShell variant="store" title="Invoice Settings">
      <PageHeader title="Invoice Settings" description="Customize invoice header, footer and paper size." />
      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Pharmacy name</Label>
            <Input value={form.pharmacyName} onChange={(e) => update("pharmacyName", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Mobile</Label>
            <Input value={form.mobile} onChange={(e) => update("mobile", e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => update("address", e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Logo URL</Label>
            <Input value={form.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-2">
            <Label>Paper size</Label>
            <Select value={form.paper} onValueChange={(v) => update("paper", v as InvoiceSettings["paper"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="38mm">Thermal 38mm</SelectItem>
                <SelectItem value="58mm">Thermal 58mm</SelectItem>
                <SelectItem value="80mm">Thermal 80mm</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 pt-7">
            <Switch checked={form.showLogo} onCheckedChange={(v) => update("showLogo", v)} />
            <Label>Show logo on receipt</Label>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Header text</Label>
            <Input value={form.header} onChange={(e) => update("header", e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Thank-you message</Label>
            <Input value={form.thankYou} onChange={(e) => update("thankYou", e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Terms &amp; conditions</Label>
            <Textarea value={form.terms} onChange={(e) => update("terms", e.target.value)} rows={3} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Footer text</Label>
            <Input value={form.footer} onChange={(e) => update("footer", e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={onSave}>Save settings</Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
