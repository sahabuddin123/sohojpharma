import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Image as ImageIcon, Smartphone, Monitor, LogIn, Eye, Trash2, Pencil } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/advertisements")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Advertisements — Super Admin" }] }),
  component: AdsPage,
});

interface Ad {
  id: string;
  title: string;
  type: "Banner" | "Popup" | "Mobile";
  placement: "Dashboard" | "Login Page" | "Mobile App";
  active: boolean;
  starts: string;
  ends: string;
}

const allAds: Ad[] = [
  { id: "AD-101", title: "EID Special — 30% off Pro", type: "Banner", placement: "Dashboard", active: true, starts: "2026-06-01", ends: "2026-06-30" },
  { id: "AD-102", title: "Welcome bonus offer", type: "Popup", placement: "Login Page", active: true, starts: "2026-06-10", ends: "2026-07-10" },
  { id: "AD-103", title: "New iOS app launch", type: "Mobile", placement: "Mobile App", active: false, starts: "2026-05-15", ends: "2026-06-15" },
];

const icon = { Banner: Monitor, Popup: Eye, Mobile: Smartphone, "Login Page": LogIn };

function AdsPage() {
  const { t } = useTranslation();
  const [ads, setAds] = useState(allAds);

  return (
    <AppShell variant="admin" title={t("nav.advertisements")}>
      <PageHeader
        title={t("admin.advertisements.title")}
        description={t("admin.advertisements.desc")}
        actions={
          <Dialog>
            <DialogTrigger asChild><Button><Plus className="mr-1.5 h-4 w-4" /> {t("admin.advertisements.newAd")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("admin.advertisements.create")}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-2"><Label>{t("admin.advertisements.title2")}</Label><Input placeholder={t("admin.advertisements.titlePh")} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>{t("admin.advertisements.type")}</Label>
                    <Select defaultValue="Banner"><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Banner">Banner</SelectItem>
                        <SelectItem value="Popup">Popup</SelectItem>
                        <SelectItem value="Mobile">Mobile</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>{t("admin.advertisements.placement")}</Label>
                    <Select defaultValue="Dashboard"><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dashboard">Dashboard</SelectItem>
                        <SelectItem value="Login Page">Login Page</SelectItem>
                        <SelectItem value="Mobile App">Mobile App</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>{t("admin.advertisements.startDate")}</Label><Input type="date" /></div>
                  <div className="space-y-2"><Label>{t("admin.advertisements.endDate")}</Label><Input type="date" /></div>
                </div>
                <div className="space-y-2"><Label>{t("admin.advertisements.image")}</Label>
                  <div className="grid place-items-center rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                    <ImageIcon className="mb-2 h-6 w-6" /> {t("admin.advertisements.uploadBanner")}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline">{t("common.cancel")}</Button>
                <Button>{t("admin.advertisements.createBtn")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">{t("admin.advertisements.all")}</TabsTrigger>
          <TabsTrigger value="Banner">{t("admin.advertisements.banners")}</TabsTrigger>
          <TabsTrigger value="Popup">{t("admin.advertisements.popups")}</TabsTrigger>
          <TabsTrigger value="Mobile">{t("admin.advertisements.mobile")}</TabsTrigger>
        </TabsList>
        {["all", "Banner", "Popup", "Mobile"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {ads.filter((a) => tab === "all" || a.type === tab).map((a) => {
                const Icon = icon[a.type];
                return (
                  <Card key={a.id} className="shadow-card transition-shadow hover:shadow-elevated">
                    <div className="grid h-32 place-items-center rounded-t-xl bg-brand-gradient text-white">
                      <Icon className="h-10 w-10 opacity-80" />
                    </div>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{a.title}</CardTitle>
                        <Switch
                          checked={a.active}
                          onCheckedChange={(v) => setAds((arr) => arr.map((x) => x.id === a.id ? { ...x, active: v } : x))}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{a.type}</Badge>
                        <Badge variant="outline">{a.placement}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <p className="text-xs text-muted-foreground">{a.starts} → {a.ends}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1"><Pencil className="mr-1.5 h-4 w-4" /> {t("admin.advertisements.edit")}</Button>
                        <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </AppShell>
  );
}
