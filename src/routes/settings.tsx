import { createFileRoute, Outlet, useMatches, useNavigate, useRouterState } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePharmacyProfile } from "@/hooks/use-pharmacy-profile";
import { useBrandingSettings } from "@/hooks/use-branding-settings";
import { useLocaleSettings } from "@/hooks/use-locale-settings";
import { useTenantLocale } from "@/hooks/use-tenant-locale";
import type { LocaleSettings } from "@/lib/api/locale.functions";
import { useSettingsAccess } from "@/hooks/use-settings-access";
import { useBusinessRules } from "@/hooks/use-business-rules";
import { useSystemPreferences } from "@/hooks/use-system-preferences";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInvoiceSettingsRow } from "@/hooks/use-invoice-settings-row";
import { usePosSettings } from "@/hooks/use-pos-settings";
import { useInventorySettings } from "@/hooks/use-inventory-settings";
import { useMedicineSettings } from "@/hooks/use-medicine-settings";
import { useReportSettings } from "@/hooks/use-report-settings";
import type { ReportSettings } from "@/lib/api/report-settings.functions";
import { useNumberSeries } from "@/hooks/use-number-series";

import { toast } from "sonner";
import { Lock, Eye } from "lucide-react";
import {
  Store, Palette, Receipt, ShoppingCart, Boxes, Percent, CreditCard,
  Printer, Users, Bell, DatabaseBackup, Shield, BadgeCheck, Languages,
  Upload, Pill, FileBarChart, Gavel, Scan, Hash, HardDrive, Download,
  Trash2, Archive, RefreshCw, FileSpreadsheet, Sliders, Plug,
  Smartphone, Mail, Webhook, KeyRound, MessageCircle, CheckCircle2,
  AlertCircle, XCircle, Settings2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUIStore } from "@/stores/ui-store";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useServerFn } from "@tanstack/react-start";
import {
  getNotificationSettings,
  updateNotificationSettings,
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/lib/api/notification-settings.functions";
import {
  getSecuritySettings,
  updateSecuritySettings,
  listAllowedIPs,
  addAllowedIP,
  removeAllowedIP,
} from "@/lib/api/security-settings.functions";
import {
  getSubscriptionSettings,
  updateSubscriptionSettings,
  getSubscriptionOverview,
  type SubscriptionSettings as TSubSettings,
} from "@/lib/api/subscription-settings.functions";
import {
  getPaymentSettings,
  updatePaymentSettings,
  listGateways,
  upsertGateway,
  deleteGateway,
  listSettlements,
  type PaymentSettings as TPaySettings,
  type PaymentMethod as TPayMethod,
} from "@/lib/api/payment-settings.functions";
import {
  getTaxSettings,
  updateTaxSettings,
  listTaxProfiles,
  upsertTaxProfile,
  deleteTaxProfile,
  type TaxSettings as TTaxSettings,
  type TaxProfile as TTaxProfile,
  type RoundingMethod as TRound,
  type TaxProfileType as TTaxType,
} from "@/lib/api/tax-settings.functions";
import {
  getPrinterSettings,
  updatePrinterSettings,
  listPrinters,
  upsertPrinter,
  deletePrinter,
  testPrinter,
  type PrinterSettings as TPrinterSettings,
  type PrinterProfile as TPrinterProfile,
  type PrinterType as TPrinterType,
  type ReceiptFormat as TReceiptFormat,
} from "@/lib/api/printer-settings.functions";
import {
  getIntegrationToggles,
  updateIntegrationToggles,
  listIntegrationProviders,
  upsertIntegrationProvider,
  deleteIntegrationProvider,
  testIntegrationProvider,
  listWebhooks,
  upsertWebhook,
  deleteWebhook,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  type IntegrationToggles as TIntToggles,
  type IntegrationProvider as TIntProvider,
  type IntegrationCategory as TIntCategory,
} from "@/lib/api/integrations-settings.functions";
import {
  getBackupSettings,
  updateBackupSettings,
  listBackupJobs,
  upsertBackupJob,
  deleteBackupJob,
  listBackupHistory,
  runBackup,
  listRestoreHistory,
  restoreBackup,
  type BackupSettings as TBackupSettings,
  type BackupJob as TBackupJob,
  type BackupHistoryRow as TBackupHistoryRow,
  type RestoreHistoryRow as TRestoreHistoryRow,
  type BackupType as TBackupType,
  type BackupFrequency as TBackupFreq,
  type BackupStorage as TBackupStorage,
  type BackupFormat as TBackupFormat,
  type RestoreType as TRestoreType,
} from "@/lib/api/backup-settings.functions";
import {
  getDataMgmtSettings,
  updateDataMgmtSettings,
  listImportJobs,
  listExportJobs,
  runExport,
  listArchiveRules,
  upsertArchiveRule,
  deleteArchiveRule,
  runArchiveRule,
  listRetentionPolicies,
  upsertRetentionPolicy,
  deleteRetentionPolicy,
  listCleanupLogs,
  runCleanup,
  listRecycleBin,
  restoreFromRecycleBin,
  purgeFromRecycleBin,
  getStorageStats,
  type DataMgmtSettings as TDMSettings,
  type ImportJob as TImportJob,
  type ExportJob as TExportJob,
  type ArchiveRule as TArchiveRule,
  type RetentionPolicy as TRetention,
  type CleanupLog as TCleanupLog,
  type RecycleBinRow as TRecycleRow,
} from "@/lib/api/data-management.functions";
import { Progress } from "@/components/ui/progress";



export const Route = createFileRoute("/settings")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Settings Center — SohojPharma" },
      { name: "description", content: "Pharmacy profile, branding, invoice, POS, inventory, tax, payments, printers, users, notifications, backup, security, subscription and localization settings." },
    ],
  }),
  component: SettingsPage,
});

type TabKey =
  | "general" | "profile" | "branding" | "invoice" | "inventory" | "tax"
  | "payment" | "printer" | "notifications" | "backup"
  | "security" | "subscription" | "localization" | "medicine" | "report"
  | "rules" | "pos-advanced" | "number-series" | "data-management"
  | "preferences" | "integrations";

const TABS: { key: TabKey; label: string; icon: typeof Store; group: string }[] = [
  { key: "general",       label: "General",               icon: Settings2,      group: "Business" },
  { key: "profile",       label: "Pharmacy Profile",      icon: Store,          group: "Business" },
  { key: "branding",      label: "Branding",              icon: Palette,        group: "Business" },
  { key: "localization",  label: "Language & Locale",     icon: Languages,      group: "Business" },
  { key: "rules",         label: "Business Rules",        icon: Gavel,          group: "Business" },
  { key: "preferences",   label: "System Preferences",    icon: Sliders,        group: "Business" },
  { key: "invoice",       label: "Invoice",               icon: Receipt,        group: "Operations" },
  { key: "pos-advanced",  label: "POS Settings",          icon: Scan,           group: "Operations" },
  { key: "inventory",     label: "Inventory",             icon: Boxes,          group: "Operations" },
  { key: "medicine",      label: "Medicine",              icon: Pill,           group: "Operations" },
  { key: "report",        label: "Reports",               icon: FileBarChart,   group: "Operations" },
  { key: "number-series", label: "Number Series",         icon: Hash,           group: "Operations" },
  { key: "tax",           label: "Tax & VAT",             icon: Percent,        group: "Finance" },
  { key: "payment",       label: "Payments",              icon: CreditCard,     group: "Finance" },
  { key: "printer",       label: "Printers",              icon: Printer,        group: "Devices" },
  { key: "integrations",  label: "Integrations",          icon: Plug,           group: "Devices" },
  { key: "notifications", label: "Notifications",         icon: Bell,           group: "Account" },
  { key: "backup",        label: "Backup & Restore",      icon: DatabaseBackup, group: "Account" },
  { key: "data-management", label: "Data Management",     icon: HardDrive,      group: "Account" },
  { key: "security",      label: "Security",              icon: Shield,         group: "Account" },
  { key: "subscription",  label: "Subscription",          icon: BadgeCheck,     group: "Account" },
];

