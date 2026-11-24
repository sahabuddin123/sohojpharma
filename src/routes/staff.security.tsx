import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LogOut, ShieldAlert, Smartphone, Monitor } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/staff/security")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Security — SohojPharma" }] }),
  component: SecurityPage,
});

const sessions = [
  { user: "Sumon Ahmed", device: "Chrome on Windows", icon: Monitor, ip: "103.99.x.x", last: "2 min ago", active: true },
  { user: "Rina Khatun", device: "SohojPharma Mobile (Android)", icon: Smartphone, ip: "192.168.x.x", last: "10 min ago", active: true },
  { user: "Karim Hossain", device: "Safari on macOS", icon: Monitor, ip: "103.99.x.x", last: "1 hour ago", active: true },
  { user: "Joshim Ali", device: "SohojPharma Mobile (iOS)", icon: Smartphone, ip: "117.18.x.x", last: "3 days ago", active: false },
];

const loginHistory = [
  { user: "Tania Akter", when: "2026-06-14 09:02", ip: "203.76.x.x", device: "Chrome / Windows", status: "Success" },
  { user: "Sumon Ahmed", when: "2026-06-14 08:55", ip: "103.99.x.x", device: "Chrome / Windows", status: "Success" },
  { user: "unknown", when: "2026-06-14 03:14", ip: "45.227.x.x", device: "curl", status: "Failed" },
];

function SecurityPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('ops.staff.security.title')} description={t('ops.staff.security.desc')} actions={<Button variant="outline"><ShieldAlert className="mr-1.5 h-4 w-4" />{t('ops.staff.security.forceLogoutAll')}</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t('ops.staff.security.activeSessions')}</CardTitle></CardHeader><CardContent className="space-y-3">
          {sessions.filter((s) => s.active).map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold">{s.user}</p>
                    <p className="text-xs text-muted-foreground">{s.device} · {s.ip} · {s.last}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive"><LogOut className="mr-1.5 h-4 w-4" /> {t('ops.staff.security.logout')}</Button>
              </div>
            );
          })}
        </CardContent></Card>

        <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t('ops.staff.security.loginHistory')}</CardTitle></CardHeader><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>{t('ops.staff.security.colUser')}</TableHead><TableHead>{t('ops.staff.security.colWhen')}</TableHead><TableHead>{t('ops.staff.security.colDevice')}</TableHead><TableHead>{t('ops.staff.security.colStatus')}</TableHead></TableRow></TableHeader>
            <TableBody>
              {loginHistory.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{l.user}</TableCell>
                  <TableCell className="text-muted-foreground">{l.when}</TableCell>
                  <TableCell><div>{l.device}</div><div className="text-xs text-muted-foreground">{l.ip}</div></TableCell>
                  <TableCell><Badge variant={l.status === "Success" ? "default" : "destructive"}>{l.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </>
  );
}
