import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { getBranchSettings, upsertBranchSettings } from "@/lib/api/branches.functions";

export const Route = createFileRoute("/settings/branch-settings")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Branch Settings — SohojPharma" }] }),
  component: BranchSettingsPage,
});

type Form = {
  invoice_prefix: string;
  receipt_footer: string;
  contact_phone: string;
  contact_email: string;
  address: string;
  low_stock_threshold: number;
  expiry_alert_days: number;
  printer_paper: string;
};

const EMPTY: Form = {
  invoice_prefix: "",
  receipt_footer: "",
  contact_phone: "",
  contact_email: "",
  address: "",
  low_stock_threshold: 10,
  expiry_alert_days: 90,
  printer_paper: "80mm",
};

function BranchSettingsPage() {
  const { t } = useTranslation();
  const { branches, branchId, setBranchId } = useActiveBranch();
  const qc = useQueryClient();
  const getFn = useServerFn(getBranchSettings);
  const saveFn = useServerFn(upsertBranchSettings);

  const { data: row } = useQuery({
    queryKey: ["branch-settings", branchId],
    enabled: !!branchId,
    queryFn: () => getFn({ data: { branch_id: branchId! } }),
  });

  const [form, setForm] = useState<Form>(EMPTY);
  useEffect(() => {
    if (!branchId) return;
    if (!row) { setForm(EMPTY); return; }
    const ps = (row.printer_settings ?? {}) as { paper?: string };
    setForm({
      invoice_prefix: row.invoice_prefix ?? "",
      receipt_footer: row.receipt_footer ?? "",
      contact_phone: row.contact_phone ?? "",
      contact_email: row.contact_email ?? "",
      address: row.address ?? "",
      low_stock_threshold: row.low_stock_threshold ?? 10,
      expiry_alert_days: row.expiry_alert_days ?? 90,
      printer_paper: ps.paper ?? "80mm",
    });
  }, [row, branchId]);

  const save = useMutation({
    mutationFn: () => saveFn({
      data: {
        branch_id: branchId!,
        patch: {
          invoice_prefix: form.invoice_prefix || null,
          receipt_footer: form.receipt_footer || null,
          contact_phone: form.contact_phone || null,
          contact_email: form.contact_email || "",
          address: form.address || null,
          low_stock_threshold: Number(form.low_stock_threshold) || 0,
          expiry_alert_days: Number(form.expiry_alert_days) || 0,
          printer_settings: { paper: form.printer_paper },
        },
      },
    }),
    onSuccess: () => {
      toast.success(t("settings.branch_settings.saved"));
      qc.invalidateQueries({ queryKey: ["branch-settings", branchId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell variant="store" title={t("settings.branch_settings.title")}>
      <PageHeader
        title={t("settings.branch_settings.title")}
        description={t("settings.branch_settings.desc")}
        actions={
          <div className="w-64">
            <Select value={branchId ?? ""} onValueChange={(v) => setBranchId(v)}>
              <SelectTrigger><SelectValue placeholder={t("settings.branch_settings.selectBranch")} /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      {!branchId ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          {t("settings.branch_settings.selectBranch")}
        </CardContent></Card>
      ) : (
        <Card><CardContent className="grid grid-cols-2 gap-4 p-6">
          <div><Label>{t("settings.branch_settings.invoicePrefix")}</Label>
            <Input value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} /></div>
          <div><Label>{t("settings.branch_settings.contactNumber")}</Label>
            <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
          <div><Label>{t("settings.branches.email")}</Label>
            <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
          <div><Label>{t("settings.branch_settings.lowStockThreshold")}</Label>
            <Input type="number" min={0} value={form.low_stock_threshold}
              onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} /></div>
          <div><Label>{t("settings.branch_settings.expiryAlertDays")}</Label>
            <Input type="number" min={0} value={form.expiry_alert_days}
              onChange={(e) => setForm({ ...form, expiry_alert_days: Number(e.target.value) })} /></div>
          <div>
            <Label>{t("settings.branch_settings.printerSettings")}</Label>
            <Select value={form.printer_paper} onValueChange={(v) => setForm({ ...form, printer_paper: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">58mm</SelectItem>
                <SelectItem value="80mm">80mm</SelectItem>
                <SelectItem value="A4">A4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>{t("settings.branch_settings.branchAddress")}</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="col-span-2"><Label>{t("settings.branch_settings.receiptFooter")}</Label>
            <Textarea value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} /></div>
          <div className="col-span-2 flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-2 h-4 w-4" />{t("settings.branch_settings.save")}
            </Button>
          </div>
        </CardContent></Card>
      )}
    </AppShell>
  );
}
