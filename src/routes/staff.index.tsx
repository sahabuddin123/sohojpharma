import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, UserCheck, UserX, CalendarCheck, Wallet, Loader2 } from "lucide-react";
import { listStaff } from "@/lib/api/staff.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/staff/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Staff Dashboard — SohojPharma" }] }),
  component: StaffDashboard,
});

function StaffDashboard() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listStaff);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff-list", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenant_id: tenantId } }),
  });

  const active = staff.filter((s: any) => (s.status ?? "active") === "active").length;
  const onLeave = staff.filter((s: any) => s.status === "on_leave").length;
  const payroll = staff.reduce((sum: number, e: any) => sum + Number(e.base_salary ?? 0), 0);
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const newThisMonth = staff.filter((s: any) => String(s.created_at ?? "").startsWith(monthPrefix)).length;

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
        <StatCard label={t("sections.staff.presentToday")} value={`${active}/${staff.length}`} icon={CalendarCheck} tone="secondary" />
        <StatCard label={t("sections.staff.monthlyPayroll")} value={`৳ ${payroll.toLocaleString("en-IN")}`} icon={Wallet} tone="primary" />
        <StatCard label={t("sections.staff.pendingLeave")} value="0" icon={CalendarCheck} tone="warning" />
        <StatCard label={t("sections.staff.newThisMonth")} value={String(newThisMonth)} icon={UserCheck} tone="success" />
        <StatCard label={t("sections.staff.avgAttendance")} value={staff.length > 0 ? `${Math.round((active / staff.length) * 100)}%` : "0%"} icon={UserCheck} tone="success" />
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">{t("sections.staff.todayRoster")}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : staff.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <p>{t("ops.staff.list.noEmployees")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {staff.slice(0, 6).map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-border/60 p-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{s.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.designation ?? s.role ?? "Staff"}</p>
                  </div>
                  <Badge variant={(s.status ?? "active") === "active" ? "success" : "secondary"}>{s.status ?? "active"}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
