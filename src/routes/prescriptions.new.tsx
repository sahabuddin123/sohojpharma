import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createPrescription } from "@/lib/api/prescriptions.functions";

export const Route = createFileRoute("/prescriptions/new")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "New Prescription — SohojPharma" },
      { name: "description", content: "Create a prescription manually with patient, doctor, diagnosis and medicine lines." },
    ],
  }),
  component: NewPrescription,
});

type Line = {
  raw_text: string;
  brand_name: string;
  strength: string;
  dosage: string;
  frequency: string;
  duration_days: string;
  quantity: string;
};

const emptyLine = (): Line => ({
  raw_text: "", brand_name: "", strength: "", dosage: "",
  frequency: "", duration_days: "", quantity: "1",
});

function NewPrescription() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const create = useServerFn(createPrescription);

  const [customerId, setCustomerId] = useState<string>("");
  const [patientName, setPatientName] = useState("");
  const [doctorId, setDoctorId] = useState<string>("");
  const [doctorName, setDoctorName] = useState("");
  const [rxDate, setRxDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [diagnosis, setDiagnosis] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const customers = useQuery({
    queryKey: ["customers-lite", currentTenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id,name,phone")
        .eq("tenant_id", currentTenantId!)
        .order("name").limit(500);
      return data ?? [];
    },
    enabled: !!currentTenantId,
  });

  const doctors = useQuery({
    queryKey: ["doctors-lite", currentTenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("doctors")
        .select("id,full_name,speciality")
        .eq("tenant_id", currentTenantId!)
        .eq("is_active", true)
        .order("full_name").limit(500);
      return data ?? [];
    },
    enabled: !!currentTenantId,
  });

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines((prev) => [...prev, emptyLine()]); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function save() {
    if (!currentTenantId) return;
    if (!branchId) { toast.error("Please select a branch first."); return; }
    const validLines = lines.filter((l) => l.brand_name.trim() || l.raw_text.trim());
    if (!validLines.length) {
      toast.error(t("pages.prescriptionNew.errNoLines", "Add at least one medicine"));
      return;
    }
    if (!patientName && !customerId) {
      toast.error(t("pages.prescriptionNew.errNoPatient", "Patient name or customer is required"));
      return;
    }
    try {
      setSaving(true);
      const finalDoctor = doctorName ||
        doctors.data?.find((d) => d.id === doctorId)?.full_name || null;
      const finalPatient = patientName ||
        customers.data?.find((c) => c.id === customerId)?.name || null;

      const { id } = await create({
        data: {
          tenantId: currentTenantId,
          branch_id: branchId,
          image_path: null,
          file_kind: "image",
          customer_id: customerId || null,
          doctor_id: doctorId || null,
          patient_name: finalPatient,
          doctor_name: finalDoctor,
          prescription_date: rxDate || null,
          ocr_text: diagnosis ? `Diagnosis: ${diagnosis}` : null,
          items: validLines.map((l) => ({
            raw_text: l.raw_text || l.brand_name,
            brand_name: l.brand_name || null,
            generic_name: null,
            strength: l.strength || null,
            dosage: l.dosage || null,
            frequency: l.frequency || null,
            duration_days: l.duration_days ? Number(l.duration_days) : null,
            quantity: l.quantity ? Number(l.quantity) : 1,
            interpreted_notes: null,
            matched_product_id: null,
            confidence: 100,
            status: "manual" as const,
          })),
        },
      });
      toast.success(t("pages.prescriptionNew.saved", "Prescription created"));
      navigate({ to: "/prescriptions/$id", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell variant="store" title={t("pages.prescriptionNew.title", "New Prescription")}>
      <PageHeader
        title={t("pages.prescriptionNew.title", "New Prescription")}
        description={t("pages.prescriptionNew.desc", "Manually record a prescription with patient, doctor and medicines.")}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/prescriptions"><ArrowLeft className="h-4 w-4 mr-1" /> {t("common.back", "Back")}</Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">{t("pages.prescriptionNew.headerInfo", "Prescription info")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("pages.prescriptionNew.customer", "Customer (optional)")}</Label>
              <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Walk-in" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Walk-in / new</SelectItem>
                  {customers.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.prescriptionNew.patientName", "Patient name")}</Label>
              <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} placeholder={customerId ? "(using customer name)" : "Patient full name"} />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.prescriptionNew.doctor", "Doctor")}</Label>
              <Select value={doctorId || "__none__"} onValueChange={(v) => setDoctorId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">External / type below</SelectItem>
                  {doctors.data?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name}{d.speciality ? ` · ${d.speciality}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("pages.prescriptionNew.doctorNameAlt", "Doctor name (if external)")}</Label>
              <Input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="Dr. ..." />
            </div>
            <div className="space-y-2">
              <Label>{t("pages.prescriptionNew.date", "Prescription date")}</Label>
              <Input type="date" value={rxDate} onChange={(e) => setRxDate(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{t("pages.prescriptionNew.diagnosis", "Diagnosis / notes")}</Label>
              <Textarea value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={2} placeholder="e.g. URTI, Hypertension" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("pages.prescriptionNew.medicines", "Medicines")}</CardTitle>
            <Button variant="outline" size="sm" onClick={addLine} className="gap-1">
              <Plus className="h-4 w-4" /> {t("pages.prescriptionNew.addLine", "Add line")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[2fr_1fr_1fr_1fr_0.7fr_0.7fr_auto]">
                <div>
                  <Label className="text-xs">{t("pages.prescriptionNew.medicine", "Medicine")}</Label>
                  <Input value={l.brand_name} onChange={(e) => updateLine(i, { brand_name: e.target.value })} placeholder="Brand or generic" />
                </div>
                <div>
                  <Label className="text-xs">{t("pages.prescriptionNew.strength", "Strength")}</Label>
                  <Input value={l.strength} onChange={(e) => updateLine(i, { strength: e.target.value })} placeholder="500mg" />
                </div>
                <div>
                  <Label className="text-xs">{t("pages.prescriptionNew.dose", "Dose")}</Label>
                  <Input value={l.dosage} onChange={(e) => updateLine(i, { dosage: e.target.value })} placeholder="1 tab" />
                </div>
                <div>
                  <Label className="text-xs">{t("pages.prescriptionNew.frequency", "Frequency")}</Label>
                  <Input value={l.frequency} onChange={(e) => updateLine(i, { frequency: e.target.value })} placeholder="1+0+1 / BD" />
                </div>
                <div>
                  <Label className="text-xs">{t("pages.prescriptionNew.duration", "Days")}</Label>
                  <Input type="number" min={0} value={l.duration_days} onChange={(e) => updateLine(i, { duration_days: e.target.value })} placeholder="7" />
                </div>
                <div>
                  <Label className="text-xs">{t("pages.prescriptionNew.qty", "Qty")}</Label>
                  <Input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/prescriptions">{t("common.cancel", "Cancel")}</Link>
          </Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? t("common.saving", "Saving…") : t("pages.prescriptionNew.save", "Save prescription")}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
