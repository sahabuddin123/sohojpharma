import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Clock, LogIn, LogOut, UserX, Loader2 } from "lucide-react";
import { listStaff, listAttendance, checkInStaff, checkOutStaff } from "@/lib/api/staff.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/attendance")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Attendance — SohojPharma" }] }),
  component: AttendancePage,
});

const tone: Record<string, string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  late: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
  absent: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300",
  leave: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  half_day: "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300",
};

function AttendancePage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedStaff, setSelectedStaff] = useState<string>("");

  const listStaffFn = useServerFn(listStaff);
  const listAttFn = useServerFn(listAttendance);
  const checkInFn = useServerFn(checkInStaff);
  const checkOutFn = useServerFn(checkOutStaff);
  const qc = useQueryClient();

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list", tenantId],
    enabled: !!tenantId,
    queryFn: () => listStaffFn({ data: { tenant_id: tenantId, status: "active" } }),
  });

  const { data: attendance = [], isLoading } = useQuery({
    queryKey: ["attendance", tenantId, date],
    enabled: !!tenantId,
    queryFn: () => listAttFn({ data: { tenant_id: tenantId, from_date: date, to_date: date } }),
  });

  const attendanceMap = new Map(attendance.map((a) => [a.staff_id, a]));
  const counts = { present: 0, late: 0, absent: 0, leave: 0 };
  staff.forEach((s) => {
    const a = attendanceMap.get(s.id);
    if (!a) counts.absent += 1;
    else if (a.status === "present") counts.present += 1;
    else if (a.status === "late") counts.late += 1;
    else if (a.status === "leave") counts.leave += 1;
  });

  const checkIn = useMutation({
    mutationFn: (staff_id: string) => checkInFn({ data: { tenant_id: tenantId, staff_id } }),
    onSuccess: () => { toast.success(t("ops.staff.attendance.checkedIn")); qc.invalidateQueries({ queryKey: ["attendance", tenantId, date] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const checkOut = useMutation({
    mutationFn: (staff_id: string) => checkOutFn({ data: { tenant_id: tenantId, staff_id } }),
    onSuccess: () => { toast.success(t("ops.staff.attendance.checkedOut")); qc.invalidateQueries({ queryKey: ["attendance", tenantId, date] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title={t("ops.staff.attendance.title")}
        description={t("ops.staff.attendance.desc")}
        actions={
          <div className="flex gap-2">
            <Select value={selectedStaff} onValueChange={setSelectedStaff}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder={t("ops.staff.attendance.selectEmployee")} /></SelectTrigger>
              <SelectContent>{staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" disabled={!selectedStaff || checkOut.isPending} onClick={() => checkOut.mutate(selectedStaff)}>
              <LogOut className="mr-1.5 h-4 w-4" />{t("ops.staff.attendance.checkOut")}
            </Button>
            <Button disabled={!selectedStaff || checkIn.isPending} onClick={() => checkIn.mutate(selectedStaff)}>
              <LogIn className="mr-1.5 h-4 w-4" />{t("ops.staff.attendance.checkIn")}
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[200px]" />
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <StatCard label={t("ops.staff.attendance.present")} value={String(counts.present)} icon={Clock} tone="success" />
        <StatCard label={t("ops.staff.attendance.late")} value={String(counts.late)} icon={Clock} tone="warning" />
        <StatCard label={t("ops.staff.attendance.absent")} value={String(counts.absent)} icon={UserX} tone="warning" />
        <StatCard label={t("ops.staff.attendance.onLeave")} value={String(counts.leave)} icon={UserX} tone="secondary" />
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("ops.staff.attendance.attendanceFor", { date })}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("common.loading")}</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("ops.staff.attendance.colEmployee")}</TableHead>
                <TableHead>{t("ops.staff.attendance.colDesignation")}</TableHead>
                <TableHead>{t("ops.staff.attendance.colCheckIn")}</TableHead>
                <TableHead>{t("ops.staff.attendance.colCheckOut")}</TableHead>
                <TableHead>{t("ops.staff.attendance.colWorked")}</TableHead>
                <TableHead>{t("ops.staff.attendance.colStatus")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {staff.map((s) => {
                  const a = attendanceMap.get(s.id);
                  const status = a?.status ?? "absent";
                  const fmt = (ts?: string | null) => (ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
                  return (
                    <TableRow key={s.id}>
                      <TableCell><div className="font-medium">{s.full_name}</div><div className="text-xs text-muted-foreground">{s.employee_code ?? ""}</div></TableCell>
                      <TableCell>{s.designation ?? "-"}</TableCell>
                      <TableCell>{fmt(a?.check_in)}</TableCell>
                      <TableCell>{fmt(a?.check_out)}</TableCell>
                      <TableCell>{a?.worked_minutes ? `${Math.floor(a.worked_minutes / 60)}h ${a.worked_minutes % 60}m` : "—"}</TableCell>
                      <TableCell><Badge className={tone[status]}>{status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
                {staff.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{t("ops.staff.attendance.noActiveEmployees")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
