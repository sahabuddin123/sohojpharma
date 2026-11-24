import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, UserCheck, UserX, CalendarCheck, Wallet } from "lucide-react";
import { staff } from "@/data/staff";

export const Route = createFileRoute("/staff/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Staff Dashboard — SohojPharma" }] }),
  component: StaffDashboard,
});

function StaffDashboard() {
  const { t } = useTranslation();
  const active = staff.filter((s) => s.status === "Active").length;
  const onLeave = staff.filter((s) => s.status === "On Leave").length;
  const payroll = staff.reduce((s, e) => s + e.salary, 0);
  return (
    <>
      <PageHeader
        title={t("sections.staff.title")}
        description={t("sections.staff.desc")}
        actions={<Button asChild><Link to="/staff/list">{t("sections.staff.manageEmployees")}</Link></Button>}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("sections.staff.totalStaff")} value={String(staff.length)} icon={Users} tone="primary" />
        <StatCard label={t("sections.staff.active")} value={String(active)} icon={UserCheck} tone="success" />
        <StatCard label={t("sections.staff.onLeave")} value={String(onLeave)} icon={UserX} tone="warning" />
        <StatCard label={t("sections.staff.presentToday")} value={`${active - onLeave}/${staff.length}`} icon={CalendarCheck} tone="secondary" />
        <StatCard label={t("sections.staff.monthlyPayroll")} value={`৳ ${payroll.toLocaleString("en-IN")}`} icon={Wallet} tone="primary" />
        <StatCard label={t("sections.staff.pendingLeave")} value="2" icon={CalendarCheck} tone="warning" />
        <StatCard label={t("sections.staff.newThisMonth")} value="1" icon={UserCheck} tone="success" />
        <StatCard label={t("sections.staff.avgAttendance")} value="94%" icon={UserCheck} tone="success" />
      </div>

      <Card className="mt-6 shadow-card">
        <CardHeader><CardTitle className="text-base">{t("sections.staff.todayRoster")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {staff.slice(0, 6).map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.designation} · {s.shift} {t("sections.staff.shift")}</p>
              </div>
              <Badge variant={s.status === "Active" ? "default" : "secondary"}>{s.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
