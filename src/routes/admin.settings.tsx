import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUIStore } from "@/stores/ui-store";
import { Upload } from "lucide-react";


export const Route = createFileRoute("/admin/settings")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Settings — Super Admin" }] }),
  component: AdminSettings,
});

function AdminSettings() {
  const { t } = useTranslation();
  const { language, setLanguage } = useUIStore();

  return (
    <AppShell variant="admin" title={t("nav.settings")}>
      <PageHeader title={t("admin.settings.title")} description={t("admin.settings.desc")} />

      <Tabs defaultValue="general">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="general">{t("admin.settings.general")}</TabsTrigger>
          <TabsTrigger value="localization">{t("admin.settings.localization")}</TabsTrigger>
          <TabsTrigger value="system">{t("admin.settings.system")}</TabsTrigger>
          <TabsTrigger value="email">{t("admin.settings.email")}</TabsTrigger>
          <TabsTrigger value="sms">{t("admin.settings.sms")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t("admin.settings.siteIdentity")}</CardTitle></CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label>{t("admin.settings.siteName")}</Label><Input defaultValue="SohojPharma" /></div>
              <div className="space-y-2"><Label>{t("admin.settings.supportEmail")}</Label><Input defaultValue="support@sohojpharma.cloud" /></div>
              <UploadField label={t("admin.settings.siteLogo")} hint={t("admin.settings.uploadHint")} />
              <UploadField label={t("admin.settings.favicon")} hint={t("admin.settings.uploadHint")} />
              <div className="md:col-span-2"><Button>{t("common.saveChanges")}</Button></div>
            </CardContent>
          </Card>
        </TabsContent>




        <TabsContent value="localization" className="mt-4">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t("admin.settings.languages")}</CardTitle></CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("admin.settings.defaultLang")}</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "bn")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="bn">বাংলা (Bangla)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("admin.settings.currency")}</Label>
                <Select defaultValue="BDT">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BDT">৳ Bangladeshi Taka (BDT)</SelectItem>
                    <SelectItem value="USD">$ US Dollar (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("admin.settings.timezone")}</Label>
                <Select defaultValue="Asia/Dhaka">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Dhaka">Asia/Dhaka (GMT+6)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="mt-4">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t("admin.settings.system")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ToggleRow title={t("admin.settings.maintenance")} description={t("admin.settings.maintenanceDesc")} />
              <ToggleRow title={t("admin.settings.allowSignups")} description={t("admin.settings.allowSignupsDesc")} defaultChecked />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label>{t("admin.settings.trialDays")}</Label><Input type="number" defaultValue={14} /></div>
                <div className="space-y-2"><Label>{t("admin.settings.defaultPlan")}</Label>
                  <Select defaultValue="free"><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="starter">Starter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button>{t("admin.settings.saveSettings")}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t("admin.settings.smtpConfig")}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>{t("admin.settings.smtpHost")}</Label><Input placeholder="smtp.sendgrid.net" /></div>
              <div className="space-y-2"><Label>{t("admin.settings.port")}</Label><Input type="number" placeholder="587" /></div>
              <div className="space-y-2"><Label>{t("admin.settings.username")}</Label><Input placeholder="apikey" /></div>
              <div className="space-y-2"><Label>{t("admin.settings.password")}</Label><Input type="password" /></div>
              <div className="space-y-2"><Label>{t("admin.settings.fromName")}</Label><Input placeholder="SohojPharma" /></div>
              <div className="space-y-2"><Label>{t("admin.settings.fromEmail")}</Label><Input placeholder="no-reply@sohojpharma.cloud" /></div>
              <div className="md:col-span-2 flex gap-2">
                <Button>{t("admin.settings.saveSmtp")}</Button>
                <Button variant="outline">{t("admin.settings.sendTest")}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sms" className="mt-4">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t("admin.settings.smsGateway")}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("admin.settings.smsSoon")}</p>
              <div className="space-y-2"><Label>{t("admin.settings.provider")}</Label>
                <Select defaultValue="bulksms">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bulksms">BulkSMSBD</SelectItem>
                    <SelectItem value="twilio">Twilio</SelectItem>
                    <SelectItem value="nexmo">Vonage / Nexmo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t("admin.settings.apiKey")}</Label><Input type="password" disabled placeholder={t("common.disabled")} /></div>
              <Button disabled>{t("admin.settings.saveSms")}</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ToggleRow({ title, description, defaultChecked }: { title: string; description: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

function UploadField({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid place-items-center rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        <Upload className="mb-2 h-5 w-5" />
        {hint}
      </div>
    </div>
  );
}
