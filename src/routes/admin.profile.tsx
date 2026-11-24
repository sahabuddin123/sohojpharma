import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, LogIn, ShieldCheck, Pencil } from "lucide-react";

export const Route = createFileRoute("/admin/profile")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Admin Profile — Super Admin" }] }),
  component: ProfilePage,
});

const activities = [
  { icon: LogIn, text: "Signed in from 103.94.x.x · Dhaka", time: "2m ago" },
  { icon: ShieldCheck, text: "Approved payment PAY-9012 for Lazz Pharma", time: "1h ago" },
  { icon: Pencil, text: "Updated Pro plan pricing to ৳ 2,490/mo", time: "yesterday" },
  { icon: LogIn, text: "Signed in from 103.94.x.x · Dhaka", time: "2d ago" },
];

function ProfilePage() {
  const { t } = useTranslation();
  return (
    <AppShell variant="admin" title={t("nav.adminProfile")}>
      <PageHeader title={t("admin.profile.title")} description={t("admin.profile.desc")} />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="shadow-card">
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-brand-gradient text-2xl font-bold text-white">SA</AvatarFallback>
            </Avatar>
            <h2 className="mt-3 text-lg font-bold">Sajid Admin</h2>
            <p className="text-sm text-muted-foreground">sajid@sohojpharma.cloud</p>
            <Badge className="mt-2 bg-primary/10 text-primary hover:bg-primary/10">{t("app.portalAdmin")}</Badge>
            <Button variant="outline" size="sm" className="mt-4 w-full"><Pencil className="mr-1.5 h-4 w-4" /> {t("admin.profile.editAvatar")}</Button>
          </CardContent>
        </Card>

        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">{t("admin.profile.profile")}</TabsTrigger>
            <TabsTrigger value="password">{t("admin.profile.password")}</TabsTrigger>
            <TabsTrigger value="activity">{t("admin.profile.activity")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-4">
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">{t("admin.profile.profileInfo")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>{t("admin.profile.fullName")}</Label><Input defaultValue="Sajid Admin" /></div>
                <div className="space-y-2"><Label>{t("admin.profile.email")}</Label><Input defaultValue="sajid@sohojpharma.cloud" /></div>
                <div className="space-y-2"><Label>{t("admin.profile.phone")}</Label><Input defaultValue="+880 1711-000000" /></div>
                <div className="space-y-2"><Label>{t("admin.profile.designation")}</Label><Input defaultValue="Platform Administrator" /></div>
                <div className="md:col-span-2"><Button>{t("common.saveChanges")}</Button></div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="password" className="mt-4">
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">{t("admin.profile.changePassword")}</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:max-w-md">
                <div className="space-y-2"><Label>{t("admin.profile.current")}</Label><Input type="password" /></div>
                <div className="space-y-2"><Label>{t("admin.profile.newPw")}</Label><Input type="password" /></div>
                <div className="space-y-2"><Label>{t("admin.profile.confirm")}</Label><Input type="password" /></div>
                <Button>{t("admin.profile.updatePw")}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> {t("admin.profile.recent")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {activities.map((a, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <a.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{a.text}</p>
                      <p className="text-xs text-muted-foreground">{a.time}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