function SettingsPage() {
  const { t } = useTranslation();
  const matches = useMatches();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [active, setActive] = useState<TabKey>("general");
  const groups = Array.from(new Set(TABS.map(t => t.group)));
  const { currentTenantId, loading: authLoading } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const navigate = useNavigate();
  const hasSettingsChild =
    (pathname !== "/settings" && pathname.startsWith("/settings/")) ||
    matches.some((m) => m.routeId !== "/settings" && m.routeId.startsWith("/settings/"));

  useEffect(() => {
    if (hasSettingsChild) return;
    if (authLoading || access.loading) return;
    if (!currentTenantId) return;
    if (!access.canView) {
      toast.error("Access denied — you do not have permission to view settings.");
      navigate({ to: "/store", replace: true });
    } else if (access.readOnly) {
      toast.message("Read-only — settings can only be modified by Owner or Admin.");
    }
  }, [hasSettingsChild, authLoading, access.loading, currentTenantId, access.canView, access.readOnly, navigate]);

  if (hasSettingsChild) return <Outlet />;

  const roleBadge = access.role
    ? access.role === "owner" ? "Owner"
    : access.role === "corporate_admin" ? "Admin"
    : access.role === "manager" ? "Manager"
    : access.role === "auditor" ? "Auditor"
    : access.role
    : null;

  if (authLoading || access.loading) {
    return (
      <AppShell variant="store" title={t("sections.settings.title")}>
        <PageHeader title={t("sections.settings.title")} description={t("sections.settings.desc")} />
        <div className="text-sm text-muted-foreground">Loading…</div>
      </AppShell>
    );
  }

  if (!access.canView) {
    return (
      <AppShell variant="store" title={t("sections.settings.title")}>
        <PageHeader title={t("sections.settings.title")} description={t("sections.settings.desc")} />
        <Card className="shadow-card">
          <CardContent className="flex items-center gap-3 p-6">
            <Lock className="h-5 w-5 text-destructive" />
            <div>
              <p className="font-medium">Access Denied</p>
              <p className="text-sm text-muted-foreground">You do not have permission to modify settings.</p>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell variant="store" title={t("sections.settings.title")}>
      <PageHeader
        title={t("sections.settings.title")}
        description={t("sections.settings.desc")}
        actions={
          <div className="flex items-center gap-2">
            {roleBadge && (
              <Badge variant={access.canEdit ? "default" : "secondary"} className="gap-1">
                <Shield className="h-3 w-3" />{roleBadge}
              </Badge>
            )}
            {access.readOnly && (
              <Badge variant="outline" className="gap-1">
                <Eye className="h-3 w-3" />Read Only
              </Badge>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Left settings nav */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card className="shadow-card">
            <CardContent className="p-2">
              <nav className="space-y-4">
                {groups.map(g => (
                  <div key={g}>
                    <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
                    <ul className="space-y-0.5">
                      {TABS.filter(t => t.group === g).map(t => {
                        const Icon = t.icon;
                        const isActive = active === t.key;
                        return (
                          <li key={t.key}>
                            <button
                              type="button"
                              onClick={() => setActive(t.key)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                                isActive
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "text-foreground hover:bg-muted",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                              <span className="truncate">{t.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </CardContent>
          </Card>
        </aside>

        {/* Right panel */}
        <fieldset disabled={access.readOnly} className="min-w-0 contents disabled:[&_*]:cursor-not-allowed">
          <section className="min-w-0">
            {active === "general"       && <GeneralPanel onSelect={(k) => setActive(k)} />}
            {active === "profile"       && <ProfilePanel />}
            {active === "branding"      && <BrandingPanel />}
            {active === "invoice"       && <InvoicePanel />}
            {active === "inventory"     && <InventoryPanel />}
            {active === "medicine"      && <MedicinePanel />}
            {active === "report"        && <ReportPanel />}
            {active === "tax"           && <TaxPanel />}
            {active === "payment"       && <PaymentPanel />}
            {active === "printer"       && <PrinterPanel />}
            {active === "notifications" && <NotificationsPanel />}
            {active === "backup"        && <BackupPanel />}
            {active === "security"      && <SecurityPanel />}
            {active === "subscription"  && <SubscriptionPanel />}
            {active === "localization"  && <LocalizationPanel />}
            {active === "rules"         && <BusinessRulesPanel />}
            {active === "pos-advanced"  && <POSAdvancedPanel />}
            {active === "number-series" && <NumberSeriesPanel />}
            {active === "data-management" && <DataManagementPanel />}
            {active === "preferences"   && <PreferencesPanel />}
            {active === "integrations"  && <IntegrationsPanel />}
          </section>
        </fieldset>
      </div>
    </AppShell>
  );
}

/* ---------- Shared layout helpers ---------- */
function Panel({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
      {footer ?? null}
    </Card>
  );
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({ title, description, defaultChecked, checked, onCheckedChange, disabled }: { title: string; description?: string; defaultChecked?: boolean; checked?: boolean; onCheckedChange?: (v: boolean) => void; disabled?: boolean }) {
  const controlled = checked !== undefined;
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div>
        <p className="font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {controlled
        ? <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
        : <Switch defaultChecked={defaultChecked} disabled={disabled} />}
    </div>
  );
}

/* ---------- Logo upload (pharmacy profile) ---------- */
function LogoUpload({ label, value, tenantId, assetKey, disabled, onChange }: {
  label: string;
  value: string;
  tenantId: string | undefined;
  assetKey: "logo" | "receipt_logo" | "signature";
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputId = `pp-${assetKey}-file`;
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-xs text-muted-foreground">
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-contain" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://…"
            disabled={disabled || busy}
          />
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              disabled={disabled || busy || !tenantId}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (!tenantId) { toast.error("No tenant"); return; }
                if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
                setBusy(true);
                try {
                  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
                  const path = `${tenantId}/${assetKey}-${Date.now()}.${ext}`;
                  const { error: upErr } = await supabase.storage
                    .from("branding")
                    .upload(path, file, { upsert: false, contentType: file.type || undefined });
                  if (upErr) throw new Error(upErr.message);
                  const { data: signed, error: sErr } = await supabase.storage
                    .from("branding").createSignedUrl(path, 60 * 60 * 24 * 365);
                  if (sErr || !signed?.signedUrl) throw new Error(sErr?.message ?? "Failed to sign URL");
                  onChange(signed.signedUrl);
                  toast.success("Logo uploaded — click Save to apply");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button asChild variant="outline" size="sm" disabled={disabled || busy || !tenantId}>
              <label htmlFor={inputId} className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                {busy ? "Uploading…" : value ? "Replace" : "Upload"}
              </label>
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={() => onChange("")}>
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </Button>
            )}
          </div>
        </div>
      </div>
    </Field>
  );
}

/* ---------- 1. Pharmacy profile ---------- */

function ProfilePanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { profile, isLoading, save, isSaving } = usePharmacyProfile(currentTenantId ?? undefined);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name ?? "",
      business_type: profile.business_type ?? "",
      trade_license_no: profile.trade_license_no ?? "",
      drug_license_no: profile.drug_license_no ?? "",
      bin: profile.bin ?? "",
      tin: profile.tin ?? "",
      phone: profile.phone ?? "",
      mobile: profile.mobile ?? "",
      email: profile.email ?? "",
      website: profile.website ?? "",
      address_line: profile.address_line ?? "",
      area: profile.area ?? "",
      district: profile.district ?? "",
      division: profile.division ?? "",
      postal_code: profile.postal_code ?? "",
      country: profile.country ?? "Bangladesh",
      owner_name: profile.owner_name ?? "",
      manager_name: profile.manager_name ?? "",
      opening_date: profile.opening_date ?? "",
      logo_url: profile.logo_url ?? "",
      receipt_logo_url: profile.receipt_logo_url ?? "",
    });
  }, [profile]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name?.trim()) e.name = "Required";
    if (!form.phone?.trim()) e.phone = "Required";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    if (form.website && !/^https?:\/\//i.test(form.website)) e.website = "Must start with http(s)://";
    if (form.bin && !/^\d+$/.test(form.bin)) e.bin = "Numeric only";
    if (form.tin && !/^\d+$/.test(form.tin)) e.tin = "Numeric only";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    save(form as never);
  }

  if (isLoading) {
    return <Panel title={t("settings.pharmacy.title")} description={t("settings.pharmacy.desc")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  const fld = (key: string, label: string, opts: { type?: string; required?: boolean; placeholder?: string } = {}) => (
    <Field label={label + (opts.required ? " *" : "")} htmlFor={`pp-${key}`}>
      <Input
        id={`pp-${key}`}
        type={opts.type ?? "text"}
        value={form[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        placeholder={opts.placeholder}
        aria-invalid={!!errors[key]}
      />
      {errors[key] && <p className="mt-1 text-xs text-destructive">{errors[key]}</p>}
    </Field>
  );

  return (
    <form onSubmit={onSubmit}>
      <Panel title={t("settings.pharmacy.title")} description={t("settings.pharmacy.desc")}>
        {access.readOnly && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t("settings.pharmacy.readOnly")}
          </div>
        )}

        <p className="text-sm font-semibold">{t("settings.pharmacy.sections.business")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          {fld("name", t("settings.pharmacy.fields.name"), { required: true })}
          {fld("business_type", t("settings.pharmacy.fields.businessType"))}
          {fld("trade_license_no", t("settings.pharmacy.fields.tradeLicense"))}
          {fld("drug_license_no", t("settings.pharmacy.fields.drugLicense"))}
          {fld("bin", t("settings.pharmacy.fields.bin"))}
          {fld("tin", t("settings.pharmacy.fields.tin"))}
        </div>

        <Separator />
        <p className="text-sm font-semibold">{t("settings.pharmacy.sections.contact")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          {fld("phone", t("settings.pharmacy.fields.phone"), { required: true })}
          {fld("mobile", t("settings.pharmacy.fields.mobile"))}
          {fld("email", t("settings.pharmacy.fields.email"), { type: "email" })}
          {fld("website", t("settings.pharmacy.fields.website"), { placeholder: "https://" })}
        </div>

        <Separator />
        <p className="text-sm font-semibold">{t("settings.pharmacy.sections.address")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          {fld("address_line", t("settings.pharmacy.fields.addressLine"))}
          {fld("area", t("settings.pharmacy.fields.area"))}
          {fld("district", t("settings.pharmacy.fields.district"))}
          {fld("division", t("settings.pharmacy.fields.division"))}
          {fld("postal_code", t("settings.pharmacy.fields.postalCode"))}
          {fld("country", t("settings.pharmacy.fields.country"))}
        </div>

        <Separator />
        <p className="text-sm font-semibold">{t("settings.pharmacy.sections.metadata")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          {fld("owner_name", t("settings.pharmacy.fields.ownerName"))}
          {fld("manager_name", t("settings.pharmacy.fields.managerName"))}
          {fld("opening_date", t("settings.pharmacy.fields.openingDate"), { type: "date" })}
        </div>

        <Separator />
        <p className="text-sm font-semibold">{t("settings.pharmacy.sections.brand")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <LogoUpload
            label={t("settings.pharmacy.fields.logo")}
            value={form.logo_url ?? ""}
            tenantId={currentTenantId ?? undefined}
            assetKey="logo"
            disabled={access.readOnly}
            onChange={(url) => set("logo_url", url)}
          />
          <LogoUpload
            label={t("settings.pharmacy.fields.receiptLogo")}
            value={form.receipt_logo_url ?? ""}
            tenantId={currentTenantId ?? undefined}
            assetKey="receipt_logo"
            disabled={access.readOnly}
            onChange={(url) => set("receipt_logo_url", url)}
          />
        </div>

        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {profile?.profile_updated_at && (
              <>
                {t("settings.pharmacy.lastUpdated")}: {new Date(profile.profile_updated_at).toLocaleString()}
                {profile?.profile_updated_by && <> · {t("settings.pharmacy.updatedBy")}: {profile.profile_updated_by.slice(0, 8)}</>}
              </>
            )}
          </div>
          <Button type="submit" disabled={isSaving || access.readOnly}>
            {isSaving ? t("settings.pharmacy.saving") : t("settings.pharmacy.save")}
          </Button>
        </div>
      </Panel>


    </form>
  );
}


/* ---------- 2. Branding ---------- */
function BrandingPanel() {
  const { theme, toggleTheme, desktopUiVersion, setDesktopUiVersion } = useUIStore();
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branding, save, uploadAsset, deleteAsset, isSaving } = useBrandingSettings(currentTenantId ?? undefined);
  const profile = usePharmacyProfile(currentTenantId ?? undefined);

  const [primary, setPrimary] = useState<string>(branding.primary_color ?? "#2563eb");
  const [secondary, setSecondary] = useState<string>(branding.secondary_color ?? "#10b981");
  const [invoiceFooter, setInvoiceFooter] = useState<string>(branding.invoice_footer ?? "");
  const [receiptFooter, setReceiptFooter] = useState<string>(branding.receipt_footer ?? "");

  useEffect(() => { setPrimary(branding.primary_color ?? "#2563eb"); }, [branding.primary_color]);
  useEffect(() => { setSecondary(branding.secondary_color ?? "#10b981"); }, [branding.secondary_color]);
  useEffect(() => { setInvoiceFooter(branding.invoice_footer ?? ""); }, [branding.invoice_footer]);
  useEffect(() => { setReceiptFooter(branding.receipt_footer ?? ""); }, [branding.receipt_footer]);

  const initials = (profile.profile?.name ?? "P").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const tt = (k: string, fb: string) => {
    const v = t(`settings.branding.${k}`);
    return v === `settings.branding.${k}` ? fb : v;
  };

  function AssetRow({ asset, currentUrl, label, sizeClass }: {
    asset: "logo" | "receipt_logo" | "favicon" | "signature";
    currentUrl?: string | null;
    label: string;
    sizeClass: string;
  }) {
    return (
      <Field label={label}>
        <div className="flex items-center gap-3">
          <div className={cn("flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-xs text-muted-foreground", sizeClass)}>
            {currentUrl ? (
              <img src={currentUrl} alt={label} className="h-full w-full object-contain" />
            ) : (
              <span className="font-semibold">{initials}</span>
            )}
          </div>
          <label className="inline-flex items-center">
            <input
              type="file"
              accept={asset === "favicon" ? "image/x-icon,image/png,image/svg+xml" : "image/png,image/jpeg,image/webp,image/svg+xml"}
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
                try { await uploadAsset(asset, f); } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
              }}
            />
            <Button asChild variant="outline" size="sm">
              <span><Upload className="mr-2 h-4 w-4" /> {currentUrl ? tt("replace", "Replace") : tt("upload", "Upload")}</span>
            </Button>
          </label>
          {currentUrl && (
            <Button variant="ghost" size="sm" onClick={() => deleteAsset(asset)}>
              <Trash2 className="mr-2 h-4 w-4" /> {tt("delete", "Delete")}
            </Button>
          )}
        </div>
      </Field>
    );
  }

  return (
    <Panel title={tt("title", "Branding")} description={tt("desc", "Logos, colors and footer messages applied across the app, invoices and receipts.")}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <AssetRow asset="logo" currentUrl={branding.logo_url} label={tt("logo", "Logo")} sizeClass="h-16 w-16" />
        <AssetRow asset="receipt_logo" currentUrl={branding.receipt_logo_url} label={tt("receiptLogo", "Receipt Logo")} sizeClass="h-16 w-16" />
        <AssetRow asset="favicon" currentUrl={branding.favicon_url} label={tt("favicon", "Favicon")} sizeClass="h-10 w-10" />
        <AssetRow asset="signature" currentUrl={branding.signature_url} label={tt("signature", "Signature")} sizeClass="h-16 w-28" />
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <Field label={tt("primaryColor", "Primary Color")} htmlFor="b-theme">
          <div className="flex items-center gap-2">
            <input id="b-theme" type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background" />
            <Input value={primary} onChange={(e) => setPrimary(e.target.value)} className="max-w-[140px]" />
          </div>
        </Field>
        <Field label={tt("secondaryColor", "Secondary Color")} htmlFor="b-sec">
          <div className="flex items-center gap-2">
            <input id="b-sec" type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-10 w-14 cursor-pointer rounded-md border border-border bg-background" />
            <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} className="max-w-[140px]" />
          </div>
        </Field>
      </div>

      <div
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: primary, background: `${primary}10` }}
      >
        <p className="font-medium" style={{ color: primary }}>{tt("livePreview", "Live preview")}</p>
        <div className="mt-2 flex gap-2">
          <span className="rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ background: primary }}>Primary</span>
          <span className="rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ background: secondary }}>Secondary</span>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4">
        <Field label={tt("invoiceFooter", "Invoice Footer")} hint={tt("invoiceFooterHint", "Shown at the bottom of A4 invoices.")}>
          <Textarea rows={2} value={invoiceFooter} onChange={(e) => setInvoiceFooter(e.target.value)} placeholder="Thank you for your business." />
        </Field>
        <Field label={tt("receiptFooter", "Receipt Footer")} hint={tt("receiptFooterHint", "Shown at the bottom of POS receipts.")}>
          <Textarea rows={2} value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder="Thank you for your purchase." />
        </Field>
      </div>

      <Separator />
      <Field label={tt("appearance", "Appearance")}>
        <RadioGroup value={theme} onValueChange={() => toggleTheme()} className="grid grid-cols-2 gap-3">
          <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3", theme === "light" && "border-primary")}>
            <RadioGroupItem value="light" id="t-light" />
            <span className="font-medium">{tt("light", "Light mode")}</span>
          </label>
          <label className={cn("flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3", theme === "dark" && "border-primary")}>
            <RadioGroupItem value="dark" id="t-dark" />
            <span className="font-medium">{tt("dark", "Dark mode")}</span>
          </label>
        </RadioGroup>
      </Field>

      <Field label="Desktop Admin UI Version (শুধু ডেস্কটপ)">
        <RadioGroup
          value={desktopUiVersion}
          onValueChange={(v) => {
            const next = v === "v2" ? "v2" : "v1";
            setDesktopUiVersion(next);
            toast.success(
              next === "v2"
                ? "Modern Glass (v2) ডেস্কটপ UI চালু হয়েছে"
                : "Classic (v1) ডেস্কটপ UI চালু হয়েছে",
            );
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors", desktopUiVersion === "v1" && "border-primary bg-primary/5")}>
            <RadioGroupItem value="v1" id="ui-v1" className="mt-0.5" />
            <div>
              <div className="font-semibold text-sm">Classic (v1)</div>
              <div className="text-xs text-muted-foreground mt-0.5">বর্তমান ক্ল্যাসিক ডেস্কটপ অ্যাডমিন লেআউট</div>
            </div>
          </label>
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3.5 transition-colors", desktopUiVersion === "v2" && "border-primary bg-primary/5")}>
            <RadioGroupItem value="v2" id="ui-v2" className="mt-0.5" />
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                Modern Glass (v2)
                <Badge variant="success" className="text-[10px]">New</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Frosted Teal Glass · FontAwesome · Poppins &amp; Hind Siliguri</div>
            </div>
          </label>
        </RadioGroup>
      </Field>

      <div className="flex justify-end">
        <Button
          disabled={isSaving}
          onClick={() => save({
            primary_color: primary,
            secondary_color: secondary,
            invoice_footer: invoiceFooter || null,
            receipt_footer: receiptFooter || null,
          }).then(() => toast.success(tt("saved", "Branding saved")))
            .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"))}
        >
          {isSaving ? tt("saving", "Saving…") : tt("save", "Save Changes")}
        </Button>
      </div>
    </Panel>
  );
}


/* ---------- 3. Invoice ---------- */
function InvoicePanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { settings, nextInvoiceNo, isLoading, save, isSaving } = useInvoiceSettingsRow(currentTenantId ?? undefined);
  const { branding, save: saveBranding, isSaving: brandingSaving } = useBrandingSettings(currentTenantId ?? undefined);
  const readOnly = access.readOnly;

  // Local form state — only persisted on Update click.
  const [form, setForm] = useState(settings);
  const [signatureUrl, setSignatureUrl] = useState<string>(branding.signature_url ?? "");
  const [dirty, setDirty] = useState(false);

  // Sync server → local when the loaded row changes and there are no unsaved edits.
  useEffect(() => { if (!dirty) setForm(settings); }, [settings, dirty]);
  useEffect(() => { if (!dirty) setSignatureUrl(branding.signature_url ?? ""); }, [branding.signature_url, dirty]);

  const update = <K extends keyof typeof settings>(k: K, v: (typeof settings)[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };

  const handleUpdate = async () => {
    try {
      await Promise.all([
        save(form),
        (signatureUrl ?? "") !== (branding.signature_url ?? "")
          ? saveBranding({ signature_url: signatureUrl || null })
          : Promise.resolve(),
      ]);
      setDirty(false);
    } catch {
      /* toast handled in hooks */
    }
  };

  const handleReset = () => {
    setForm(settings);
    setSignatureUrl(branding.signature_url ?? "");
    setDirty(false);
  };

  if (isLoading) {
    return <Panel title={t("settings.invoice.title")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  const Toggle = ({ k, label, desc }: { k: keyof typeof settings; label: string; desc?: string }) => (
    <label className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch
        checked={!!form[k]}
        onCheckedChange={(v) => update(k, v as (typeof settings)[typeof k])}
        disabled={readOnly}
      />
    </label>
  );

  const saving = isSaving || brandingSaving;

  return (
    <Panel
      title={t("settings.invoice.title")}
      description={t("settings.invoice.desc")}
      footer={<div className="flex items-center justify-end gap-2 border-t border-border p-4">
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button variant="ghost" size="sm" onClick={handleReset} disabled={!dirty || saving}>Reset</Button>
        <Button size="sm" onClick={handleUpdate} disabled={!dirty || saving || readOnly}>
          {saving ? "Updating…" : "Update"}
        </Button>
      </div>}
    >
      {/* Numbering */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.invoice.numbering")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("settings.invoice.invoice_prefix")}>
            <Input
              value={form.invoice_prefix}
              onChange={(e) => update("invoice_prefix", e.target.value)}
              disabled={readOnly}
            />
          </Field>
          <Field label={t("settings.invoice.starting_number")}>
            <Input
              type="number"
              value={form.starting_number}
              onChange={(e) => update("starting_number", Number(e.target.value) || 0)}
              disabled={readOnly}
            />
          </Field>
          <Field label={t("settings.invoice.receipt_prefix")}>
            <Input
              value={form.receipt_prefix}
              onChange={(e) => update("receipt_prefix", e.target.value)}
              disabled={readOnly}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("settings.invoice.preview_next")}: <span className="font-mono">{nextInvoiceNo}</span>
        </p>
      </div>

      <Separator />

      {/* Print format */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.invoice.print_format")}</p>
        <RadioGroup
          value={form.print_format}
          onValueChange={(v) => update("print_format", v as typeof settings.print_format)}
          className="flex gap-4"
        >
          {(["38mm", "58mm", "80mm", "A4"] as const).map(f => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={f} disabled={readOnly} />{f}
            </label>
          ))}
        </RadioGroup>
      </div>

      <Separator />

      {/* Visibility */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.invoice.visibility")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle k="show_logo" label={t("settings.invoice.show_logo")} />
          <Toggle k="show_qr" label={t("settings.invoice.show_qr")} />
          <Toggle k="show_bin" label={t("settings.invoice.show_bin")} />
          <Toggle k="show_tin" label={t("settings.invoice.show_tin")} />
          <Toggle k="show_drug_license" label={t("settings.invoice.show_drug_license")} />
          <Toggle k="show_signature" label={t("settings.invoice.show_signature")} />
        </div>
        <div className="mt-3">
          <Field label={t("settings.invoice.drug_license_no")}>
            <Input
              value={form.drug_license}
              onChange={(e) => update("drug_license", e.target.value)}
              disabled={readOnly}
            />
          </Field>
        </div>
      </div>

      <Separator />

      {/* Signature image */}
      <div>
        <p className="mb-2 text-sm font-semibold">Signature</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <LogoUpload
              label="Authorized signature image"
              value={signatureUrl}
              tenantId={currentTenantId ?? undefined}
              assetKey="signature"
              disabled={readOnly}
              onChange={(url) => { setSignatureUrl(url); setDirty(true); }}
            />
            <p className="mt-1 text-xs text-muted-foreground">Shown on invoices when "Show signature" is enabled.</p>
          </div>
          {/* Live receipt-style preview */}
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice preview</p>
            <div className="grid grid-cols-2 gap-4 text-center text-[11px] text-foreground">
              <div>
                <div className="mx-auto h-12 w-full border-b border-dashed border-muted-foreground/60" />
                <div className="mt-1">Customer Signature</div>
              </div>
              <div>
                <div className="mx-auto flex h-12 w-full items-end justify-center border-b border-dashed border-muted-foreground/60">
                  {signatureUrl ? (
                    <img
                      src={signatureUrl}
                      alt="Authorized signature"
                      className="max-h-11 max-w-full object-contain"
                    />
                  ) : (
                    <span className="pb-1 text-[10px] text-muted-foreground/70">No signature uploaded</span>
                  )}
                </div>
                <div className="mt-1">Authorized Signature</div>
              </div>
            </div>
            {!form.show_signature && (
              <p className="mt-3 text-[10px] text-amber-600">Note: "Show signature" toggle is off — signature won't print.</p>
            )}
          </div>
        </div>
      </div>


      <Separator />

      {/* Footer & terms */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Field label={t("settings.invoice.footer")}>
          <Textarea
            rows={3}
            value={form.footer_message}
            onChange={(e) => update("footer_message", e.target.value)}
            disabled={readOnly}
          />
        </Field>
        <Field label={t("settings.invoice.terms")}>
          <Textarea
            rows={3}
            value={form.terms_conditions}
            onChange={(e) => update("terms_conditions", e.target.value)}
            disabled={readOnly}
          />
        </Field>
      </div>

      {readOnly && (
        <p className="text-xs text-muted-foreground">{t("settings.invoice.readonly_note")}</p>
      )}
    </Panel>
  );
}


/* ---------- 4. POS ---------- */
function POSPanel() {
  return (
    <Panel title="POS settings" description="Behaviour of the point-of-sale screen.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <ToggleRow title="Walk-in customer default" description="Pre-select walk-in on new sale" defaultChecked />
        <ToggleRow title="Allow negative stock" description="Sell even if stock is unavailable" />
        <ToggleRow title="Auto print invoice" description="Print on completed sale" defaultChecked />
        <ToggleRow title="Enable hold sale" defaultChecked />
        <ToggleRow title="Enable draft sale" defaultChecked />
        <ToggleRow title="Enable sales return" defaultChecked />
      </div>
    </Panel>
  );
}

/* ---------- 5. Inventory ---------- */
function InventoryPanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { settings, isLoading, save, isSaving } = useInventorySettings(currentTenantId ?? undefined);
  const disabled = !access.canEdit || isSaving;

  type S = typeof settings;
  type BoolKey = {
    [K in keyof S]-?: S[K] extends boolean ? K : never
  }[keyof S] & string;

  const Row = ({
    k, title, desc,
  }: { k: BoolKey; title: string; desc?: string }) => (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="pr-3">
        <p className="font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch
        checked={!!settings[k]}
        disabled={disabled}
        onCheckedChange={(v) => save({ [k]: v } as unknown as Partial<S>)}
      />
    </div>
  );

  if (isLoading) {
    return <Panel title={t("settings.inventory.title")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  return (
    <Panel title={t("settings.inventory.title")} description={t("settings.inventory.desc")}>
      <p className="text-sm font-semibold">{t("settings.inventory.expiry")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Field label={t("settings.inventory.default_expiry_warning_days")} hint={t("settings.inventory.default_expiry_warning_days_desc")}>
          <Select
            value={String(settings.default_expiry_warning_days)}
            onValueChange={(v) => save({ default_expiry_warning_days: Number(v) })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[30, 60, 90, 120, 180].map((d) => (
                <SelectItem key={d} value={String(d)}>{d} days</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Row k="enable_expiry_tracking" title={t("settings.inventory.enable_expiry_tracking")} desc={t("settings.inventory.enable_expiry_tracking_desc")} />
        <Row k="require_expiry_on_purchase" title={t("settings.inventory.require_expiry_on_purchase")} desc={t("settings.inventory.require_expiry_on_purchase_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.inventory.low_stock")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Field label={t("settings.inventory.default_low_stock_threshold")} hint={t("settings.inventory.default_low_stock_threshold_desc")}>
          <Input
            type="number"
            min={0}
            value={settings.default_low_stock_threshold}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0) save({ default_low_stock_threshold: n });
            }}
            disabled={disabled}
          />
        </Field>
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.inventory.batch")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_batch_tracking" title={t("settings.inventory.enable_batch_tracking")} desc={t("settings.inventory.enable_batch_tracking_desc")} />
        <Row k="auto_generate_batch_no" title={t("settings.inventory.auto_generate_batch_no")} desc={t("settings.inventory.auto_generate_batch_no_desc")} />
        <Row k="require_batch_on_purchase" title={t("settings.inventory.require_batch_on_purchase")} desc={t("settings.inventory.require_batch_on_purchase_desc")} />
        <Row k="enable_fefo" title={t("settings.inventory.enable_fefo")} desc={t("settings.inventory.enable_fefo_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.inventory.transfer")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="allow_expired_transfer" title={t("settings.inventory.allow_expired_transfer")} desc={t("settings.inventory.allow_expired_transfer_desc")} />
        <Row k="allow_recalled_transfer" title={t("settings.inventory.allow_recalled_transfer")} desc={t("settings.inventory.allow_recalled_transfer_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.inventory.adjustment")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_stock_adjustment_reason" title={t("settings.inventory.enable_stock_adjustment_reason")} desc={t("settings.inventory.enable_stock_adjustment_reason_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.inventory.stock_control")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_negative_stock" title={t("settings.inventory.enable_negative_stock")} desc={t("settings.inventory.enable_negative_stock_desc")} />
      </div>

      {access.readOnly && (
        <p className="text-xs text-muted-foreground">{t("settings.inventory.readonly_note")}</p>
      )}
    </Panel>
  );
}


/* ---------- 6. Tax & VAT ---------- */
function TaxPanel() {
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const getS = useServerFn(getTaxSettings);
  const updS = useServerFn(updateTaxSettings);
  const listP = useServerFn(listTaxProfiles);
  const upP = useServerFn(upsertTaxProfile);
  const delP = useServerFn(deleteTaxProfile);

  const { data: s, refetch: refetchS } = useQuery({
    queryKey: ["tax-settings", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getS({ data: { tenant_id: currentTenantId! } }),
  });
  const { data: profiles, refetch: refetchP } = useQuery({
    queryKey: ["tax-profiles", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => listP({ data: { tenant_id: currentTenantId! } }),
  });

  const patch = async (p: Partial<TTaxSettings>) => {
    if (!currentTenantId || access.readOnly) return;
    try {
      await updS({ data: { tenant_id: currentTenantId, patch: p as any } });
      await refetchS();
      toast.success("Tax settings updated");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const [draft, setDraft] = useState<{ name: string; rate: number; type: TTaxType; description: string }>({
    name: "", rate: 15, type: "standard", description: "",
  });
  const saveProfile = async () => {
    if (!currentTenantId || !draft.name.trim()) return;
    try {
      await upP({ data: {
        tenant_id: currentTenantId,
        name: draft.name.trim(),
        rate: Number(draft.rate) || 0,
        type: draft.type,
        status: "active",
        description: draft.description || null,
      }});
      setDraft({ name: "", rate: 15, type: "standard", description: "" });
      await refetchP();
      toast.success("Tax profile saved");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const removeProfile = async (id: string) => {
    if (!currentTenantId) return;
    try { await delP({ data: { tenant_id: currentTenantId, id } }); await refetchP(); toast.success("Removed"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  return (
    <Panel title="Tax & VAT" description="Bangladesh VAT compliance, profiles, rounding and invoice display.">
      <fieldset disabled={access.readOnly} className="contents">
        {/* General */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 sm:col-span-2">
            <div><p className="text-sm font-medium">Enable VAT</p><p className="text-xs text-muted-foreground">Master switch for tax calculation</p></div>
            <Switch checked={!!s?.vat_enabled} onCheckedChange={(v) => patch({ vat_enabled: v })} />
          </div>
          <Field label="Default sales VAT %">
            <Input type="number" value={s?.default_sales_vat ?? 15}
              onChange={(e) => patch({ default_sales_vat: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Default purchase VAT %">
            <Input type="number" value={s?.default_purchase_vat ?? 15}
              onChange={(e) => patch({ default_purchase_vat: Number(e.target.value) || 0 })} />
          </Field>
        </div>

        <Separator />

        {/* Price mode */}
        <Field label="Price mode">
          <RadioGroup
            value={s?.price_includes_vat ? "inclusive" : "exclusive"}
            onValueChange={(v) => patch({ price_includes_vat: v === "inclusive" })}
            className="grid grid-cols-2 gap-3"
          >
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3">
              <RadioGroupItem value="exclusive" id="vat-exc" />
              <div>
                <p className="font-medium">Price excluding VAT</p>
                <p className="text-xs text-muted-foreground">e.g. 100 + 15% = 115</p>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3">
              <RadioGroupItem value="inclusive" id="vat-inc" />
              <div>
                <p className="font-medium">Price including VAT</p>
                <p className="text-xs text-muted-foreground">e.g. 115 (Net 100 + VAT 15)</p>
              </div>
            </label>
          </RadioGroup>
        </Field>

        {/* Rounding */}
        <Field label="Rounding method">
          <Select value={s?.rounding_method ?? "nearest"} onValueChange={(v) => patch({ rounding_method: v as TRound })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nearest">Nearest</SelectItem>
              <SelectItem value="up">Round up</SelectItem>
              <SelectItem value="down">Round down</SelectItem>
              <SelectItem value="bankers">Bankers rounding</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Separator />

        {/* Invoice display */}
        <div>
          <p className="mb-2 text-sm font-medium">Invoice display</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm">Show VAT on invoice</span>
              <Switch checked={!!s?.show_vat_on_invoice} onCheckedChange={(v) => patch({ show_vat_on_invoice: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm">Show VAT registration</span>
              <Switch checked={!!s?.show_vat_registration} onCheckedChange={(v) => patch({ show_vat_registration: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm">Show BIN</span>
              <Switch checked={!!s?.show_bin} onCheckedChange={(v) => patch({ show_bin: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm">Enable multi-tax (per product)</span>
              <Switch checked={!!s?.enable_multi_tax} onCheckedChange={(v) => patch({ enable_multi_tax: v })} />
            </div>
          </div>
        </div>

        <Separator />

        {/* Exemptions */}
        <div>
          <p className="mb-2 text-sm font-medium">Tax exemption</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm">Tax-exempt sales</span>
              <Switch checked={!!s?.tax_exempt_sales} onCheckedChange={(v) => patch({ tax_exempt_sales: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm">Tax-exempt purchases</span>
              <Switch checked={!!s?.tax_exempt_purchases} onCheckedChange={(v) => patch({ tax_exempt_purchases: v })} />
            </div>
          </div>
        </div>

        <Separator />

        {/* VAT Profiles */}
        <div>
          <p className="mb-2 text-sm font-medium">VAT profiles</p>
          <div className="grid gap-3 sm:grid-cols-5">
            <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="VAT 15%" /></Field>
            <Field label="Rate %"><Input type="number" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: Number(e.target.value) })} /></Field>
            <Field label="Type">
              <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as TTaxType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="reduced">Reduced</SelectItem>
                  <SelectItem value="zero">Zero-rated</SelectItem>
                  <SelectItem value="exempt">Exempt</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Description"><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="optional" /></Field>
            <div className="flex items-end"><Button type="button" className="w-full" onClick={saveProfile}>Add profile</Button></div>
          </div>
          <div className="mt-3 rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(profiles ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No VAT profiles yet</TableCell></TableRow>
                ) : (profiles ?? []).map((p: TTaxProfile) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{Number(p.rate).toFixed(2)}%</TableCell>
                    <TableCell><Badge variant="outline">{p.type}</Badge></TableCell>
                    <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => removeProfile(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </fieldset>
    </Panel>
  );
}

/* ---------- 7. Payments ---------- */
function PaymentPanel() {
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const getS = useServerFn(getPaymentSettings);
  const updS = useServerFn(updatePaymentSettings);
  const getGW = useServerFn(listGateways);
  const upGW = useServerFn(upsertGateway);
  const delGW = useServerFn(deleteGateway);
  const getStl = useServerFn(listSettlements);

  const { data: s, refetch: refetchS } = useQuery({
    queryKey: ["payment-settings", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getS({ data: { tenant_id: currentTenantId! } }),
  });
  const { data: gateways, refetch: refetchGW } = useQuery({
    queryKey: ["payment-gateways", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getGW({ data: { tenant_id: currentTenantId! } }),
  });
  const { data: settlements } = useQuery({
    queryKey: ["payment-settlements", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getStl({ data: { tenant_id: currentTenantId!, limit: 25 } }),
  });

  const patch = async (p: Partial<TPaySettings>) => {
    if (!currentTenantId || access.readOnly) return;
    try {
      await updS({ data: { tenant_id: currentTenantId, patch: p as any } });
      await refetchS();
      toast.success("Payment settings updated");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const METHODS: { key: keyof TPaySettings; method: TPayMethod; label: string }[] = [
    { key: "cash_enabled",   method: "cash",   label: "Cash" },
    { key: "card_enabled",   method: "card",   label: "Card" },
    { key: "bank_enabled",   method: "bank",   label: "Bank" },
    { key: "bkash_enabled",  method: "bkash",  label: "bKash" },
    { key: "nagad_enabled",  method: "nagad",  label: "Nagad" },
    { key: "rocket_enabled", method: "rocket", label: "Rocket" },
  ];

  const PROVIDERS = ["bkash","nagad","rocket","sslcommerz","stripe","manual"];

  const [draft, setDraft] = useState<{ provider: string; merchant_id: string; api_key: string; secret_key: string; webhook_url: string; sandbox: boolean; status: "active"|"inactive" }>({
    provider: "bkash", merchant_id: "", api_key: "", secret_key: "", webhook_url: "", sandbox: true, status: "inactive",
  });

  const saveGateway = async () => {
    if (!currentTenantId) return;
    try {
      const existing = (gateways ?? []).find((g: any) => g.provider === draft.provider);
      await upGW({ data: { tenant_id: currentTenantId, gateway: { ...draft, id: existing?.id } } });
      await refetchGW();
      toast.success("Gateway saved");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const removeGateway = async (id: string) => {
    if (!currentTenantId) return;
    try { await delGW({ data: { tenant_id: currentTenantId, id } }); await refetchGW(); toast.success("Removed"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  return (
    <Panel title="Payment settings" description="Methods, credit, refunds, gateways and settlement reconciliation.">
      <fieldset disabled={access.readOnly} className="contents">
        {/* Methods */}
        <div>
          <p className="mb-2 text-sm font-medium">Payment methods</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {METHODS.map((m) => (
              <div key={m.method} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="text-sm font-medium">{m.label}</span>
                <Switch checked={!!s?.[m.key]} onCheckedChange={(v) => patch({ [m.key]: v } as any)} />
              </div>
            ))}
          </div>
        </div>

        <Field label="Default payment method">
          <Select value={s?.default_payment_method ?? "cash"} onValueChange={(v) => patch({ default_payment_method: v as TPayMethod })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {METHODS.filter(m => s?.[m.key]).map(m => (
                <SelectItem key={m.method} value={m.method}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Separator />

        {/* Credit / Split / Refund */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div><p className="text-sm font-medium">Credit sale</p><p className="text-xs text-muted-foreground">Allow customer due / AR</p></div>
            <Switch checked={!!s?.credit_sale_enabled} onCheckedChange={(v) => patch({ credit_sale_enabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div><p className="text-sm font-medium">Split payment</p><p className="text-xs text-muted-foreground">Multiple methods per sale</p></div>
            <Switch checked={!!s?.partial_payment_enabled} onCheckedChange={(v) => patch({ partial_payment_enabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div><p className="text-sm font-medium">Refunds</p><p className="text-xs text-muted-foreground">Enable sales returns & refunds</p></div>
            <Switch checked={!!s?.refund_enabled} onCheckedChange={(v) => patch({ refund_enabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 sm:col-span-3">
            <div><p className="text-sm font-medium">Auto-reconcile gateway settlements</p><p className="text-xs text-muted-foreground">Match payments and collections to gateway settlements automatically</p></div>
            <Switch checked={!!s?.auto_reconcile} onCheckedChange={(v) => patch({ auto_reconcile: v })} />
          </div>
        </div>
      </fieldset>

      <Separator />

      {/* Gateways */}
      <div>
        <p className="mb-2 text-sm font-medium">Payment gateways</p>
        <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
          <Field label="Provider">
            <Select value={draft.provider} onValueChange={(v) => setDraft({ ...draft, provider: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Merchant ID"><Input value={draft.merchant_id} onChange={(e) => setDraft({ ...draft, merchant_id: e.target.value })} /></Field>
          <Field label="API key"><Input value={draft.api_key} onChange={(e) => setDraft({ ...draft, api_key: e.target.value })} /></Field>
          <Field label="Secret"><Input type="password" value={draft.secret_key} onChange={(e) => setDraft({ ...draft, secret_key: e.target.value })} /></Field>
          <Field label="Webhook URL"><Input value={draft.webhook_url} onChange={(e) => setDraft({ ...draft, webhook_url: e.target.value })} /></Field>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.sandbox} onCheckedChange={(v) => setDraft({ ...draft, sandbox: v })} /> Sandbox</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={draft.status === "active"} onCheckedChange={(v) => setDraft({ ...draft, status: v ? "active" : "inactive" })} /> Active</label>
            <Button size="sm" disabled={access.readOnly} onClick={saveGateway}>Save</Button>
          </div>
        </div>

        <div className="mt-3">
          <Table>
            <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Merchant</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(gateways ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No gateways configured.</TableCell></TableRow>
              ) : (gateways ?? []).map((g: any) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium capitalize">{g.provider}</TableCell>
                  <TableCell>{g.merchant_id ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{g.sandbox ? "Sandbox" : "Live"}</Badge></TableCell>
                  <TableCell>{g.status === "active"
                    ? <Badge className="bg-emerald-500 text-white">Active</Badge>
                    : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={access.readOnly} onClick={() => removeGateway(g.id)}>Remove</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Separator />

      {/* Settlements */}
      <div>
        <p className="mb-2 text-sm font-medium">Recent settlements</p>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Provider</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Fees</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {(settlements ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No settlements yet.</TableCell></TableRow>
            ) : (settlements ?? []).map((st: any) => (
              <TableRow key={st.id}>
                <TableCell>{new Date(st.settled_at ?? st.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="capitalize">{st.provider}</TableCell>
                <TableCell className="text-right">{Number(st.amount).toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right">{Number(st.fees).toLocaleString("en-IN")}</TableCell>
                <TableCell className="text-right font-medium">{Number(st.net_amount).toLocaleString("en-IN")}</TableCell>
                <TableCell><Badge variant="outline">{st.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}


/* ---------- 8. Printers (modernized) ---------- */
function PrinterPanel() {
  const navigate = useNavigate();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const getS = useServerFn(getPrinterSettings);
  const updS = useServerFn(updatePrinterSettings);
  const listP = useServerFn(listPrinters);
  const upP = useServerFn(upsertPrinter);
  const delP = useServerFn(deletePrinter);
  const testP = useServerFn(testPrinter);

  const { data: s, refetch: refetchS } = useQuery({
    queryKey: ["printer-settings", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getS({ data: { tenant_id: currentTenantId! } }),
  });
  const { data: printers, refetch: refetchP } = useQuery({
    queryKey: ["printer-profiles", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => listP({ data: { tenant_id: currentTenantId! } }),
  });

  const patch = async (p: Partial<TPrinterSettings>) => {
    if (!currentTenantId || access.readOnly) return;
    try {
      await updS({ data: { tenant_id: currentTenantId, patch: p as any } });
      await refetchS();
      toast.success("Saved");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ name: string; printer_type: TPrinterType; driver: string; paper_size: string }>({
    name: "", printer_type: "thermal", driver: "ESC/POS", paper_size: "80mm",
  });
  const savePrinter = async () => {
    if (!currentTenantId || !draft.name.trim()) { toast.error("Name required"); return; }
    try {
      await upP({ data: {
        tenant_id: currentTenantId,
        name: draft.name.trim(),
        printer_type: draft.printer_type,
        driver: draft.driver || null,
        paper_size: draft.paper_size || null,
        status: "active",
        connection: {},
      }});
      setDraft({ name: "", printer_type: "thermal", driver: "ESC/POS", paper_size: "80mm" });
      setOpen(false);
      await refetchP();
      toast.success("Printer added");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const removePrinter = async (id: string) => {
    if (!currentTenantId) return;
    try { await delP({ data: { tenant_id: currentTenantId, id } }); await refetchP(); toast.success("Removed"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const runTest = async (id: string) => {
    if (!currentTenantId) return;
    try { await testP({ data: { tenant_id: currentTenantId, id } }); toast.success("Test page sent"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  const list = printers ?? [];
  const ofType = (t: TPrinterType) => list.filter(p => p.printer_type === t && p.status === "active");
  const stats = {
    total: list.length,
    active: list.filter(p => p.status === "active").length,
    thermal: list.filter(p => p.printer_type === "thermal").length,
    a4: list.filter(p => p.printer_type === "a4").length,
  };

  return (
    <Panel
      title="Printers"
      description="Profiles, routing, auto-print and template defaults."
    >
      {/* Navigation actions (kept outside disabled fieldset so they're always clickable) */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => navigate({ to: "/settings/printing" })}>
          <Settings2 className="h-4 w-4 mr-1.5" /> Advanced
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => navigate({ to: "/settings/printing/wizard" })}>
          <Sliders className="h-4 w-4 mr-1.5" /> Setup Wizard
        </Button>
      </div>
      <fieldset disabled={access.readOnly || !s} className="contents">
        {/* Top stats + actions */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Total printers", value: stats.total, icon: Printer, tone: "bg-primary/10 text-primary" },
            { label: "Active", value: stats.active, icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-600" },
            { label: "Thermal", value: stats.thermal, icon: Receipt, tone: "bg-blue-500/10 text-blue-600" },
            { label: "A4 / Invoice", value: stats.a4, icon: FileBarChart, tone: "bg-violet-500/10 text-violet-600" },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${c.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="text-xl font-semibold tabular-nums">{c.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">Manage all connected printers and how documents are routed to them.</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setOpen((v) => !v)}>
              <Printer className="h-4 w-4 mr-1.5" /> {open ? "Cancel" : "Add printer"}
            </Button>
          </div>
        </div>


        {/* Inline Add form (collapsible) */}
        {open && (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Name"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Front counter" /></Field>
              <Field label="Type">
                <Select value={draft.printer_type} onValueChange={(v) => setDraft({ ...draft, printer_type: v as TPrinterType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thermal">Thermal</SelectItem>
                    <SelectItem value="a4">A4</SelectItem>
                    <SelectItem value="barcode">Barcode</SelectItem>
                    <SelectItem value="label">Label</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Driver"><Input value={draft.driver} onChange={(e) => setDraft({ ...draft, driver: e.target.value })} placeholder="ESC/POS" /></Field>
              <Field label="Paper size"><Input value={draft.paper_size} onChange={(e) => setDraft({ ...draft, paper_size: e.target.value })} placeholder="80mm" /></Field>
              <div className="flex items-end"><Button type="button" className="w-full" onClick={savePrinter}>Save printer</Button></div>
            </div>
          </div>
        )}

        {/* Printers table or empty state */}
        <div className="rounded-xl border border-border overflow-hidden">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
                <Printer className="h-7 w-7" />
              </div>
              <div>
                <p className="font-semibold">No printers configured</p>
                <p className="text-sm text-muted-foreground">Add your first printer to start routing receipts, invoices and barcodes.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setOpen(true)}><Printer className="h-4 w-4 mr-1.5" /> Add printer</Button>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: "/settings/printing" })}>Auto detect</Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Paper</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p: TPrinterProfile) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
                          <Printer className="h-4 w-4" />
                        </div>
                        {p.name}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{p.printer_type}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{p.driver ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.paper_size ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"} className="gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="outline" size="sm" onClick={() => runTest(p.id)}>Test</Button>
                      <Button variant="ghost" size="sm" onClick={() => removePrinter(p.id)} aria-label="Delete printer"><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Separator />

        {/* Default routing */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Default routing</p>
              <p className="text-xs text-muted-foreground">Pick which printer handles each document type by default.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { key: "default_receipt_printer", label: "Receipts", type: "thermal" as TPrinterType, icon: Receipt },
              { key: "default_invoice_printer", label: "Invoices", type: "a4" as TPrinterType, icon: FileBarChart },
              { key: "default_barcode_printer", label: "Barcodes", type: "barcode" as TPrinterType, icon: Scan },
              { key: "default_label_printer",   label: "Labels",   type: "label" as TPrinterType, icon: Hash },
            ].map(row => {
              const Icon = row.icon;
              const value = ((s as any)?.[row.key] as string) ?? "none";
              return (
                <div key={row.key} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-muted-foreground" /> {row.label}
                  </div>
                  <Select value={value} onValueChange={(v) => patch({ [row.key]: v === "none" ? null : v } as any)}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {ofType(row.type).map(p => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Auto print */}
        <div>
          <p className="mb-3 text-sm font-semibold">Auto print</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["auto_print_receipt", "Receipt after sale", Receipt],
              ["auto_print_invoice", "Invoice after sale", FileBarChart],
              ["auto_print_barcode", "Barcode on product create", Scan],
            ] as const).map(([k, l, Icon]) => (
              <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors">
                <span className="flex items-center gap-2 text-sm">
                  <Icon className="h-4 w-4 text-muted-foreground" /> {l}
                </span>
                <Switch checked={!!(s as any)?.[k]} onCheckedChange={(v) => patch({ [k]: v } as any)} />
              </label>
            ))}
          </div>
        </div>

        <Separator />

        {/* Formats */}
        <div>
          <p className="mb-3 text-sm font-semibold">Document formats</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Receipt format">
              <Select value={s?.receipt_format ?? "80mm"} onValueChange={(v) => patch({ receipt_format: v as TReceiptFormat })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="38mm">Thermal 38mm</SelectItem>
                  <SelectItem value="58mm">Thermal 58mm</SelectItem>
                  <SelectItem value="80mm">Thermal 80mm</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Invoice format">
              <Select value={s?.invoice_format ?? "A4"} onValueChange={(v) => patch({ invoice_format: v as "A4" | "Letter" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="Letter">Letter</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Barcode symbology">
              <Select
                value={s?.barcode?.symbology ?? "CODE128"}
                onValueChange={(v) => patch({ barcode: { ...(s?.barcode ?? { symbology: "CODE128", label_size: "40x20" }), symbology: v as any } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CODE128">Code128</SelectItem>
                  <SelectItem value="EAN13">EAN13</SelectItem>
                  <SelectItem value="QR">QR</SelectItem>
                  <SelectItem value="DATAMATRIX">DataMatrix</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Label size">
              <Select
                value={s?.barcode?.label_size ?? "40x20"}
                onValueChange={(v) => patch({ barcode: { ...(s?.barcode ?? { symbology: "CODE128", label_size: "40x20" }), label_size: v } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="40x20">40 × 20</SelectItem>
                  <SelectItem value="50x25">50 × 25</SelectItem>
                  <SelectItem value="60x30">60 × 30</SelectItem>
                  <SelectItem value="100x50">100 × 50</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <Separator />

        {/* Content grouped: Thermal + A4 side by side */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Thermal receipt content</p>
            </div>
            <div className="space-y-2">
              {([
                ["show_logo", "Show logo"],
                ["show_footer", "Show footer"],
                ["show_qr", "Show QR"],
                ["show_tax_summary", "Show tax summary"],
                ["show_cashier", "Show cashier"],
              ] as const).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer">
                  <span className="text-sm">{l}</span>
                  <Switch
                    checked={!!s?.thermal?.[k]}
                    onCheckedChange={(v) => patch({ thermal: { ...(s?.thermal ?? DEFAULT_THERMAL), [k]: v } as any })}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileBarChart className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">A4 invoice content</p>
            </div>
            <div className="space-y-2">
              {([
                ["show_header", "Show header"],
                ["show_footer", "Show footer"],
                ["show_terms", "Show terms"],
                ["show_signature", "Show signature"],
                ["watermark", "Show watermark"],
              ] as const).map(([k, l]) => (
                <label key={k} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors cursor-pointer">
                  <span className="text-sm">{l}</span>
                  <Switch
                    checked={!!s?.a4?.[k]}
                    onCheckedChange={(v) => patch({ a4: { ...(s?.a4 ?? DEFAULT_A4), [k]: v } as any })}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </fieldset>
    </Panel>
  );
}



const DEFAULT_THERMAL = { show_logo: true, show_footer: true, show_qr: false, show_tax_summary: true, show_cashier: true };
const DEFAULT_A4 = { show_header: true, show_footer: true, show_terms: true, show_signature: true, watermark: false };

/* ---------- 9. Users & Permissions ---------- */
function UsersPanel() {
  const roles = [
    { name: "Owner", users: 1, perms: "Full access" },
    { name: "Manager", users: 2, perms: "All except billing" },
    { name: "Pharmacist", users: 4, perms: "Sales, inventory, Rx" },
    { name: "Cashier", users: 3, perms: "POS only" },
  ];
  return (
    <Panel title="Users & permissions" description="Seats, roles and login policies.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="User limit (plan)"><Input defaultValue="10" disabled /></Field>
        <Field label="Active users"><Input defaultValue="10" disabled /></Field>
        <Field label="Session timeout (min)"><Input type="number" defaultValue={60} /></Field>
      </div>
      <Separator />
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium">Roles</p>
          <Button size="sm" variant="outline">Add role</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Role</TableHead><TableHead>Users</TableHead><TableHead>Permissions</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {roles.map(r => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.users}</TableCell>
                <TableCell className="text-muted-foreground">{r.perms}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost">Edit</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Separator />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <ToggleRow title="Restrict login by IP" />
        <ToggleRow title="Restrict login by working hours" />
      </div>
    </Panel>
  );
}

/* ---------- 10. Notifications ---------- */
function NotificationsPanel() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [tenant, setTenant] = useState<Record<string, boolean | string> | null>(null);
  const [prefs, setPrefs] = useState<{
    email_enabled: boolean; push_enabled: boolean; sms_enabled: boolean;
    whatsapp_enabled: boolean; digest_enabled: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const getT = useServerFn(getNotificationSettings);
  const setT = useServerFn(updateNotificationSettings);
  const getU = useServerFn(getUserNotificationPreferences);
  const setU = useServerFn(updateUserNotificationPreferences);

  useEffect(() => {
    if (!tenantId) return;
    let live = true;
    (async () => {
      try {
        const [t, u] = await Promise.all([
          getT({ data: { tenant_id: tenantId } }),
          getU(),
        ]);
        if (!live) return;
        setTenant(t);
        setPrefs({
          email_enabled: u.email_enabled, push_enabled: u.push_enabled,
          sms_enabled: u.sms_enabled, whatsapp_enabled: u.whatsapp_enabled,
          digest_enabled: u.digest_enabled,
        });
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load notification settings");
      }
    })();
    return () => { live = false; };
  }, [tenantId, getT, getU]);

  async function patchTenant(patch: Record<string, boolean | string>) {
    if (!tenantId || !tenant) return;
    const prev = tenant;
    setTenant({ ...tenant, ...patch });
    setSaving(true);
    try {
      const next = await setT({ data: { tenant_id: tenantId, patch } });
      setTenant(next);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
      setTenant(prev);
    } finally { setSaving(false); }
  }

  async function patchUser(patch: Partial<NonNullable<typeof prefs>>) {
    if (!prefs) return;
    const prev = prefs;
    setPrefs({ ...prefs, ...patch });
    try {
      await setU({ data: { tenant_id: tenantId || undefined, patch } });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
      setPrefs(prev);
    }
  }

  if (!tenant || !prefs) {
    return <Panel title="Notifications" description="Loading…"><div className="text-sm text-muted-foreground">Loading notification settings…</div></Panel>;
  }

  const tb = (key: string) => Boolean(tenant[key]);

  const sections: { title: string; desc: string; rows: { key: string; name: string; desc: string }[] }[] = [
    { title: "Inventory alerts", desc: "Stock movements and product health.", rows: [
      { key: "low_stock", name: "Low stock", desc: "Stock below reorder point" },
      { key: "out_of_stock", name: "Out of stock", desc: "Stock reaches zero" },
      { key: "expiry", name: "Expiry warning", desc: "Items approaching expiry" },
      { key: "batch_recall", name: "Batch recall", desc: "A batch is recalled" },
    ]},
    { title: "Sales alerts", desc: "POS, refunds and price overrides.", rows: [
      { key: "large_sale", name: "Large sale", desc: "Sale above threshold" },
      { key: "refund", name: "Refund processed", desc: "Sale return / refund" },
      { key: "discount_override", name: "Discount override", desc: "Manual discount applied" },
    ]},
    { title: "Procurement alerts", desc: "POs, GRN and stock transfers.", rows: [
      { key: "po_approved", name: "PO approved", desc: "Purchase order approved" },
      { key: "grn_approved", name: "GRN approved", desc: "Goods receipt approved" },
      { key: "transfer_approved", name: "Transfer approved", desc: "Stock transfer approved" },
      { key: "returns", name: "Purchase return", desc: "Return to supplier created" },
    ]},
    { title: "Clinical alerts", desc: "Pharmacist safety gates.", rows: [
      { key: "interaction", name: "Drug interaction", desc: "Detected interaction" },
      { key: "allergy", name: "Allergy warning", desc: "Patient allergy match" },
      { key: "critical_prescription", name: "Critical prescription", desc: "High-risk dispensing" },
    ]},
    { title: "Security alerts", desc: "Account and access events.", rows: [
      { key: "login_alerts", name: "New login", desc: "New device or location" },
      { key: "failed_login", name: "Failed login", desc: "Repeated failed attempts" },
      { key: "permission_change", name: "Permission change", desc: "User permissions modified" },
      { key: "role_change", name: "Role change", desc: "User role reassigned" },
    ]},
  ];

  return (
    <Panel title="Notifications" description="Tenant-wide alerts and personal delivery preferences.">
      <div>
        <p className="mb-2 text-sm font-semibold">Delivery channels (tenant default)</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <ToggleRow title="Email" description="Send notifications via email" checked={tb("email")} onCheckedChange={(v) => patchTenant({ email: v })} />
          <ToggleRow title="Push"  description="In-app and browser push"     checked={tb("push")}  onCheckedChange={(v) => patchTenant({ push: v })} />
          <ToggleRow title="SMS"   description="Text messages (carrier fees)" checked={tb("sms")}  onCheckedChange={(v) => patchTenant({ sms: v })} />
        </div>
      </div>

      <Separator />

      {sections.map(s => (
        <div key={s.title}>
          <p className="mb-1 text-sm font-semibold">{s.title}</p>
          <p className="mb-2 text-xs text-muted-foreground">{s.desc}</p>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Alert</TableHead><TableHead className="text-center w-28">Enabled</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {s.rows.map(r => (
                <TableRow key={r.key}>
                  <TableCell><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.desc}</p></TableCell>
                  <TableCell className="text-center">
                    <Switch checked={tb(r.key)} onCheckedChange={(v) => patchTenant({ [r.key]: v })} disabled={saving} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4" />
        </div>
      ))}

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">Digest reports (tenant)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <ToggleRow title="Daily digest" description={`Sent daily at ${String(tenant.daily_digest_time ?? "08:00")}`} checked={tb("daily_digest")} onCheckedChange={(v) => patchTenant({ daily_digest: v })} />
          <ToggleRow title="Weekly digest" description={`Sent ${String(tenant.weekly_digest_day ?? "monday")} at ${String(tenant.weekly_digest_time ?? "08:00")}`} checked={tb("weekly_digest")} onCheckedChange={(v) => patchTenant({ weekly_digest: v })} />
          <ToggleRow title="Executive alerts" description="Critical KPIs and anomalies" checked={tb("executive_alerts")} onCheckedChange={(v) => patchTenant({ executive_alerts: v })} />
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-1 text-sm font-semibold">My delivery preferences</p>
        <p className="mb-2 text-xs text-muted-foreground">Overrides tenant defaults for your account only.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <ToggleRow title="Email to me" checked={prefs.email_enabled} onCheckedChange={(v) => patchUser({ email_enabled: v })} />
          <ToggleRow title="Push to me"  checked={prefs.push_enabled}  onCheckedChange={(v) => patchUser({ push_enabled: v })} />
          <ToggleRow title="SMS to me"   checked={prefs.sms_enabled}   onCheckedChange={(v) => patchUser({ sms_enabled: v })} />
          <ToggleRow title="Send me digests" checked={prefs.digest_enabled} onCheckedChange={(v) => patchUser({ digest_enabled: v })} />
        </div>
      </div>
    </Panel>
  );
}

/* ---------- 11. Backup & Restore ---------- */
function BackupPanel() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const [s, setS] = useState<TBackupSettings | null>(null);
  const [jobs, setJobs] = useState<TBackupJob[]>([]);
  const [history, setHistory] = useState<TBackupHistoryRow[]>([]);
  const [restores, setRestores] = useState<TRestoreHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [newJob, setNewJob] = useState<{
    name: string; backup_type: TBackupType; frequency: TBackupFreq;
    storage: TBackupStorage; format: TBackupFormat; encrypted: boolean;
  }>({ name: "", backup_type: "database", frequency: "daily", storage: "cloud", format: "zip", encrypted: true });

  const getS = useServerFn(getBackupSettings);
  const setSet = useServerFn(updateBackupSettings);
  const listJ = useServerFn(listBackupJobs);
  const upJ = useServerFn(upsertBackupJob);
  const delJ = useServerFn(deleteBackupJob);
  const listH = useServerFn(listBackupHistory);
  const run = useServerFn(runBackup);
  const listR = useServerFn(listRestoreHistory);
  const restore = useServerFn(restoreBackup);

  async function refresh() {
    if (!tenantId) return;
    const [a, b, c, d] = await Promise.all([
      getS({ data: { tenant_id: tenantId } }),
      listJ({ data: { tenant_id: tenantId } }),
      listH({ data: { tenant_id: tenantId, limit: 50 } }),
      listR({ data: { tenant_id: tenantId, limit: 50 } }),
    ]);
    setS(a); setJobs(b); setHistory(c); setRestores(d);
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tenantId]);

  async function patch(p: Partial<TBackupSettings>) {
    if (!tenantId || !s) return;
    setBusy(true);
    try { setS(await setSet({ data: { tenant_id: tenantId, patch: p } })); toast.success("Saved"); }
    catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function addJob() {
    if (!tenantId || !newJob.name.trim()) return;
    setBusy(true);
    try {
      await upJ({ data: { tenant_id: tenantId, ...newJob } });
      setNewJob({ name: "", backup_type: "database", frequency: "daily", storage: "cloud", format: "zip", encrypted: true });
      await refresh();
      toast.success("Backup job created");
    } catch (e: any) { toast.error(e.message ?? "Failed"); } finally { setBusy(false); }
  }

  async function runManual(backup_type: TBackupType = "database") {
    if (!tenantId) return;
    setBusy(true);
    try {
      await run({ data: { tenant_id: tenantId, backup_type, trigger: "manual" } });
      await refresh();
      toast.success("Backup completed");
    } catch (e: any) { toast.error(e.message ?? "Backup failed"); } finally { setBusy(false); }
  }

  async function doRestore(row: TBackupHistoryRow) {
    if (!tenantId) return;
    if (!confirm(`Restore from ${row.file_name}? This may overwrite data.`)) return;
    setBusy(true);
    try {
      await restore({ data: { tenant_id: tenantId, backup_id: row.id, restore_type: "full", confirm: true } });
      await refresh();
      toast.success("Restore completed");
    } catch (e: any) { toast.error(e.message ?? "Restore failed"); } finally { setBusy(false); }
  }

  const lastBackup = history.find(h => h.status === "success");
  const nextRun = jobs.find(j => j.next_run_at)?.next_run_at;

  return (
    <Panel title="Backup & restore" description="Disaster recovery center for backups, schedules and restores.">
      {/* Overview */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Last backup</p><p className="mt-1 font-medium">{lastBackup ? new Date(lastBackup.started_at).toLocaleString() : "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Next backup</p><p className="mt-1 font-medium">{nextRun ? new Date(nextRun).toLocaleString() : "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active jobs</p><p className="mt-1 font-medium">{jobs.filter(j => j.status === "active").length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total backups</p><p className="mt-1 font-medium">{history.length}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => runManual("database")} disabled={busy || !tenantId}>Run manual backup</Button>
        <Button variant="outline" onClick={() => runManual("settings")} disabled={busy}>Backup settings</Button>
        <Button variant="outline" onClick={() => runManual("master_data")} disabled={busy}>Backup master data</Button>
      </div>

      <Separator />

      {/* Settings */}
      <div className="space-y-4">
        <p className="text-sm font-medium">Configuration</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <ToggleRow title="Enable auto backup" checked={!!s?.auto_backup_enabled} onCheckedChange={(v) => patch({ auto_backup_enabled: v })} />
          <ToggleRow title="Encrypted downloads" checked={!!s?.encrypted_downloads} onCheckedChange={(v) => patch({ encrypted_downloads: v })} />
          <ToggleRow title="Snapshot before restore" checked={!!s?.pre_restore_snapshot} onCheckedChange={(v) => patch({ pre_restore_snapshot: v })} />
          <ToggleRow title="Require restore confirmation" checked={!!s?.require_restore_confirmation} onCheckedChange={(v) => patch({ require_restore_confirmation: v })} />
          <ToggleRow title="Notify on success" checked={!!s?.notify_on_success} onCheckedChange={(v) => patch({ notify_on_success: v })} />
          <ToggleRow title="Notify on failure" checked={!!s?.notify_on_failure} onCheckedChange={(v) => patch({ notify_on_failure: v })} />
          <ToggleRow title="Notify on storage full" checked={!!s?.notify_on_storage_full} onCheckedChange={(v) => patch({ notify_on_storage_full: v })} />
          <div className="space-y-1">
            <Label>Retention (days)</Label>
            <Input type="number" min={1} value={s?.retention_days ?? 30}
              onChange={(e) => setS(s ? { ...s, retention_days: Number(e.target.value) } : s)}
              onBlur={() => s && patch({ retention_days: s.retention_days })} />
          </div>
          <div className="space-y-1">
            <Label>Default storage</Label>
            <Select value={s?.default_storage ?? "cloud"} onValueChange={(v) => patch({ default_storage: v as TBackupStorage })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local storage</SelectItem>
                <SelectItem value="cloud">Cloud storage</SelectItem>
                <SelectItem value="google_drive">Google Drive</SelectItem>
                <SelectItem value="s3">S3 compatible</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Default format</Label>
            <Select value={s?.default_format ?? "zip"} onValueChange={(v) => patch({ default_format: v as TBackupFormat })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sql">SQL</SelectItem>
                <SelectItem value="zip">ZIP</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Separator />

      {/* Backup jobs */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Backup jobs</p>
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
          <Input placeholder="Job name" value={newJob.name} onChange={(e) => setNewJob({ ...newJob, name: e.target.value })} />
          <Select value={newJob.backup_type} onValueChange={(v) => setNewJob({ ...newJob, backup_type: v as TBackupType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="database">Database</SelectItem>
              <SelectItem value="files">Files</SelectItem>
              <SelectItem value="database_files">Database + Files</SelectItem>
              <SelectItem value="settings">Settings</SelectItem>
              <SelectItem value="master_data">Master data</SelectItem>
            </SelectContent>
          </Select>
          <Select value={newJob.frequency} onValueChange={(v) => setNewJob({ ...newJob, frequency: v as TBackupFreq })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Select value={newJob.storage} onValueChange={(v) => setNewJob({ ...newJob, storage: v as TBackupStorage })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local</SelectItem>
              <SelectItem value="cloud">Cloud</SelectItem>
              <SelectItem value="google_drive">G. Drive</SelectItem>
              <SelectItem value="s3">S3</SelectItem>
            </SelectContent>
          </Select>
          <Select value={newJob.format} onValueChange={(v) => setNewJob({ ...newJob, format: v as TBackupFormat })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sql">SQL</SelectItem>
              <SelectItem value="zip">ZIP</SelectItem>
              <SelectItem value="json">JSON</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={addJob} disabled={busy || !newJob.name.trim()}>Add job</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Frequency</TableHead><TableHead>Storage</TableHead><TableHead>Status</TableHead><TableHead>Last run</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 && (<TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No backup jobs configured</TableCell></TableRow>)}
            {jobs.map(j => (
              <TableRow key={j.id}>
                <TableCell className="font-medium">{j.name}</TableCell>
                <TableCell>{j.backup_type}</TableCell>
                <TableCell>{j.frequency}</TableCell>
                <TableCell>{j.storage}</TableCell>
                <TableCell><Badge variant={j.status === "active" ? "default" : "secondary"}>{j.status}</Badge></TableCell>
                <TableCell>{j.last_run_at ? new Date(j.last_run_at).toLocaleString() : "—"}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => run({ data: { tenant_id: tenantId, backup_id: j.id, backup_type: j.backup_type, trigger: "manual" } }).then(refresh)}>Run</Button>
                  <Button size="sm" variant="ghost" onClick={() => delJ({ data: { tenant_id: tenantId, id: j.id } }).then(refresh)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Separator />

      {/* Backup history */}
      <div>
        <p className="mb-2 text-sm font-medium">Backup history</p>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Date</TableHead><TableHead>File</TableHead><TableHead>Type</TableHead><TableHead>Size</TableHead><TableHead>Trigger</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 && (<TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No backups yet</TableCell></TableRow>)}
            {history.map(h => (
              <TableRow key={h.id}>
                <TableCell>{new Date(h.started_at).toLocaleString()}</TableCell>
                <TableCell className="truncate max-w-[200px]">{h.file_name}</TableCell>
                <TableCell>{h.backup_type}</TableCell>
                <TableCell>{h.file_size ? `${(h.file_size / 1_048_576).toFixed(1)} MB` : "—"}</TableCell>
                <TableCell>{h.trigger}</TableCell>
                <TableCell>
                  <Badge variant={h.status === "success" ? "default" : h.status === "failed" ? "destructive" : "secondary"}>{h.status}</Badge>
                </TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" disabled={h.status !== "success"} onClick={() => toast.info("Download link will be emailed")}>Download</Button>
                  <Button size="sm" variant="ghost" disabled={h.status !== "success" || busy} onClick={() => doRestore(h)}>Restore</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Separator />

      {/* Restore history */}
      <div>
        <p className="mb-2 text-sm font-medium">Restore history</p>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {restores.length === 0 && (<TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No restores yet</TableCell></TableRow>)}
            {restores.map(r => (
              <TableRow key={r.id}>
                <TableCell>{new Date(r.restored_at).toLocaleString()}</TableCell>
                <TableCell>{r.restore_type}</TableCell>
                <TableCell><Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.notes ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

/* ---------- 12. Security ---------- */
function SecurityPanel() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [s, setS] = useState<Record<string, boolean | number> | null>(null);
  const [ips, setIps] = useState<{ id: string; ip_address: string; description: string | null; created_at: string }[]>([]);
  const [newIp, setNewIp] = useState({ ip: "", desc: "" });
  const [saving, setSaving] = useState(false);

  const getS = useServerFn(getSecuritySettings);
  const setSec = useServerFn(updateSecuritySettings);
  const listIp = useServerFn(listAllowedIPs);
  const addIp = useServerFn(addAllowedIP);
  const rmIp = useServerFn(removeAllowedIP);

  useEffect(() => {
    if (!tenantId) return;
    let live = true;
    (async () => {
      try {
        const [sec, list] = await Promise.all([
          getS({ data: { tenant_id: tenantId } }),
          listIp({ data: { tenant_id: tenantId } }),
        ]);
        if (!live) return;
        setS(sec); setIps(list);
      } catch (e: any) { toast.error(e?.message ?? "Failed to load security settings"); }
    })();
    return () => { live = false; };
  }, [tenantId, getS, listIp]);

  async function patch(p: Record<string, boolean | number>) {
    if (!tenantId || !s) return;
    const prev = s;
    setS({ ...s, ...p });
    setSaving(true);
    try {
      const next = await setSec({ data: { tenant_id: tenantId, patch: p } });
      setS(next);
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); setS(prev); }
    finally { setSaving(false); }
  }

  async function handleAddIp() {
    if (!newIp.ip.trim()) return;
    try {
      await addIp({ data: { tenant_id: tenantId, ip_address: newIp.ip.trim(), description: newIp.desc.trim() || undefined } });
      const list = await listIp({ data: { tenant_id: tenantId } });
      setIps(list); setNewIp({ ip: "", desc: "" });
    } catch (e: any) { toast.error(e?.message ?? "Could not add IP"); }
  }
  async function handleRmIp(id: string) {
    try {
      await rmIp({ data: { tenant_id: tenantId, id } });
      setIps(prev => prev.filter(x => x.id !== id));
    } catch (e: any) { toast.error(e?.message ?? "Could not remove"); }
  }

  if (!s) return <Panel title="Security" description="Loading…"><div className="text-sm text-muted-foreground">Loading…</div></Panel>;

  const sb = (k: string) => Boolean(s[k]);
  const sn = (k: string) => Number(s[k] ?? 0);

  return (
    <Panel title="Security" description="Enterprise security policies for your tenant.">
      <div>
        <p className="mb-2 text-sm font-semibold">Password policy</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Field label="Minimum length" htmlFor="pw-min">
            <Input id="pw-min" type="number" min={6} max={64} value={sn("password_min_length")}
              onChange={(e) => patch({ password_min_length: Math.max(6, Math.min(64, Number(e.target.value) || 8)) })} />
          </Field>
          <div />
          <ToggleRow title="Require uppercase letter" checked={sb("password_require_uppercase")} onCheckedChange={(v) => patch({ password_require_uppercase: v })} />
          <ToggleRow title="Require lowercase letter" checked={sb("password_require_lowercase")} onCheckedChange={(v) => patch({ password_require_lowercase: v })} />
          <ToggleRow title="Require number" checked={sb("password_require_number")} onCheckedChange={(v) => patch({ password_require_number: v })} />
          <ToggleRow title="Require special character" checked={sb("password_require_special")} onCheckedChange={(v) => patch({ password_require_special: v })} />
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">Session control</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Field label="Auto-logout (minutes)" htmlFor="sess-to">
            <select id="sess-to" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={sn("session_timeout_minutes")}
              onChange={(e) => patch({ session_timeout_minutes: Number(e.target.value) })}>
              {[15, 30, 60, 120, 240].map(v => <option key={v} value={v}>{v} minutes</option>)}
            </select>
          </Field>
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">Login protection</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Field label="Max failed login attempts" htmlFor="fail-max">
            <Input id="fail-max" type="number" min={1} max={20} value={sn("max_failed_logins")}
              onChange={(e) => patch({ max_failed_logins: Math.max(1, Math.min(20, Number(e.target.value) || 5)) })} />
          </Field>
          <Field label="Lockout duration (minutes)" htmlFor="lock-min">
            <Input id="lock-min" type="number" min={1} max={1440} value={sn("lockout_minutes")}
              onChange={(e) => patch({ lockout_minutes: Math.max(1, Math.min(1440, Number(e.target.value) || 15)) })} />
          </Field>
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">Two-factor authentication</p>
        <ToggleRow title="Require 2FA for all users" description="Email OTP required at sign-in. TOTP support coming soon."
          checked={sb("require_2fa")} onCheckedChange={(v) => patch({ require_2fa: v })} />
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">Device restrictions</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <ToggleRow title="Allow multiple devices" checked={sb("allow_multiple_devices")} onCheckedChange={(v) => patch({ allow_multiple_devices: v })} />
          <Field label="Max devices per user" htmlFor="dev-max">
            <Input id="dev-max" type="number" min={1} max={20} value={sn("max_devices_per_user")}
              disabled={!sb("allow_multiple_devices")}
              onChange={(e) => patch({ max_devices_per_user: Math.max(1, Math.min(20, Number(e.target.value) || 3)) })} />
          </Field>
          <ToggleRow title="Require device registration" description="New devices must be approved before login"
            checked={sb("device_registration_required")} onCheckedChange={(v) => patch({ device_registration_required: v })} />
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">IP whitelist</p>
        <ToggleRow title="Enforce IP whitelist" description="Only listed IP addresses can sign in"
          checked={sb("ip_whitelist_enabled")} onCheckedChange={(v) => patch({ ip_whitelist_enabled: v })} />
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Input placeholder="192.168.1.1" value={newIp.ip} onChange={(e) => setNewIp({ ...newIp, ip: e.target.value })} />
          <Input placeholder="Description (e.g. office VPN)" value={newIp.desc} onChange={(e) => setNewIp({ ...newIp, desc: e.target.value })} />
          <Button onClick={handleAddIp} disabled={!newIp.ip.trim() || saving}>Add IP</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>IP address</TableHead><TableHead>Description</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {ips.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">No IPs whitelisted</TableCell></TableRow>
            ) : ips.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">{i.ip_address}</TableCell>
                <TableCell>{i.description ?? "—"}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => handleRmIp(i.id)}>Remove</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">Security alerts</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <ToggleRow title="Login alerts" description="Notify on new sign-in" checked={sb("login_alerts")} onCheckedChange={(v) => patch({ login_alerts: v })} />
          <ToggleRow title="Role change alerts" checked={sb("role_change_alerts")} onCheckedChange={(v) => patch({ role_change_alerts: v })} />
          <ToggleRow title="Permission change alerts" checked={sb("permission_change_alerts")} onCheckedChange={(v) => patch({ permission_change_alerts: v })} />
        </div>
      </div>
    </Panel>
  );
}

/* ---------- 13. Subscription ---------- */
function SubscriptionPanel() {
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const getSettings = useServerFn(getSubscriptionSettings);
  const updSettings = useServerFn(updateSubscriptionSettings);
  const getOverview = useServerFn(getSubscriptionOverview);

  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ["subscription-settings", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getSettings({ data: { tenant_id: currentTenantId! } }),
  });
  const { data: overview } = useQuery({
    queryKey: ["subscription-overview", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getOverview({ data: { tenant_id: currentTenantId! } }),
  });

  const sub: any = overview?.subscription;
  const plan: any = sub?.plan;
  const features: Record<string, any> = (plan?.features as any) ?? {};

  const patch = async (p: Partial<TSubSettings>) => {
    if (!currentTenantId || access.readOnly) return;
    try {
      await updSettings({ data: { tenant_id: currentTenantId, patch: p as any } });
      await refetchSettings();
      toast.success("Subscription settings updated");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    }
  };

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
  const statusBadge = (s?: string | null) => {
    const map: Record<string, string> = {
      active: "bg-emerald-500 text-white",
      trial: "bg-amber-500 text-white",
      grace: "bg-orange-500 text-white",
      expired: "bg-destructive text-destructive-foreground",
      suspended: "bg-destructive text-destructive-foreground",
    };
    return <Badge className={map[s ?? ""] ?? "bg-muted text-foreground"}>{s ?? "none"}</Badge>;
  };

  return (
    <Panel title="Subscription" description="Plan dashboard, usage, feature access, billing controls and renewal preferences.">
      {/* Current Plan */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Current plan</p>
          <p className="mt-1 text-lg font-semibold">{plan?.name ?? "—"}</p>
          <div className="mt-2">{statusBadge(sub?.status)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Started</p>
          <p className="mt-1 text-lg font-semibold">{fmt(sub?.current_period_start)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Renews / expires</p>
          <p className="mt-1 text-lg font-semibold">{fmt(sub?.current_period_end)}</p>
          {sub?.grace_period_ends_at && (
            <p className="mt-1 text-xs text-muted-foreground">Grace ends {fmt(sub.grace_period_ends_at)}</p>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Monthly price</p>
          <p className="mt-1 text-lg font-semibold">{plan ? `৳ ${Number(plan.price_bdt).toLocaleString("en-IN")}` : "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground capitalize">{sub?.billing_cycle ?? "monthly"}</p>
        </CardContent></Card>
      </div>

      <Separator />

      {/* Usage */}
      <div>
        <p className="mb-2 text-sm font-medium">Live usage vs plan limits</p>
        <div className="space-y-3">
          {(overview?.usage ?? []).map((u) => {
            const pct = u.limit && u.limit > 0 ? Math.min(100, (u.used / u.limit) * 100) : 0;
            return (
              <div key={u.resource}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="capitalize">{u.resource}</span>
                  <span className={cn("text-muted-foreground", u.over_limit && "text-destructive font-medium")}>
                    {u.used.toLocaleString()} / {u.limit ?? "Unlimited"}
                    {u.over_limit && " — limit reached"}
                  </span>
                </div>
                {u.limit && u.limit > 0 ? <Progress value={pct} /> : <div className="h-2 rounded bg-muted" />}
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Feature gating */}
      <div>
        <p className="mb-2 text-sm font-medium">Feature access</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {["pos","inventory","accounting","clinical","multi_warehouse","executive_bi","api_access","mobile_app","offline_mode","ai_prescription"].map((f) => {
            const enabled = features?.[f] === true || (Array.isArray(features?.enabled) && features.enabled.includes(f));
            return (
              <div key={f} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                <span className="capitalize">{f.replace(/_/g, " ")}</span>
                {enabled
                  ? <Badge className="bg-emerald-500 text-white">Enabled</Badge>
                  : <Badge variant="outline">Locked</Badge>}
              </div>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Renewal / billing preferences */}
      <fieldset disabled={access.readOnly || !settings} className="contents">
        <p className="mb-2 text-sm font-medium">Renewal & billing preferences</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Field label="Show plan & usage to all staff">
            <Switch checked={!!settings?.plan_visibility} onCheckedChange={(v) => patch({ plan_visibility: v })} />
          </Field>
          <Field label="Usage warnings (80% / 100%)">
            <Switch checked={!!settings?.usage_warnings} onCheckedChange={(v) => patch({ usage_warnings: v })} />
          </Field>
          <Field label="Renewal reminders (30/15/7/1 days)">
            <Switch checked={!!settings?.renewal_reminders} onCheckedChange={(v) => patch({ renewal_reminders: v })} />
          </Field>
          <Field label="Allow overage (continue after limit)">
            <Switch checked={!!settings?.allow_overage} onCheckedChange={(v) => patch({ allow_overage: v })} />
          </Field>
          <Field label="Grace period (days)">
            <Input
              type="number" min={0} max={90}
              value={settings?.grace_period_days ?? 7}
              onChange={(e) => patch({ grace_period_days: Math.max(0, Number(e.target.value || 0)) })}
            />
          </Field>
        </div>
      </fieldset>
    </Panel>
  );
}


/* ---------- 14. Language & Localization ---------- */
function LocalizationPanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { locale, save, isSaving } = useLocaleSettings(currentTenantId ?? undefined);
  const { formatCurrency, formatDate, formatNumber } = useTenantLocale();

  const tt = (k: string, fb: string) => {
    const v = t(`settings.locale.${k}`);
    return v === `settings.locale.${k}` ? fb : v;
  };

  const set = <K extends keyof LocaleSettings>(k: K, v: LocaleSettings[K]) => {
    if (access.readOnly) return;
    save({ [k]: v } as Partial<LocaleSettings>);
  };

  return (
    <Panel
      title={tt("title", "Language & Locale")}
      description={tt("desc", "Language, currency, timezone, date and number formats applied across the app, documents and reports.")}
    >
      <fieldset disabled={access.readOnly || isSaving} className="contents">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <Field label={tt("language", "Language")}>
            <Select value={locale.language} onValueChange={(v) => set("language", v as LocaleSettings["language"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English (en)</SelectItem>
                <SelectItem value="bn">বাংলা — Bangla (bn)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tt("currency", "Currency")}>
            <Select value={locale.currency} onValueChange={(v) => set("currency", v as LocaleSettings["currency"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BDT">BDT — Bangladeshi Taka (৳)</SelectItem>
                <SelectItem value="USD">USD — US Dollar ($)</SelectItem>
                <SelectItem value="EUR">EUR — Euro (€)</SelectItem>
                <SelectItem value="GBP">GBP — Pound Sterling (£)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tt("timezone", "Timezone")}>
            <Select value={locale.timezone} onValueChange={(v) => set("timezone", v as LocaleSettings["timezone"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Dhaka">Asia/Dhaka (GMT+6)</SelectItem>
                <SelectItem value="Asia/Kolkata">Asia/Kolkata (GMT+5:30)</SelectItem>
                <SelectItem value="Asia/Dubai">Asia/Dubai (GMT+4)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tt("dateFormat", "Date Format")}>
            <Select value={locale.date_format} onValueChange={(v) => set("date_format", v as LocaleSettings["date_format"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tt("numberFormat", "Number Format")}>
            <Select value={locale.number_format} onValueChange={(v) => set("number_format", v as LocaleSettings["number_format"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en-BD">en-BD (12,345.67)</SelectItem>
                <SelectItem value="en-US">en-US (12,345.67)</SelectItem>
                <SelectItem value="bn-BD">bn-BD (১২,৩৪৫.৬৭)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </fieldset>

      <Separator />

      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="mb-3 text-sm font-medium">{tt("preview", "Live Preview")}</p>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{tt("previewDate", "Today")}</p>
            <p className="font-medium">{formatDate(new Date(), { withTime: true })}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tt("previewCurrency", "Currency")}</p>
            <p className="font-medium">{formatCurrency(12345.67)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{tt("previewNumber", "Number")}</p>
            <p className="font-medium">{formatNumber(12345.67)}</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}


/* ---------- 15. Medicine Settings ---------- */
function MedicinePanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { settings, isLoading, save, isSaving } = useMedicineSettings(currentTenantId ?? undefined);
  const disabled = !access.canEdit || isSaving;

  type S = typeof settings;
  type BoolKey = {
    [K in keyof S]-?: S[K] extends boolean ? K : never
  }[keyof S] & string;

  const Row = ({ k, title, desc }: { k: BoolKey; title: string; desc?: string }) => (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="pr-3">
        <p className="font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch
        checked={!!settings[k]}
        disabled={disabled}
        onCheckedChange={(v) => save({ [k]: v } as unknown as Partial<S>)}
      />
    </div>
  );

  if (isLoading) {
    return <Panel title={t("settings.medicine.title")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  return (
    <Panel title={t("settings.medicine.title")} description={t("settings.medicine.desc")}>
      <p className="text-sm font-semibold">{t("settings.medicine.master")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="require_generic" title={t("settings.medicine.require_generic")} desc={t("settings.medicine.require_generic_desc")} />
        <Row k="require_manufacturer" title={t("settings.medicine.require_manufacturer")} desc={t("settings.medicine.require_manufacturer_desc")} />
        <Row k="require_strength" title={t("settings.medicine.require_strength")} desc={t("settings.medicine.require_strength_desc")} />
        <Row k="require_medicine_type" title={t("settings.medicine.require_medicine_type")} desc={t("settings.medicine.require_medicine_type_desc")} />
        <Row k="require_pack_size" title={t("settings.medicine.require_pack_size")} desc={t("settings.medicine.require_pack_size_desc")} />
        <Field label={t("settings.medicine.default_medicine_status")} hint={t("settings.medicine.default_medicine_status_desc")}>
          <Select
            value={settings.default_medicine_status}
            onValueChange={(v) => save({ default_medicine_status: v as "active" | "inactive" | "draft" })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("settings.medicine.status_active")}</SelectItem>
              <SelectItem value="inactive">{t("settings.medicine.status_inactive")}</SelectItem>
              <SelectItem value="draft">{t("settings.medicine.status_draft")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.medicine.clinical")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_drug_interaction" title={t("settings.medicine.enable_drug_interaction")} desc={t("settings.medicine.enable_drug_interaction_desc")} />
        <Row k="enable_allergy_check" title={t("settings.medicine.enable_allergy_check")} desc={t("settings.medicine.enable_allergy_check_desc")} />
        <Row k="enable_dosage_validation" title={t("settings.medicine.enable_dosage_validation")} desc={t("settings.medicine.enable_dosage_validation_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.medicine.alternative")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_alternative_medicine" title={t("settings.medicine.enable_alternative_medicine")} desc={t("settings.medicine.enable_alternative_medicine_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.medicine.sku")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="auto_generate_sku" title={t("settings.medicine.auto_generate_sku")} desc={t("settings.medicine.auto_generate_sku_desc")} />
        <Field label={t("settings.medicine.sku_prefix")} hint={t("settings.medicine.sku_prefix_desc")}>
          <Input
            value={settings.sku_prefix}
            maxLength={16}
            onChange={(e) => {
              const v = e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16);
              if (v.length >= 1) save({ sku_prefix: v });
            }}
            disabled={disabled}
          />
        </Field>
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.medicine.duplicates")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="allow_duplicate_barcode" title={t("settings.medicine.allow_duplicate_barcode")} desc={t("settings.medicine.allow_duplicate_barcode_desc")} />
        <Row k="allow_duplicate_sku" title={t("settings.medicine.allow_duplicate_sku")} desc={t("settings.medicine.allow_duplicate_sku_desc")} />
      </div>

      {access.readOnly && (
        <p className="text-xs text-muted-foreground">{t("settings.medicine.readonly_note")}</p>
      )}
    </Panel>
  );
}


/* ---------- 16. Report Settings ---------- */
function ReportPanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { settings, isLoading, save, isSaving } = useReportSettings(currentTenantId ?? undefined);
  const disabled = !access.canEdit || isSaving;

  type S = ReportSettings;
  type BoolKey = { [K in keyof S]-?: S[K] extends boolean ? K : never }[keyof S] & string;

  const Row = ({ k, title, desc }: { k: BoolKey; title: string; desc?: string }) => (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="pr-3">
        <p className="font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch
        checked={!!settings[k]}
        disabled={disabled}
        onCheckedChange={(v) => save({ [k]: v } as unknown as Partial<S>)}
      />
    </div>
  );

  if (isLoading) {
    return <Panel title={t("settings.reports.title")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  return (
    <Panel title={t("settings.reports.title")} description={t("settings.reports.desc")}>
      <p className="text-sm font-semibold">{t("settings.reports.defaults")}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <Field label={t("settings.reports.default_date_range")} hint={t("settings.reports.default_date_range_desc")}>
          <Select
            value={settings.default_date_range}
            onValueChange={(v) => save({ default_date_range: v as ReportSettings["default_date_range"] })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t("settings.reports.range_7d")}</SelectItem>
              <SelectItem value="30d">{t("settings.reports.range_30d")}</SelectItem>
              <SelectItem value="90d">{t("settings.reports.range_90d")}</SelectItem>
              <SelectItem value="365d">{t("settings.reports.range_365d")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("settings.reports.default_export_format")} hint={t("settings.reports.default_export_format_desc")}>
          <Select
            value={settings.default_export_format}
            onValueChange={(v) => save({ default_export_format: v as ReportSettings["default_export_format"] })}
            disabled={disabled}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="xlsx">XLSX</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.reports.visibility")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="show_profit_reports" title={t("settings.reports.show_profit_reports")} desc={t("settings.reports.show_profit_reports_desc")} />
        <Row k="show_margin_reports" title={t("settings.reports.show_margin_reports")} desc={t("settings.reports.show_margin_reports_desc")} />
        <Row k="show_cost_price" title={t("settings.reports.show_cost_price")} desc={t("settings.reports.show_cost_price_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.reports.modules")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_executive_reports" title={t("settings.reports.enable_executive_reports")} desc={t("settings.reports.enable_executive_reports_desc")} />
        <Row k="enable_clinical_reports" title={t("settings.reports.enable_clinical_reports")} desc={t("settings.reports.enable_clinical_reports_desc")} />
        <Row k="enable_financial_reports" title={t("settings.reports.enable_financial_reports")} desc={t("settings.reports.enable_financial_reports_desc")} />
        <Row k="enable_inventory_reports" title={t("settings.reports.enable_inventory_reports")} desc={t("settings.reports.enable_inventory_reports_desc")} />
        <Row k="enable_procurement_reports" title={t("settings.reports.enable_procurement_reports")} desc={t("settings.reports.enable_procurement_reports_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.reports.exports")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="show_logo_in_exports" title={t("settings.reports.show_logo_in_exports")} desc={t("settings.reports.show_logo_in_exports_desc")} />
        <Row k="show_signature_in_exports" title={t("settings.reports.show_signature_in_exports")} desc={t("settings.reports.show_signature_in_exports_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.reports.auto_refresh")}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <Row k="enable_auto_refresh" title={t("settings.reports.enable_auto_refresh")} desc={t("settings.reports.enable_auto_refresh_desc")} />
        <Field label={t("settings.reports.refresh_interval")} hint={t("settings.reports.refresh_interval_desc")}>
          <Select
            value={String(settings.report_refresh_interval)}
            onValueChange={(v) => save({ report_refresh_interval: Number(v) as 60 | 120 | 300 | 600 })}
            disabled={disabled || !settings.enable_auto_refresh}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="60">60s</SelectItem>
              <SelectItem value="120">120s</SelectItem>
              <SelectItem value="300">300s</SelectItem>
              <SelectItem value="600">600s</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.reports.scheduling")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_scheduled_reports" title={t("settings.reports.enable_scheduled_reports")} desc={t("settings.reports.enable_scheduled_reports_desc")} />
      </div>

      {access.readOnly && (
        <p className="text-xs text-muted-foreground">{t("settings.reports.readonly_note")}</p>
      )}
    </Panel>
  );
}


/* ---------- 17. Business Rules ---------- */
function BusinessRulesPanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { rules, isLoading, save, isSaving } = useBusinessRules(currentTenantId ?? undefined);
  const disabled = !access.canEdit || isSaving;

  const Row = ({
    k, title, desc,
  }: { k: keyof typeof rules; title: string; desc?: string }) => (
    <div className="flex items-center justify-between rounded-lg border border-border p-3">
      <div className="pr-3">
        <p className="font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Switch
        checked={!!rules[k]}
        disabled={disabled}
        onCheckedChange={(v) => save({ [k]: v } as Partial<typeof rules>)}
      />
    </div>
  );

  if (isLoading) {
    return <Panel title={t("settings.business_rules.title")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  return (
    <Panel
      title={t("settings.business_rules.title")}
      description={t("settings.business_rules.desc")}
    >
      <p className="text-sm font-semibold">{t("settings.business_rules.procurement")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="require_po_approval" title={t("settings.business_rules.require_po_approval")} desc={t("settings.business_rules.require_po_approval_desc")} />
        <Row k="require_grn_approval" title={t("settings.business_rules.require_grn_approval")} desc={t("settings.business_rules.require_grn_approval_desc")} />
        <Row k="require_purchase_return_approval" title={t("settings.business_rules.require_purchase_return_approval")} desc={t("settings.business_rules.require_purchase_return_approval_desc")} />
        <Row k="require_transfer_approval" title={t("settings.business_rules.require_transfer_approval")} desc={t("settings.business_rules.require_transfer_approval_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.business_rules.inventory")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="allow_negative_stock" title={t("settings.business_rules.allow_negative_stock")} desc={t("settings.business_rules.allow_negative_stock_desc")} />
        <Row k="allow_backdated_entries" title={t("settings.business_rules.allow_backdated_entries")} desc={t("settings.business_rules.allow_backdated_entries_desc")} />
        <Row k="enable_fefo" title={t("settings.business_rules.enable_fefo")} desc={t("settings.business_rules.enable_fefo_desc")} />
        <Row k="enable_batch_tracking" title={t("settings.business_rules.enable_batch_tracking")} desc={t("settings.business_rules.enable_batch_tracking_desc")} />
        <Row k="enable_expiry_control" title={t("settings.business_rules.enable_expiry_control")} desc={t("settings.business_rules.enable_expiry_control_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.business_rules.accounting")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_supplier_ledger" title={t("settings.business_rules.enable_supplier_ledger")} desc={t("settings.business_rules.enable_supplier_ledger_desc")} />
        <Row k="enable_journal_posting" title={t("settings.business_rules.enable_journal_posting")} desc={t("settings.business_rules.enable_journal_posting_desc")} />
      </div>

      <Separator />
      <p className="text-sm font-semibold">{t("settings.business_rules.clinical")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Row k="enable_clinical_safety" title={t("settings.business_rules.enable_clinical_safety")} desc={t("settings.business_rules.enable_clinical_safety_desc")} />
        <Row k="require_safety_ack" title={t("settings.business_rules.require_safety_ack")} desc={t("settings.business_rules.require_safety_ack_desc")} />
      </div>

      {access.readOnly && (
        <p className="text-xs text-muted-foreground">{t("settings.business_rules.readonly_note")}</p>
      )}
    </Panel>
  );
}

/* ---------- 18. POS (advanced) ---------- */
function POSAdvancedPanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { settings, isLoading, save, isSaving } = usePosSettings(currentTenantId ?? undefined);

  const { data: warehouses = [] } = useQuery<{ id: string; name: string }[]>({
    enabled: !!currentTenantId,
    queryKey: ["pos-settings-warehouses", currentTenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses").select("id, name").eq("tenant_id", currentTenantId!).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: customers = [] } = useQuery<{ id: string; name: string }[]>({
    enabled: !!currentTenantId,
    queryKey: ["pos-settings-customers", currentTenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers").select("id, name").eq("tenant_id", currentTenantId!).order("name").limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  if (isLoading) {
    return <Panel title={t("settings.pos.title")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  const readOnly = access.readOnly;
  const toggle = (key: keyof typeof settings) => (v: boolean) => save({ [key]: v } as Partial<typeof settings>);

  return (
    <Panel
      title={t("settings.pos.title")}
      description={t("settings.pos.desc")}
      footer={<div className="flex justify-end gap-2 border-t border-border p-4">
        <Badge variant="outline" className="gap-1">{isSaving ? "Saving…" : "Auto-saved"}</Badge>
      </div>}
    >
      {readOnly && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("settings.pos.readonly_note")}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.pos.defaults")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Field label={t("settings.pos.default_warehouse")} hint={t("settings.pos.default_warehouse_desc")}>
            <Select
              value={settings.default_warehouse_id ?? "__none__"}
              onValueChange={(v) => save({ default_warehouse_id: v === "__none__" ? null : v })}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("settings.pos.none")}</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("settings.pos.default_customer")} hint={t("settings.pos.default_customer_desc")}>
            <Select
              value={settings.default_customer_id ?? "__none__"}
              onValueChange={(v) => save({ default_customer_id: v === "__none__" ? null : v })}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("settings.pos.none")}</SelectItem>
                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.pos.barcode")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow title={t("settings.pos.barcode_auto_search")} description={t("settings.pos.barcode_auto_search_desc")} checked={settings.barcode_auto_search} onCheckedChange={toggle("barcode_auto_search")} disabled={readOnly} />
          <ToggleRow title={t("settings.pos.barcode_auto_add")} description={t("settings.pos.barcode_auto_add_desc")} checked={settings.barcode_auto_add} onCheckedChange={toggle("barcode_auto_add")} disabled={readOnly} />
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.pos.customer")}</p>
        <ToggleRow title={t("settings.pos.customer_required")} description={t("settings.pos.customer_required_desc")} checked={settings.customer_required} onCheckedChange={toggle("customer_required")} disabled={readOnly} />
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.pos.pricing")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow title={t("settings.pos.allow_discount")} description={t("settings.pos.allow_discount_desc")} checked={settings.allow_discount} onCheckedChange={toggle("allow_discount")} disabled={readOnly} />
          <ToggleRow title={t("settings.pos.allow_manual_price")} description={t("settings.pos.allow_manual_price_desc")} checked={settings.allow_manual_price} onCheckedChange={toggle("allow_manual_price")} disabled={readOnly} />
          <ToggleRow title={t("settings.pos.show_profit_margin")} description={t("settings.pos.show_profit_margin_desc")} checked={settings.show_profit_margin} onCheckedChange={toggle("show_profit_margin")} disabled={readOnly} />
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.pos.payments")}</p>
        <ToggleRow title={t("settings.pos.enable_split_payment")} description={t("settings.pos.enable_split_payment_desc")} checked={settings.enable_split_payment} onCheckedChange={toggle("enable_split_payment")} disabled={readOnly} />
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.pos.sales")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow title={t("settings.pos.enable_hold_sale")} description={t("settings.pos.enable_hold_sale_desc")} checked={settings.enable_hold_sale} onCheckedChange={toggle("enable_hold_sale")} disabled={readOnly} />
          <ToggleRow title={t("settings.pos.auto_print_receipt")} description={t("settings.pos.auto_print_receipt_desc")} checked={settings.auto_print_receipt} onCheckedChange={toggle("auto_print_receipt")} disabled={readOnly} />
        </div>
      </div>

      <Separator />

      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.pos.hardware")}</p>
        <ToggleRow title={t("settings.pos.cash_drawer_enabled")} description={t("settings.pos.cash_drawer_enabled_desc")} checked={settings.cash_drawer_enabled} onCheckedChange={toggle("cash_drawer_enabled")} disabled={readOnly} />
      </div>
    </Panel>
  );
}

/* ---------- Number Series ---------- */
function NumberSeriesPanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { series, counters, preview, isLoading, save, isSaving } = useNumberSeries(currentTenantId ?? undefined);
  const disabled = !access.canEdit || isSaving;

  type DT =
    | "invoice" | "receipt" | "purchase_order" | "goods_receipt"
    | "purchase_return" | "sales_return" | "transfer"
    | "prescription" | "customer" | "supplier" | "product";

  const groups: { title: string; items: { k: DT; label: string }[] }[] = [
    { title: t("settings.number_series.group_sales"), items: [
      { k: "invoice", label: t("settings.number_series.doc_invoice") },
      { k: "receipt", label: t("settings.number_series.doc_receipt") },
      { k: "sales_return", label: t("settings.number_series.doc_sales_return") },
    ]},
    { title: t("settings.number_series.group_procurement"), items: [
      { k: "purchase_order", label: t("settings.number_series.doc_purchase_order") },
      { k: "goods_receipt", label: t("settings.number_series.doc_goods_receipt") },
      { k: "purchase_return", label: t("settings.number_series.doc_purchase_return") },
    ]},
    { title: t("settings.number_series.group_inventory"), items: [
      { k: "transfer", label: t("settings.number_series.doc_transfer") },
    ]},
    { title: t("settings.number_series.group_clinical"), items: [
      { k: "prescription", label: t("settings.number_series.doc_prescription") },
    ]},
    { title: t("settings.number_series.group_masters"), items: [
      { k: "customer", label: t("settings.number_series.doc_customer") },
      { k: "supplier", label: t("settings.number_series.doc_supplier") },
      { k: "product", label: t("settings.number_series.doc_product") },
    ]},
  ];

  const [drafts, setDrafts] = useState<Record<string, { prefix: string; start: string }>>({});
  const draftFor = (k: DT) => drafts[k] ?? { prefix: series[k].prefix, start: String(series[k].start) };

  const commit = (k: DT) => {
    const d = draftFor(k);
    const prefix = d.prefix.trim();
    const start = Number(d.start);
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(prefix)) {
      toast.error(t("settings.number_series.invalid_prefix"));
      return;
    }
    if (!Number.isInteger(start) || start < 1) {
      toast.error(t("settings.number_series.invalid_start"));
      return;
    }
    if (prefix === series[k].prefix && start === series[k].start) return;
    save({ [k]: { prefix, start } } as Partial<Record<DT, { prefix: string; start: number }>>);
  };

  if (isLoading) {
    return <Panel title={t("settings.number_series.title")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  return (
    <Panel title={t("settings.number_series.title")} description={t("settings.number_series.desc")}>
      {groups.map(g => (
        <div key={g.title} className="space-y-2">
          <p className="text-sm font-semibold">{g.title}</p>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.number_series.document")}</TableHead>
                  <TableHead className="w-32">{t("settings.number_series.prefix")}</TableHead>
                  <TableHead className="w-32">{t("settings.number_series.start")}</TableHead>
                  <TableHead className="w-28">{t("settings.number_series.current")}</TableHead>
                  <TableHead>{t("settings.number_series.next_preview")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.items.map(({ k, label }) => {
                  const d = draftFor(k);
                  return (
                    <TableRow key={k}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell>
                        <Input
                          value={d.prefix}
                          maxLength={12}
                          disabled={disabled}
                          onChange={(e) => setDrafts(p => ({ ...p, [k]: { ...d, prefix: e.target.value } }))}
                          onBlur={() => commit(k)}
                          className="h-8 font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" min={1}
                          value={d.start}
                          disabled={disabled}
                          onChange={(e) => setDrafts(p => ({ ...p, [k]: { ...d, start: e.target.value } }))}
                          onBlur={() => commit(k)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{counters[k] ?? 0}</TableCell>
                      <TableCell><Badge variant="secondary" className="font-mono">{preview[k] ?? `${series[k].prefix}-${series[k].start}`}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t("settings.number_series.lock_note")}</p>
      {access.readOnly && (
        <p className="text-xs text-muted-foreground">{t("settings.number_series.readonly_note")}</p>
      )}
    </Panel>
  );
}


/* ---------- Data Management ---------- */
function DataManagementPanel() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const [tab, setTab] = useState<"overview"|"imports"|"exports"|"archive"|"retention"|"recycle"|"cleanup"|"storage">("overview");
  const [s, setS] = useState<TDMSettings | null>(null);
  const [imports, setImports] = useState<TImportJob[]>([]);
  const [exports, setExports] = useState<TExportJob[]>([]);
  const [archives, setArchives] = useState<TArchiveRule[]>([]);
  const [retention, setRetention] = useState<TRetention[]>([]);
  const [cleanup, setCleanup] = useState<TCleanupLog[]>([]);
  const [recycle, setRecycle] = useState<TRecycleRow[]>([]);
  const [stats, setStats] = useState<{ counts: Record<string, number>; backup_bytes: number; export_bytes: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const [newArchive, setNewArchive] = useState({ name: "", module: "sales", older_than_days: 365 });
  const [newRetention, setNewRetention] = useState({ entity: "audit_log", retention_days: 365 });
  const [exportModule, setExportModule] = useState("sales");
  const [exportFormat, setExportFormat] = useState<"xlsx"|"csv"|"pdf"|"json">("xlsx");

  const fns = {
    getS: useServerFn(getDataMgmtSettings),
    setS: useServerFn(updateDataMgmtSettings),
    listI: useServerFn(listImportJobs),
    listE: useServerFn(listExportJobs),
    runE: useServerFn(runExport),
    listA: useServerFn(listArchiveRules),
    upA: useServerFn(upsertArchiveRule),
    delA: useServerFn(deleteArchiveRule),
    runA: useServerFn(runArchiveRule),
    listR: useServerFn(listRetentionPolicies),
    upR: useServerFn(upsertRetentionPolicy),
    delR: useServerFn(deleteRetentionPolicy),
    listC: useServerFn(listCleanupLogs),
    runC: useServerFn(runCleanup),
    listB: useServerFn(listRecycleBin),
    rest: useServerFn(restoreFromRecycleBin),
    purge: useServerFn(purgeFromRecycleBin),
    stats: useServerFn(getStorageStats),
  };

  async function refresh() {
    if (!tenantId) return;
    const [a,b,c,d,e,f,g,h] = await Promise.all([
      fns.getS({ data: { tenant_id: tenantId } }),
      fns.listI({ data: { tenant_id: tenantId, limit: 50 } }),
      fns.listE({ data: { tenant_id: tenantId, limit: 50 } }),
      fns.listA({ data: { tenant_id: tenantId } }),
      fns.listR({ data: { tenant_id: tenantId } }),
      fns.listC({ data: { tenant_id: tenantId, limit: 50 } }),
      fns.listB({ data: { tenant_id: tenantId } }),
      fns.stats({ data: { tenant_id: tenantId } }),
    ]);
    setS(a); setImports(b); setExports(c); setArchives(d); setRetention(e); setCleanup(f); setRecycle(g); setStats(h);
  }
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tenantId]);

  async function patch(p: Partial<TDMSettings>) {
    if (!tenantId || !s) return;
    try { setS(await fns.setS({ data: { tenant_id: tenantId, patch: p } })); toast.success("Saved"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  }

  const TABS_DM = [
    { k: "overview", l: "Overview" }, { k: "imports", l: "Imports" }, { k: "exports", l: "Exports" },
    { k: "archive", l: "Archive" }, { k: "retention", l: "Retention" }, { k: "recycle", l: "Recycle Bin" },
    { k: "cleanup", l: "Cleanup" }, { k: "storage", l: "Storage" },
  ] as const;

  const fmtBytes = (n: number) => n > 1e9 ? `${(n/1e9).toFixed(2)} GB` : n > 1e6 ? `${(n/1e6).toFixed(1)} MB` : `${(n/1e3).toFixed(1)} KB`;

  return (
    <Panel title="Data Management" description="Import, export, archive, retention, recycle bin and cleanup tools.">
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS_DM.map(t => (
          <Button key={t.k} size="sm" variant={tab === t.k ? "default" : "ghost"} onClick={() => setTab(t.k as any)}>{t.l}</Button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Imports</p><p className="mt-1 font-medium">{imports.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Exports</p><p className="mt-1 font-medium">{exports.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Archive rules</p><p className="mt-1 font-medium">{archives.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Recycle bin</p><p className="mt-1 font-medium">{recycle.length}</p></CardContent></Card>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <ToggleRow title="Validate data on import" checked={!!s?.validate_on_import} onCheckedChange={(v) => patch({ validate_on_import: v })} />
            <ToggleRow title="Detect duplicates on import" checked={!!s?.detect_duplicates_on_import} onCheckedChange={(v) => patch({ detect_duplicates_on_import: v })} />
            <ToggleRow title="Track import / export in audit log" checked={!!s?.track_in_audit} onCheckedChange={(v) => patch({ track_in_audit: v })} />
            <ToggleRow title="Confirm before permanent delete" checked={!!s?.confirm_permanent_delete} onCheckedChange={(v) => patch({ confirm_permanent_delete: v })} />
          </div>
        </div>
      )}

      {tab === "imports" && (
        <div>
          <p className="mb-2 text-sm font-medium">Import history</p>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Module</TableHead><TableHead>File</TableHead><TableHead>Rows</TableHead><TableHead>Success</TableHead><TableHead>Failed</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {imports.length === 0 && (<TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No import jobs</TableCell></TableRow>)}
              {imports.map(j => (
                <TableRow key={j.id}>
                  <TableCell>{new Date(j.started_at).toLocaleString()}</TableCell>
                  <TableCell>{j.module}</TableCell>
                  <TableCell className="truncate max-w-[180px]">{j.file_name}</TableCell>
                  <TableCell>{j.rows_total}</TableCell>
                  <TableCell>{j.rows_success}</TableCell>
                  <TableCell>{j.rows_failed}</TableCell>
                  <TableCell><Badge variant={j.status === "completed" ? "default" : j.status === "failed" ? "destructive" : "secondary"}>{j.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "exports" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
            <div className="space-y-1"><Label>Module</Label>
              <Select value={exportModule} onValueChange={setExportModule}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["sales","inventory","accounting","customers","suppliers","clinical"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Format</Label>
              <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as any)}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>{["xlsx","csv","pdf","json"].map(f => <SelectItem key={f} value={f}>{f.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button disabled={busy} onClick={async () => {
              setBusy(true);
              try { await fns.runE({ data: { tenant_id: tenantId, module: exportModule, format: exportFormat } }); await refresh(); toast.success("Export created"); }
              catch (e: any) { toast.error(e.message ?? "Failed"); } finally { setBusy(false); }
            }}>Run export</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Module</TableHead><TableHead>Format</TableHead><TableHead>File</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {exports.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No exports yet</TableCell></TableRow>)}
              {exports.map(e => (
                <TableRow key={e.id}>
                  <TableCell>{new Date(e.started_at).toLocaleString()}</TableCell>
                  <TableCell>{e.module}</TableCell>
                  <TableCell>{e.format.toUpperCase()}</TableCell>
                  <TableCell className="truncate max-w-[220px]">{e.file_name ?? "—"}</TableCell>
                  <TableCell><Badge variant={e.status === "completed" ? "default" : e.status === "failed" ? "destructive" : "secondary"}>{e.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "archive" && (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-4">
            <Input placeholder="Rule name" value={newArchive.name} onChange={(e) => setNewArchive({ ...newArchive, name: e.target.value })} />
            <Select value={newArchive.module} onValueChange={(v) => setNewArchive({ ...newArchive, module: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["sales","stock_transfers","notifications","audit_log","prescriptions"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min={1} placeholder="Older than (days)" value={newArchive.older_than_days} onChange={(e) => setNewArchive({ ...newArchive, older_than_days: Number(e.target.value) })} />
            <Button disabled={!newArchive.name.trim()} onClick={async () => {
              await fns.upA({ data: { tenant_id: tenantId, name: newArchive.name, module: newArchive.module, older_than_days: newArchive.older_than_days, destination: "archive_table", status: "active" } });
              setNewArchive({ name: "", module: "sales", older_than_days: 365 });
              await refresh(); toast.success("Archive rule created");
            }}>Add rule</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Module</TableHead><TableHead>Older than</TableHead><TableHead>Last run</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {archives.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No archive rules</TableCell></TableRow>)}
              {archives.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.module}</TableCell>
                  <TableCell>{r.older_than_days} days</TableCell>
                  <TableCell>{r.last_run_at ? new Date(r.last_run_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => fns.runA({ data: { tenant_id: tenantId, id: r.id } }).then(refresh)}>Run</Button>
                    <Button size="sm" variant="ghost" onClick={() => fns.delA({ data: { tenant_id: tenantId, id: r.id } }).then(refresh)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "retention" && (
        <div className="space-y-3">
          <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-3">
            <Select value={newRetention.entity} onValueChange={(v) => setNewRetention({ ...newRetention, entity: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["audit_log","notifications","security_events","sync_logs","comm_log"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min={1} value={newRetention.retention_days} onChange={(e) => setNewRetention({ ...newRetention, retention_days: Number(e.target.value) })} />
            <Button onClick={async () => {
              await fns.upR({ data: { tenant_id: tenantId, entity: newRetention.entity, retention_days: newRetention.retention_days, action: "archive", enabled: true } });
              await refresh(); toast.success("Policy saved");
            }}>Save policy</Button>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Entity</TableHead><TableHead>Retention</TableHead><TableHead>Action</TableHead><TableHead>Enabled</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {retention.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No retention policies</TableCell></TableRow>)}
              {retention.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.entity}</TableCell>
                  <TableCell>{p.retention_days} days</TableCell>
                  <TableCell>{p.action}</TableCell>
                  <TableCell><Switch checked={p.enabled} onCheckedChange={async (v) => { await fns.upR({ data: { tenant_id: tenantId, id: p.id, entity: p.entity, retention_days: p.retention_days, action: p.action, enabled: v } }); await refresh(); }} /></TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => fns.delR({ data: { tenant_id: tenantId, id: p.id } }).then(refresh)}>Delete</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "recycle" && (
        <div>
          <p className="mb-2 text-sm font-medium">Soft-deleted records ({recycle.length})</p>
          <Table>
            <TableHeader><TableRow><TableHead>Entity</TableHead><TableHead>Name</TableHead><TableHead>Deleted</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {recycle.length === 0 && (<TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Recycle bin is empty</TableCell></TableRow>)}
              {recycle.map(r => (
                <TableRow key={`${r.entity}-${r.id}`}>
                  <TableCell>{r.entity}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{new Date(r.deleted_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={async () => { await fns.rest({ data: { tenant_id: tenantId, entity: r.entity as any, id: r.id } }); await refresh(); toast.success("Restored"); }}>Restore</Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (!confirm(`Permanently delete ${r.name}?`)) return;
                      await fns.purge({ data: { tenant_id: tenantId, entity: r.entity as any, id: r.id, confirm: true } });
                      await refresh(); toast.success("Purged");
                    }}>Purge</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "cleanup" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["duplicate_products","duplicate_customers","duplicate_suppliers","orphan_records","broken_references","unused_files"] as const).map(k => (
              <Button key={k} size="sm" variant="outline" disabled={busy} onClick={async () => {
                setBusy(true);
                try { await fns.runC({ data: { tenant_id: tenantId, cleanup_type: k } }); await refresh(); toast.success("Cleanup completed"); }
                catch (e: any) { toast.error(e.message ?? "Failed"); } finally { setBusy(false); }
              }}>{k.replace(/_/g, " ")}</Button>
            ))}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Scanned</TableHead><TableHead>Affected</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {cleanup.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No cleanup runs</TableCell></TableRow>)}
              {cleanup.map(l => (
                <TableRow key={l.id}>
                  <TableCell>{new Date(l.started_at).toLocaleString()}</TableCell>
                  <TableCell>{l.cleanup_type}</TableCell>
                  <TableCell>{l.records_scanned}</TableCell>
                  <TableCell>{l.records_affected}</TableCell>
                  <TableCell><Badge variant={l.status === "completed" ? "default" : l.status === "failed" ? "destructive" : "secondary"}>{l.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === "storage" && stats && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Backup size</p><p className="mt-1 font-medium">{fmtBytes(stats.backup_bytes)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Export size</p><p className="mt-1 font-medium">{fmtBytes(stats.export_bytes)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Warn at</p><p className="mt-1 font-medium">{s?.storage_warn_at_pct ?? 80}%</p></CardContent></Card>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Row counts</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(stats.counts).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="capitalize text-muted-foreground">{k}</span>
                  <span className="font-medium">{v.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------- System Preferences ---------- */
function PreferencesPanel() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);
  const { prefs, isLoading, save, isSaving } = useSystemPreferences(currentTenantId ?? undefined);

  const { data: branches = [] } = useQuery<{ id: string; name: string }[]>({
    enabled: !!currentTenantId,
    queryKey: ["sys-prefs-branches", currentTenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches").select("id, name").eq("tenant_id", currentTenantId!).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: warehouses = [] } = useQuery<{ id: string; name: string; branch_id: string | null }[]>({
    enabled: !!currentTenantId,
    queryKey: ["sys-prefs-warehouses", currentTenantId, prefs.default_branch_id],
    queryFn: async () => {
      let q = supabase.from("warehouses").select("id, name, branch_id").eq("tenant_id", currentTenantId!);
      if (prefs.default_branch_id) q = q.eq("branch_id", prefs.default_branch_id);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; branch_id: string | null }[];
    },
  });

  if (isLoading) {
    return <Panel title={t("settings.system.title")}><div className="text-sm text-muted-foreground">Loading…</div></Panel>;
  }

  const readOnly = access.readOnly;

  return (
    <Panel
      title={t("settings.system.title")}
      description={t("settings.system.desc")}
      footer={<div className="flex justify-end gap-2 border-t border-border p-4">
        <Badge variant="outline" className="gap-1">{isSaving ? "Saving…" : "Auto-saved"}</Badge>
      </div>}
    >
      {/* Branch & Warehouse */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.system.branch_warehouse")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Field label={t("settings.system.default_branch")} hint={t("settings.system.default_branch_desc")}>
            <Select
              value={prefs.default_branch_id ?? "__none__"}
              onValueChange={(v) => save({ default_branch_id: v === "__none__" ? null : v, default_warehouse_id: null })}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("settings.system.none")}</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("settings.system.default_warehouse")} hint={t("settings.system.default_warehouse_desc")}>
            <Select
              value={prefs.default_warehouse_id ?? "__none__"}
              onValueChange={(v) => save({ default_warehouse_id: v === "__none__" ? null : v })}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("settings.system.none")}</SelectItem>
                {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-md border border-border p-3">
            <span className="text-sm">{t("settings.system.remember_last_branch")}</span>
            <Switch
              checked={prefs.remember_last_branch}
              onCheckedChange={(v) => save({ remember_last_branch: v })}
              disabled={readOnly}
            />
          </label>
          <label className="flex items-center justify-between rounded-md border border-border p-3">
            <span className="text-sm">{t("settings.system.remember_last_warehouse")}</span>
            <Switch
              checked={prefs.remember_last_warehouse}
              onCheckedChange={(v) => save({ remember_last_warehouse: v })}
              disabled={readOnly}
            />
          </label>
        </div>
      </div>

      <Separator />

      {/* Navigation */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.system.navigation")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Field label={t("settings.system.landing_page")} hint={t("settings.system.landing_page_desc")}>
            <Select
              value={prefs.landing_page}
              onValueChange={(v) => save({ landing_page: v as typeof prefs.landing_page })}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="/store">Store</SelectItem>
                <SelectItem value="/sales/pos">POS</SelectItem>
                <SelectItem value="/inventory">Inventory</SelectItem>
                <SelectItem value="/procurement/dashboard">Procurement</SelectItem>
                <SelectItem value="/executive">Executive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("settings.system.dashboard_refresh")} hint={t("settings.system.dashboard_refresh_desc")}>
            <Select
              value={String(prefs.dashboard_refresh_interval)}
              onValueChange={(v) => save({ dashboard_refresh_interval: Number(v) })}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[30, 60, 120, 300].map(n => (
                  <SelectItem key={n} value={String(n)}>{t("settings.system.seconds", { n })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <Separator />

      {/* Session */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.system.session")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <Field label={t("settings.system.auto_logout")} hint={t("settings.system.auto_logout_desc")}>
            <Select
              value={String(prefs.auto_logout_minutes)}
              onValueChange={(v) => save({ auto_logout_minutes: Number(v) })}
              disabled={readOnly}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[15, 30, 60, 120].map(n => (
                  <SelectItem key={n} value={String(n)}>{t("settings.system.minutes", { n })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <Separator />

      {/* Display */}
      <div>
        <p className="mb-2 text-sm font-semibold">{t("settings.system.display")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">{t("settings.system.enable_dark_mode")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.system.enable_dark_mode_desc")}</p>
            </div>
            <Switch
              checked={prefs.enable_dark_mode}
              onCheckedChange={(v) => {
                save({ enable_dark_mode: v });
                useUIStore.getState().setTheme(v ? "dark" : "light");
              }}
              disabled={readOnly}
            />

          </label>
          <label className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">{t("settings.system.compact_mode")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.system.compact_mode_desc")}</p>
            </div>
            <Switch
              checked={prefs.compact_mode}
              onCheckedChange={(v) => save({ compact_mode: v })}
              disabled={readOnly}
            />
          </label>
        </div>
      </div>

      {readOnly && (
        <p className="text-xs text-muted-foreground">{t("settings.system.readonly_note")}</p>
      )}
    </Panel>
  );
}


/* ---------- Integrations ---------- */
type IntegrationStatus = "connected" | "disconnected" | "warning";

function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "connected") return <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15"><CheckCircle2 className="h-3 w-3" />Connected</Badge>;
  if (status === "warning")   return <Badge className="gap-1 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15"><AlertCircle className="h-3 w-3" />Warning</Badge>;
  return <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" />Disconnected</Badge>;
}

const TOGGLE_ITEMS: { key: keyof TIntToggles; label: string; description: string }[] = [
  { key: "email_enabled",            label: "Email",             description: "Outbound email for invoices, alerts, marketing." },
  { key: "sms_enabled",              label: "SMS",               description: "Transactional SMS notifications." },
  { key: "whatsapp_enabled",         label: "WhatsApp",          description: "Invoice & receipt sharing via WhatsApp." },
  { key: "telegram_enabled",         label: "Telegram",          description: "Executive alerts & daily reports." },
  { key: "google_analytics_enabled", label: "Google Analytics",  description: "Track app usage events (GA4)." },
  { key: "facebook_pixel_enabled",   label: "Facebook Pixel",    description: "Conversion tracking for marketing." },
  { key: "google_drive_enabled",     label: "Google Drive",      description: "Backup / archive exports to Drive." },
  { key: "webhooks_enabled",         label: "Webhooks",          description: "Push events to external systems." },
  { key: "api_access_enabled",       label: "API Access",        description: "Allow public REST API with keys." },
];

const PROVIDER_CHOICES: Record<TIntCategory, { value: string; label: string }[]> = {
  email:     [{ value: "resend", label: "Resend" }, { value: "sendgrid", label: "SendGrid" }, { value: "smtp", label: "SMTP" }, { value: "mailgun", label: "Mailgun" }, { value: "ses", label: "Amazon SES" }],
  sms:       [{ value: "bulksmsbd", label: "BulkSMSBD" }, { value: "ssl_wireless", label: "SSL Wireless" }, { value: "mim", label: "MIM SMS" }, { value: "twilio", label: "Twilio" }, { value: "custom", label: "Custom HTTP" }],
  whatsapp:  [{ value: "meta", label: "Meta Cloud API" }, { value: "twilio", label: "Twilio WhatsApp" }],
  telegram:  [{ value: "telegram", label: "Telegram Bot" }],
  analytics: [{ value: "ga4", label: "Google Analytics (GA4)" }],
  pixel:     [{ value: "fb_pixel", label: "Facebook Pixel" }],
  drive:     [{ value: "gdrive", label: "Google Drive OAuth" }],
};

const PROVIDER_FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  resend:       [{ key: "api_key", label: "API key" }, { key: "from_email", label: "From email" }, { key: "from_name", label: "From name" }],
  sendgrid:     [{ key: "api_key", label: "API key" }, { key: "from_email", label: "From email" }, { key: "from_name", label: "From name" }],
  smtp:         [{ key: "host", label: "Host" }, { key: "port", label: "Port" }, { key: "username", label: "Username" }, { key: "smtp_password", label: "Password" }, { key: "from_email", label: "From email" }],
  mailgun:      [{ key: "api_key", label: "API key" }, { key: "domain", label: "Domain" }, { key: "from_email", label: "From email" }],
  ses:          [{ key: "api_key", label: "Access key" }, { key: "secret", label: "Secret key" }, { key: "region", label: "Region" }, { key: "from_email", label: "From email" }],
  bulksmsbd:    [{ key: "api_url", label: "API URL" }, { key: "api_key", label: "API token" }, { key: "sender_id", label: "Sender ID" }],
  ssl_wireless: [{ key: "api_url", label: "API URL" }, { key: "api_key", label: "API token" }, { key: "sender_id", label: "Sender ID" }],
  mim:          [{ key: "api_url", label: "API URL" }, { key: "api_key", label: "API token" }, { key: "sender_id", label: "Sender ID" }],
  twilio:       [{ key: "account_sid", label: "Account SID" }, { key: "auth_token", label: "Auth token" }, { key: "sender_id", label: "Sender / From" }],
  custom:       [{ key: "api_url", label: "API URL" }, { key: "api_key", label: "API token" }, { key: "sender_id", label: "Sender ID" }],
  meta:         [{ key: "phone_number_id", label: "Phone number ID" }, { key: "api_key", label: "Access token" }, { key: "business_id", label: "Business account ID" }],
  telegram:     [{ key: "bot_token", label: "Bot token" }, { key: "chat_id", label: "Chat ID" }],
  ga4:          [{ key: "measurement_id", label: "Measurement ID (G-XXXX)" }],
  fb_pixel:     [{ key: "pixel_id", label: "Pixel ID" }],
  gdrive:       [{ key: "client_id", label: "Client ID" }, { key: "secret", label: "Client secret" }, { key: "refresh_token", label: "Refresh token" }],
};

const WEBHOOK_EVENTS = [
  "sale.created", "purchase.created", "product.created",
  "customer.created", "invoice.created", "subscription.updated",
];

function IntegrationsPanel() {
  const { currentTenantId } = useAuth();
  const access = useSettingsAccess(currentTenantId ?? undefined);

  const fns = {
    getT: useServerFn(getIntegrationToggles),
    updT: useServerFn(updateIntegrationToggles),
    listP: useServerFn(listIntegrationProviders),
    upP: useServerFn(upsertIntegrationProvider),
    delP: useServerFn(deleteIntegrationProvider),
    testP: useServerFn(testIntegrationProvider),
    listW: useServerFn(listWebhooks),
    upW: useServerFn(upsertWebhook),
    delW: useServerFn(deleteWebhook),
    listK: useServerFn(listApiKeys),
    crK: useServerFn(createApiKey),
    rvK: useServerFn(revokeApiKey),
  };

  const { data: toggles, refetch: refetchT } = useQuery({
    queryKey: ["int-toggles", currentTenantId], enabled: !!currentTenantId,
    queryFn: () => fns.getT({ data: { tenant_id: currentTenantId! } }),
  });
  const { data: providers, refetch: refetchP } = useQuery({
    queryKey: ["int-providers", currentTenantId], enabled: !!currentTenantId,
    queryFn: () => fns.listP({ data: { tenant_id: currentTenantId! } }),
  });
  const { data: hooks, refetch: refetchW } = useQuery({
    queryKey: ["int-webhooks", currentTenantId], enabled: !!currentTenantId,
    queryFn: () => fns.listW({ data: { tenant_id: currentTenantId! } }),
  });
  const { data: keys, refetch: refetchK } = useQuery({
    queryKey: ["int-apikeys", currentTenantId], enabled: !!currentTenantId,
    queryFn: () => fns.listK({ data: { tenant_id: currentTenantId! } }),
  });

  const patchToggle = async (p: Partial<TIntToggles>) => {
    if (!currentTenantId || access.readOnly) return;
    try { await fns.updT({ data: { tenant_id: currentTenantId, patch: p as any } }); await refetchT(); toast.success("Updated"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  /* --- provider editor state --- */
  const [draft, setDraft] = useState<{ category: TIntCategory; provider: string; status: "active" | "inactive"; config: Record<string, string> }>({
    category: "email", provider: "resend", status: "inactive", config: {},
  });
  const fields = PROVIDER_FIELDS[draft.provider] ?? [];
  const saveProvider = async () => {
    if (!currentTenantId) return;
    try {
      await fns.upP({ data: {
        tenant_id: currentTenantId,
        category: draft.category, provider: draft.provider,
        status: draft.status, config: draft.config,
      }});
      setDraft({ ...draft, config: {} });
      await refetchP();
      toast.success("Integration saved");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const removeProvider = async (id: string) => {
    if (!currentTenantId) return;
    try { await fns.delP({ data: { tenant_id: currentTenantId, id } }); await refetchP(); toast.success("Removed"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const testProvider = async (id: string) => {
    if (!currentTenantId) return;
    try { await fns.testP({ data: { tenant_id: currentTenantId, id } }); toast.success("Test sent"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  /* --- webhook editor state --- */
  const [hookDraft, setHookDraft] = useState<{ url: string; secret: string; events: string[] }>({ url: "", secret: "", events: ["sale.created"] });
  const saveHook = async () => {
    if (!currentTenantId || !hookDraft.url) return;
    try {
      await fns.upW({ data: {
        tenant_id: currentTenantId, url: hookDraft.url,
        secret: hookDraft.secret || undefined, events: hookDraft.events, active: true,
      }});
      setHookDraft({ url: "", secret: "", events: ["sale.created"] });
      await refetchW();
      toast.success("Webhook saved");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const removeHook = async (id: string) => {
    if (!currentTenantId) return;
    try { await fns.delW({ data: { tenant_id: currentTenantId, id } }); await refetchW(); toast.success("Removed"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  /* --- API key editor --- */
  const [keyDraft, setKeyDraft] = useState<{ name: string; scope: "read" | "read_write" | "full" }>({ name: "", scope: "read" });
  const [issued, setIssued] = useState<string | null>(null);
  const createKey = async () => {
    if (!currentTenantId || !keyDraft.name.trim()) return;
    try {
      const res = await fns.crK({ data: { tenant_id: currentTenantId, name: keyDraft.name.trim(), scope: keyDraft.scope } });
      setIssued(res.plaintext);
      setKeyDraft({ name: "", scope: "read" });
      await refetchK();
      toast.success("API key created — copy now, it won't be shown again");
    } catch (e: any) { toast.error(e.message ?? "Failed"); }
  };
  const revoke = async (id: string) => {
    if (!currentTenantId) return;
    try { await fns.rvK({ data: { tenant_id: currentTenantId, id } }); await refetchK(); toast.success("Revoked"); }
    catch (e: any) { toast.error(e.message ?? "Failed"); }
  };

  return (
    <Panel title="Integrations" description="Connect email, SMS, WhatsApp, Telegram, analytics and webhooks. Secrets stay encrypted and are never shown again after save.">
      <fieldset disabled={access.readOnly || !toggles} className="contents">
        {/* Toggle grid */}
        <div className="grid gap-3 md:grid-cols-2">
          {TOGGLE_ITEMS.map((t) => (
            <div key={t.key} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-semibold">{t.label}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </div>
              <Switch checked={!!toggles?.[t.key]} onCheckedChange={(v) => patchToggle({ [t.key]: v } as any)} />
            </div>
          ))}
        </div>

        <Separator />

        {/* Provider editor */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Plug className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Add / update provider</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Category">
              <Select
                value={draft.category}
                onValueChange={(v) => {
                  const cat = v as TIntCategory;
                  const first = PROVIDER_CHOICES[cat][0]?.value ?? "";
                  setDraft({ category: cat, provider: first, status: "inactive", config: {} });
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROVIDER_CHOICES) as TIntCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Provider">
              <Select value={draft.provider} onValueChange={(v) => setDraft({ ...draft, provider: v, config: {} })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_CHOICES[draft.category].map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end"><Button type="button" className="w-full" onClick={saveProvider}>Save provider</Button></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input
                  type={["smtp_password","secret","auth_token","api_key","bot_token","refresh_token"].includes(f.key) ? "password" : "text"}
                  value={draft.config[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, config: { ...draft.config, [f.key]: e.target.value } })}
                  placeholder={f.label}
                />
              </Field>
            ))}
          </div>

          <div className="mt-3 rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(providers ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">No integrations configured</TableCell></TableRow>
                ) : (providers ?? []).map((p: TIntProvider) => (
                  <TableRow key={p.id}>
                    <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                    <TableCell className="font-medium">{p.provider}</TableCell>
                    <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.updated_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => testProvider(p.id)}>Test</Button>
                      <Button size="sm" variant="ghost" onClick={() => removeProvider(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator />

        {/* Webhooks */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Webhooks</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Field label="Webhook URL"><Input value={hookDraft.url} onChange={(e) => setHookDraft({ ...hookDraft, url: e.target.value })} placeholder="https://example.com/webhooks/sohojpharma" /></Field>
            <Field label="Secret (optional)"><Input type="password" value={hookDraft.secret} onChange={(e) => setHookDraft({ ...hookDraft, secret: e.target.value })} placeholder="whsec_..." /></Field>
          </div>
          <div className="mt-2">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Events</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {WEBHOOK_EVENTS.map((e) => {
                const checked = hookDraft.events.includes(e);
                return (
                  <div key={e} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm">{e}</span>
                    <Switch
                      checked={checked}
                      onCheckedChange={(v) =>
                        setHookDraft({
                          ...hookDraft,
                          events: v ? Array.from(new Set([...hookDraft.events, e])) : hookDraft.events.filter((x) => x !== e),
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="button" onClick={saveHook}>Add webhook</Button>
          </div>
          <div className="mt-3 rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(hooks ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No webhooks yet</TableCell></TableRow>
                ) : (hooks ?? []).map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs">{h.url}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{h.events.map((e) => <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>)}</div></TableCell>
                    <TableCell><Badge variant={h.active ? "default" : "secondary"}>{h.active ? "active" : "inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => removeHook(h.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Separator />

        {/* API Keys */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">API access</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Key name"><Input value={keyDraft.name} onChange={(e) => setKeyDraft({ ...keyDraft, name: e.target.value })} placeholder="Mobile app" /></Field>
            <Field label="Scope">
              <Select value={keyDraft.scope} onValueChange={(v) => setKeyDraft({ ...keyDraft, scope: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read</SelectItem>
                  <SelectItem value="read_write">Read &amp; write</SelectItem>
                  <SelectItem value="full">Full (admin)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end sm:col-span-2"><Button type="button" className="w-full" onClick={createKey}>Generate API key</Button></div>
          </div>
          {issued && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
              <p className="mb-1 font-semibold">Copy this key now — it won't be shown again:</p>
              <code className="block break-all font-mono">{issued}</code>
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="outline" onClick={() => setIssued(null)}>Dismiss</Button>
              </div>
            </div>
          )}
          <div className="mt-3 rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(keys ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No API keys yet</TableCell></TableRow>
                ) : (keys ?? []).map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">{k.prefix}••••</TableCell>
                    <TableCell><Badge variant="outline">{k.scope}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}</TableCell>
                    <TableCell><Badge variant={k.revoked_at ? "secondary" : "default"}>{k.revoked_at ? "revoked" : "active"}</Badge></TableCell>
                    <TableCell className="text-right">
                      {!k.revoked_at && <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>Revoke</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </fieldset>
    </Panel>
  );
}





/* ---------- General (overview) ---------- */
function GeneralPanel({ onSelect }: { onSelect: (k: TabKey) => void }) {
  const quick: { key: TabKey; label: string; description: string; icon: typeof Store }[] = [
    { key: "profile",       label: "Pharmacy Profile",   description: "Name, address, license, contact info.", icon: Store },
    { key: "branding",      label: "Branding",           description: "Logo, colors, v1/v2 desktop UI.",       icon: Palette },
    { key: "localization",  label: "Language & Locale",  description: "English / বাংলা, currency, timezone.",  icon: Languages },
    { key: "preferences",   label: "System Preferences", description: "Defaults, session, theme, widgets.",    icon: Sliders },
    { key: "pos-advanced",  label: "POS Settings",       description: "Receipts, shortcuts, sale behavior.",   icon: Scan },
    { key: "security",      label: "Security",           description: "Password policy, 2FA, audit log.",      icon: Shield },
  ];

  return (
    <Panel title="General" description="Overview of your pharmacy setup. Click any card below to configure details.">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {quick.map(q => {
          const Icon = q.icon;
          return (
            <button
              key={q.key}
              type="button"
              onClick={() => onSelect(q.key)}
              className="flex items-start gap-3 rounded-xl border border-border p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/5"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{q.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{q.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
