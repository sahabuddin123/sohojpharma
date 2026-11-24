import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { listShifts, upsertShift, listStaff } from "@/lib/api/staff.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/staff/shifts")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Shifts — SohojPharma" }] }),
  component: ShiftsPage,
});

function ShiftsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listShiftsFn = useServerFn(listShifts);
  const listStaffFn = useServerFn(listStaff);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["shifts", tenantId],
    enabled: !!tenantId,
    queryFn: () => listShiftsFn({ data: { tenant_id: tenantId } }),
  });
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list", tenantId],
    enabled: !!tenantId,
    queryFn: () => listStaffFn({ data: { tenant_id: tenantId } }),
  });

  return (
    <>
      <PageHeader title={t('ops.staff.shifts.title')} description={t('ops.staff.shifts.desc')} actions={<AddShiftDialog tenantId={tenantId} />} />
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            {shifts.length === 0 ? (
              <Card className="shadow-card sm:col-span-3"><CardContent className="py-8 text-center text-sm text-muted-foreground">{t('ops.staff.shifts.noShifts')}</CardContent></Card>
            ) : shifts.map((s) => {
              const assigned = staff.filter((e) => e.shift_id === s.id);
              return (
                <Card key={s.id} className="shadow-card">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      {s.name} <Badge className="bg-primary/15 text-primary">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {assigned.map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{e.full_name}</span>
                        <span className="text-xs text-muted-foreground">{e.designation ?? "-"}</span>
                      </div>
                    ))}
                    {assigned.length === 0 && <p className="text-xs text-muted-foreground">{t('ops.staff.shifts.noOneAssigned')}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">{t('ops.staff.shifts.allShiftsTitle')}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>{t('ops.staff.shifts.colEmployee')}</TableHead><TableHead>{t('ops.staff.shifts.colDesignation')}</TableHead><TableHead>{t('ops.staff.shifts.colShift')}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {staff.map((e) => {
                    const shift = shifts.find((s) => s.id === e.shift_id);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.full_name}</TableCell>
                        <TableCell>{e.designation ?? "-"}</TableCell>
                        <TableCell>{shift ? <Badge className="bg-primary/15 text-primary">{shift.name}</Badge> : <span className="text-xs text-muted-foreground">{t('ops.staff.shifts.unassigned')}</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                  {staff.length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">{t('ops.staff.shifts.noEmployees')}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function AddShiftDialog({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", start_time: "08:00", end_time: "16:00", break_minutes: 0 });
  const upsertFn = useServerFn(upsertShift);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => upsertFn({ data: { tenant_id: tenantId, ...form, is_active: true } }),
    onSuccess: () => {
      toast.success(t('ops.staff.shifts.shiftAdded'));
      qc.invalidateQueries({ queryKey: ["shifts", tenantId] });
      setOpen(false);
      setForm({ name: "", start_time: "08:00", end_time: "16:00", break_minutes: 0 });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button disabled={!tenantId}><Plus className="mr-1.5 h-4 w-4" />{t('ops.staff.shifts.addShift')}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('ops.staff.shifts.addShift')}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>{t('ops.staff.shifts.shiftName')}</Label><Input value={form.name} placeholder={t('ops.staff.shifts.shiftNamePh')} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t('ops.staff.shifts.startTime')}</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
            <div><Label>{t('ops.staff.shifts.endTime')}</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
          </div>
          <div><Label>{t('ops.staff.shifts.breakMinutes')}</Label><Input type="number" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: Number(e.target.value) })} /></div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('ops.staff.shifts.saveShift')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
