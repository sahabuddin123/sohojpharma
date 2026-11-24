import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/patients")({
  head: () => ({
    meta: [
      { title: "Patients — SohojPharma" },
      { name: "description", content: "Patient profiles with medical history, allergies and prescription links." },
    ],
  }),
  component: PatientsPage,
  errorComponent: ({ error, reset }) => (
    <AppShell variant="store" title="Patients">
      <div className="rounded-2xl border bg-card p-6 text-sm">
        <p className="font-semibold text-rose-600">Failed to load patients</p>
        <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : "Something went wrong"}</p>
        <Button onClick={reset} variant="outline" size="sm" className="mt-3">Retry</Button>
      </div>
    </AppShell>
  ),
});

interface Patient {
  id: string;
  patient_code: string | null;
  full_name: string;
  phone: string | null;
  dob: string | null;
  gender: string | null;
  blood_group: string | null;
  allergies: string | null;
  medical_history: string | null;
  address: string | null;
}

const empty: Omit<Patient, "id"> = {
  patient_code: "",
  full_name: "",
  phone: "",
  dob: "",
  gender: "",
  blood_group: "",
  allergies: "",
  medical_history: "",
  address: "",
};

function ageFromDob(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  return Math.floor(ms / (365.25 * 24 * 3600 * 1000));
}

function PatientsPage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [form, setForm] = useState<Omit<Patient, "id">>(empty);

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id,patient_code,full_name,phone,dob,gender,blood_group,allergies,medical_history,address")
        .eq("tenant_id", currentTenantId!)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Patient[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error("No store selected");
      if (!form.full_name.trim()) throw new Error(t("cust.patient.nameReq"));
      const payload = {
        tenant_id: currentTenantId,
        patient_code: form.patient_code?.trim() || null,
        full_name: form.full_name.trim(),
        phone: form.phone?.trim() || null,
        dob: form.dob || null,
        gender: form.gender || null,
        blood_group: form.blood_group?.trim() || null,
        allergies: form.allergies?.trim() || null,
        medical_history: form.medical_history?.trim() || null,
        address: form.address?.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("patients").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("patients").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? t("cust.patient.updated") : t("cust.patient.added"));
      setOpen(false); setEditing(null); setForm(empty);
      qc.invalidateQueries({ queryKey: ["patients", currentTenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("patients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("toast.patientRemoved"));
      qc.invalidateQueries({ queryKey: ["patients", currentTenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = patients.filter((p) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [p.full_name, p.patient_code, p.phone].some((x) => x?.toLowerCase().includes(s));
  });

  function openCreate() {
    setEditing(null); setForm(empty); setOpen(true);
  }
  function openEdit(p: Patient) {
    setEditing(p);
    setForm({
      patient_code: p.patient_code ?? "",
      full_name: p.full_name,
      phone: p.phone ?? "",
      dob: p.dob ?? "",
      gender: p.gender ?? "",
      blood_group: p.blood_group ?? "",
      allergies: p.allergies ?? "",
      medical_history: p.medical_history ?? "",
      address: p.address ?? "",
    });
    setOpen(true);
  }

  return (
    <AppShell variant="store" title={t("cust.patient.title")}>
      <PageHeader
        title={t("cust.patient.title")}
        description={t("cust.patient.desc")}
        actions={<Button onClick={openCreate} className="gap-1"><Plus className="h-4 w-4" /> {t("cust.patient.add")}</Button>}
      />

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("cust.patient.searchPh")} className="pl-8" />
            </div>
            <Badge variant="secondary">{t("cust.patient.count", { count: filtered.length })}</Badge>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cust.patient.colName")}</TableHead>
                  <TableHead>{t("cust.patient.colCode")}</TableHead>
                  <TableHead>{t("cust.patient.phone")}</TableHead>
                  <TableHead>{t("cust.patient.colAgeGender")}</TableHead>
                  <TableHead>{t("cust.patient.colAllergies")}</TableHead>
                  <TableHead className="text-right">{t("cust.patient.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-2 h-6 w-6 opacity-40" />
                    {q ? t("cust.patient.emptySearch") : t("cust.patient.emptyAll")}
                  </TableCell></TableRow>
                )}
                {filtered.map((p) => {
                  const age = ageFromDob(p.dob);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.patient_code ?? "—"}</TableCell>
                      <TableCell className="text-sm">{p.phone ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {age != null ? `${age}y` : "—"}{p.gender ? ` · ${p.gender}` : ""}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={p.allergies ?? ""}>
                        {p.allergies || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => { if (confirm(t("cust.patient.deleteConfirm", { name: p.full_name }))) remove.mutate(p.id); }} className="text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? t("cust.patient.editTitle") : t("cust.patient.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <div>
              <Label>{t("cust.patient.fullName")}</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>{t("cust.patient.patientCode")}</Label>
              <Input value={form.patient_code ?? ""} onChange={(e) => setForm({ ...form, patient_code: e.target.value })} />
            </div>
            <div>
              <Label>{t("cust.patient.phone")}</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>{t("cust.patient.dob")}</Label>
              <Input type="date" value={form.dob ?? ""} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </div>
            <div>
              <Label>{t("cust.patient.gender")}</Label>
              <Select value={form.gender || "unset"} onValueChange={(v) => setForm({ ...form, gender: v === "unset" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder={t("cust.patient.genderUnspecified")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">{t("cust.patient.genderUnspecified")}</SelectItem>
                  <SelectItem value="male">{t("cust.patient.genderMale")}</SelectItem>
                  <SelectItem value="female">{t("cust.patient.genderFemale")}</SelectItem>
                  <SelectItem value="other">{t("cust.patient.genderOther")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("cust.patient.bloodGroup")}</Label>
              <Input value={form.blood_group ?? ""} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} placeholder={t("cust.patient.bloodGroupPh")} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("cust.patient.allergies")}</Label>
              <Input value={form.allergies ?? ""} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder={t("cust.patient.allergiesPh")} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("cust.patient.medHistory")}</Label>
              <Input value={form.medical_history ?? ""} onChange={(e) => setForm({ ...form, medical_history: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("cust.patient.address")}</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t("cust.patient.saveChanges") : t("cust.patient.addTitle")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
