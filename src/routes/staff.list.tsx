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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { listStaff, upsertStaff } from "@/lib/api/staff.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { localizePgError } from "@/lib/errors/pg-limit";

export const Route = createFileRoute("/staff/list")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Employees — SohojPharma" }] }),
  component: EmployeeList,
});

const designations = ["Pharmacist", "Sales Associate", "Cashier", "Manager", "Stock Keeper", "Delivery"];

function EmployeeList() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listStaff);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["staff-list", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenant_id: tenantId } }),
  });

  return (
    <>
      <PageHeader title={t('ops.staff.list.title')} description={t('ops.staff.list.desc')} actions={<AddStaffDialog tenantId={tenantId} />} />
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t('ops.staff.list.allEmployees')}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
          ) : staff.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('ops.staff.list.noEmployees')}</div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="space-y-3 p-3 md:hidden">
                {staff.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{s.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.employee_code ?? s.id.slice(0, 8)}
                          {s.designation ? ` · ${s.designation}` : ""}
                        </p>
                      </div>
                      <Badge variant={s.status === "active" ? "default" : s.status === "terminated" ? "destructive" : "secondary"}>{s.status}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">{t('ops.staff.list.colPhone')}: </span>{s.phone ?? "-"}</div>
                      <div><span className="text-muted-foreground">{t('ops.staff.list.colJoined')}: </span>{s.join_date ?? "-"}</div>
                      <div className="col-span-2 font-semibold">৳ {Number(s.basic_salary ?? 0).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>{t('ops.staff.list.colEmployee')}</TableHead><TableHead>{t('ops.staff.list.colDesignation')}</TableHead><TableHead>{t('ops.staff.list.colPhone')}</TableHead><TableHead>{t('ops.staff.list.colJoined')}</TableHead><TableHead className="text-right">{t('ops.staff.list.colSalary')}</TableHead><TableHead>{t('ops.staff.list.colStatus')}</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {staff.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.full_name}</div>
                          <div className="text-xs text-muted-foreground">{s.employee_code ?? s.id.slice(0, 8)}{s.email ? ` · ${s.email}` : ""}</div>
                        </TableCell>
                        <TableCell>{s.designation ?? "-"}</TableCell>
                        <TableCell>{s.phone ?? "-"}</TableCell>
                        <TableCell>{s.join_date ?? "-"}</TableCell>
                        <TableCell className="text-right">৳ {Number(s.basic_salary ?? 0).toLocaleString()}</TableCell>
                        <TableCell><Badge variant={s.status === "active" ? "default" : s.status === "terminated" ? "destructive" : "secondary"}>{s.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function AddStaffDialog({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    employee_code: "",
    designation: "",
    phone: "",
    email: "",
    national_id: "",
    address: "",
    join_date: "",
    basic_salary: 0,
    create_login: true,
    password: "",
    access_role: "cashier" as "manager" | "pharmacist" | "cashier" | "staff" | "auditor",
  });
  const upsertFn = useServerFn(upsertStaff);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          tenant_id: tenantId,
          ...form,
          basic_salary: Number(form.basic_salary) || 0,
          password: form.create_login ? form.password : undefined,
          access_role: form.create_login ? form.access_role : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(t('ops.staff.list.employeeAdded'));
      qc.invalidateQueries({ queryKey: ["staff-list", tenantId] });
      setOpen(false);
      setForm({
        full_name: "",
        employee_code: "",
        designation: "",
        phone: "",
        email: "",
        national_id: "",
        address: "",
        join_date: "",
        basic_salary: 0,
        create_login: true,
        password: "",
        access_role: "cashier",
      });
    },
    onError: (e: Error) => toast.error(localizePgError(t, e)),
  });

  const canSubmit =
    Boolean(form.full_name.trim()) &&
    (!form.create_login || (Boolean(form.email.trim()) && form.password.length >= 6));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button disabled={!tenantId}><Plus className="mr-1.5 h-4 w-4" /> {t('ops.staff.list.addStaff')}</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{t('ops.staff.list.addEmployee')}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>{t('ops.staff.list.fullName')}</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div><Label>{t('ops.staff.list.employeeCode')}</Label><Input placeholder={t('ops.staff.list.employeeCodePh')} value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} /></div>
          <div><Label>{t('ops.staff.list.designation')}</Label>
            <Select value={form.designation} onValueChange={(v) => setForm({ ...form, designation: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{designations.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>{t('ops.staff.list.mobile')}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>{t('ops.staff.list.email')}{form.create_login ? " *" : ""}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="staff@pharmacy.com" /></div>
          <div><Label>{t('ops.staff.list.nationalId')}</Label><Input value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>{t('ops.staff.list.address')}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>{t('ops.staff.list.joiningDate')}</Label><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></div>
          <div><Label>{t('ops.staff.list.salary')}</Label><Input type="number" value={form.basic_salary} onChange={(e) => setForm({ ...form, basic_salary: Number(e.target.value) })} /></div>

          {/* Store Login & Role */}
          <div className="sm:col-span-2 mt-2 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/20 space-y-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.create_login}
                onChange={(e) => setForm({ ...form, create_login: e.target.checked })}
                className="h-4 w-4 accent-emerald-600"
              />
              <span>স্টোর লগইন অ্যাকাউন্ট তৈরি করুন (ইমেইল ও পাসওয়ার্ড দিয়ে)</span>
            </label>
            {form.create_login && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>স্টোর রোল (Role) *</Label>
                  <Select value={form.access_role} onValueChange={(v) => setForm({ ...form, access_role: v as typeof form.access_role })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Manager (ম্যানেজার)</SelectItem>
                      <SelectItem value="pharmacist">Pharmacist (ফার্মাসিস্ট)</SelectItem>
                      <SelectItem value="cashier">Cashier (ক্যাশিয়ার / POS)</SelectItem>
                      <SelectItem value="staff">Staff (স্টাফ)</SelectItem>
                      <SelectItem value="auditor">Auditor (অডিটর)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>লগইন পাসওয়ার্ড (Password) *</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="কমপক্ষে ৬ অক্ষর"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('ops.staff.list.saveEmployee')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
