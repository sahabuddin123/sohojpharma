import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Loader2, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/doctors")({
  head: () => ({
    meta: [
      { title: "Doctors — SohojPharma" },
      { name: "description", content: "Manage prescribing doctors, specialities and BMDC numbers." },
    ],
  }),
  component: DoctorsPage,
  errorComponent: ({ error, reset }) => {
    const { t } = useTranslation();
    return (
      <AppShell variant="store" title={t("cust.doctor.title")}>
        <div className="rounded-2xl border bg-card p-6 text-sm">
          <p className="font-semibold text-rose-600">{t("cust.doctor.failedLoad")}</p>
          <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : t("common.error")}</p>
          <Button onClick={reset} variant="outline" size="sm" className="mt-3">{t("common.retry")}</Button>
        </div>
      </AppShell>
    );
  },
});

interface Doctor {
  id: string;
  full_name: string;
  bmdc_no: string | null;
  speciality: string | null;
  qualification: string | null;
  phone: string | null;
  email: string | null;
  chamber_address: string | null;
  is_active: boolean;
}

const emptyForm: Omit<Doctor, "id" | "is_active"> & { is_active: boolean } = {
  full_name: "", bmdc_no: "", speciality: "", qualification: "",
  phone: "", email: "", chamber_address: "", is_active: true,
};

function DoctorsPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: doctors = [], isLoading } = useQuery({
    queryKey: ["doctors", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctors")
        .select("id,full_name,bmdc_no,speciality,qualification,phone,email,chamber_address,is_active")
        .eq("tenant_id", currentTenantId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Doctor[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error("No store selected");
      if (!form.full_name.trim()) throw new Error(t("cust.doctor.nameReq"));
      const payload = {
        tenant_id: currentTenantId,
        full_name: form.full_name.trim(),
        bmdc_no: form.bmdc_no?.trim() || null,
        speciality: form.speciality?.trim() || null,
        qualification: form.qualification?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        chamber_address: form.chamber_address?.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        const { error } = await supabase.from("doctors").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("doctors").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? t("cust.doctor.updated") : t("cust.doctor.added"));
      setOpen(false); setEditing(null); setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["doctors", currentTenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("doctors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("toast.doctorRemoved"));
      qc.invalidateQueries({ queryKey: ["doctors", currentTenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = doctors.filter((d) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [d.full_name, d.bmdc_no, d.speciality, d.phone].some((x) => x?.toLowerCase().includes(s));
  });

  function openCreate() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function openEdit(d: Doctor) {
    setEditing(d);
    setForm({ full_name: d.full_name, bmdc_no: d.bmdc_no ?? "", speciality: d.speciality ?? "",
      qualification: d.qualification ?? "", phone: d.phone ?? "", email: d.email ?? "",
      chamber_address: d.chamber_address ?? "", is_active: d.is_active });
    setOpen(true);
  }

  return (
    <AppShell variant="store" title={t("cust.doctor.title")}>
      <PageHeader
        title={t("cust.doctor.title")}
        description={t("cust.doctor.desc")}
        actions={<Button onClick={openCreate} className="gap-1"><Plus className="h-4 w-4" /> {t("cust.doctor.add")}</Button>}
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cust.doctor.searchPh")} className="pl-8" />
            </div>
            <Badge variant="secondary">{t("cust.doctor.count", { count: filtered.length })}</Badge>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.actions") === "Actions" ? "Name" : t("cust.doctor.fullName").replace(" *","")}</TableHead>
                  <TableHead>{t("cust.doctor.colBmdc")}</TableHead>
                  <TableHead>{t("cust.doctor.colSpeciality")}</TableHead>
                  <TableHead>{t("sections.customers.phone")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    <UserRound className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    {q ? t("cust.doctor.emptySearch") : t("cust.doctor.emptyAll")}
                  </TableCell></TableRow>
                )}
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-medium">{d.full_name}</div>
                      <div className="text-xs text-muted-foreground">{d.qualification ?? ""}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.bmdc_no ?? "—"}</TableCell>
                    <TableCell className="text-sm">{d.speciality ?? "—"}</TableCell>
                    <TableCell className="text-sm">{d.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={d.is_active ? "default" : "outline"}>
                        {d.is_active ? t("cust.doctor.active") : t("cust.doctor.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm(t("cust.doctor.deleteConfirm", { name: d.full_name }))) remove.mutate(d.id); }} className="text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("cust.doctor.editTitle") : t("cust.doctor.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t("cust.doctor.fullName")}</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("cust.doctor.bmdcNo")}</Label>
              <Input value={form.bmdc_no ?? ""} onChange={(e) => setForm({ ...form, bmdc_no: e.target.value })} />
            </div>
            <div>
              <Label>{t("cust.doctor.colSpeciality")}</Label>
              <Input value={form.speciality ?? ""} onChange={(e) => setForm({ ...form, speciality: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("cust.doctor.qualification")}</Label>
              <Input value={form.qualification ?? ""} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder={t("cust.doctor.qualPh")} />
            </div>
            <div>
              <Label>{t("sections.customers.phone")}</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>{t("sections.customers.email")}</Label>
              <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("cust.doctor.chamberAddress")}</Label>
              <Input value={form.chamber_address ?? ""} onChange={(e) => setForm({ ...form, chamber_address: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              {t("cust.doctor.isActive")}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t("cust.doctor.saveChanges") : t("cust.doctor.addTitle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
