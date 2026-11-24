import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RouteErrorPanel } from "@/components/route-error";
import { Pill, AlertTriangle, Repeat, BookOpen, ShieldAlert, FileWarning } from "lucide-react";
import {
  getMedicineDetails, getTherapeuticClass, getMedicineAlternatives,
  getDrugInteractions, getDosageGuide, getContraindications,
} from "@/lib/api/clinical.functions";

export const Route = createFileRoute("/admin/global-medicines/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Medicine Details — SohojPharma" }] }),
  component: MedicineDetailsPage,
});

function MedicineDetailsPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const fnDetails = useServerFn(getMedicineDetails);
  const fnClass = useServerFn(getTherapeuticClass);
  const fnAlts = useServerFn(getMedicineAlternatives);
  const fnIx = useServerFn(getDrugInteractions);
  const fnDose = useServerFn(getDosageGuide);
  const fnContra = useServerFn(getContraindications);

  const med = useQuery({ queryKey: ["gmed", id], queryFn: () => fnDetails({ data: { medicine_id: id } }) });
  const cls = useQuery({ queryKey: ["gmed-cls", id], queryFn: () => fnClass({ data: { medicine_id: id } }) });
  const alts = useQuery({ queryKey: ["gmed-alts", id], queryFn: () => fnAlts({ data: { medicine_id: id } }) });
  const ix = useQuery({ queryKey: ["gmed-ix", id], queryFn: () => fnIx({ data: { medicine_id: id } }) });
  const dose = useQuery({ queryKey: ["gmed-dose", id], queryFn: () => fnDose({ data: { medicine_id: id } }) });
  const contra = useQuery({ queryKey: ["gmed-contra", id], queryFn: () => fnContra({ data: { medicine_id: id } }) });

  const m = med.data;
  const sevColor = (s: string) => s === "major" ? "destructive" : s === "moderate" ? "default" : "secondary";

  return (
    <AppShell variant="admin">
      <PageHeader
        title={m?.brand_name ?? t("clinical.loading", "Loading…")}
        description={[m?.strength, m?.dosage_form].filter(Boolean).join(" • ") || "—"}
        actions={<Pill className="h-5 w-5 text-primary" />}
      />
      <div className="grid gap-4 md:grid-cols-2 mt-4">
        <Card><CardHeader><CardTitle className="text-base">{t("clinical.details.general", "General Information")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("clinical.details.generic", "Generic")}>{(m?.generic as { name?: string } | null)?.name ?? "—"}</Row>
            <Row label={t("clinical.details.mfr", "Manufacturer")}>{(m?.manufacturer as { name?: string } | null)?.name ?? "—"}</Row>
            <Row label={t("clinical.details.route", "Route")}>{m?.route ?? "—"}</Row>
            <Row label={t("clinical.details.atc", "ATC code")}>{m?.atc_code ?? "—"}</Row>
            <Row label={t("clinical.details.rx", "Prescription required")}>{m?.prescription_required ? <Badge variant="destructive">{t("common.yes", "Yes")}</Badge> : <Badge>{t("common.no", "No")}</Badge>}</Row>
            <Row label={t("clinical.details.otc", "OTC allowed")}>{m?.otc_allowed ? <Badge>{t("common.yes", "Yes")}</Badge> : <Badge variant="secondary">{t("common.no", "No")}</Badge>}</Row>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileWarning className="h-4 w-4" />{t("clinical.details.safety", "Safety Flags")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("clinical.details.pregnancy", "Pregnancy category")}>{m?.pregnancy_category ?? "—"}</Row>
            <Row label={t("clinical.details.lactation", "Lactation")}>{m?.lactation_warning ?? "—"}</Row>
            <Row label={t("clinical.details.pediatric", "Pediatric")}>{m?.pediatric_warning ?? "—"}</Row>
            <Row label={t("clinical.details.geriatric", "Geriatric")}>{m?.geriatric_warning ?? "—"}</Row>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" />{t("clinical.details.classes", "Therapeutic Classes")}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(cls.data ?? []).length === 0 ? <span className="text-sm text-muted-foreground">—</span> :
              (cls.data ?? []).map((c) => <Badge key={c!.id} variant="outline">{c!.name}</Badge>)}
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Repeat className="h-4 w-4" />{t("clinical.details.alternatives", "Alternatives")} ({alts.data?.length ?? 0})</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>{t("clinical.col.alt", "Alternative")}</TableHead><TableHead>{t("clinical.col.match", "Match")}</TableHead></TableRow></TableHeader>
              <TableBody>{(alts.data ?? []).map((a) => {
                const alt = a.alternative as { id: string; brand_name?: string; strength?: string | null; dosage_form?: string | null } | null;
                return (<TableRow key={a.id}>
                  <TableCell><Link to="/admin/global-medicines/$id" params={{ id: alt?.id ?? "" }} className="underline">{alt?.brand_name ?? "—"}</Link><div className="text-xs text-muted-foreground">{[alt?.strength, alt?.dosage_form].filter(Boolean).join(" • ")}</div></TableCell>
                  <TableCell className="space-x-1">{a.generic_match && <Badge variant="outline">G</Badge>}{a.strength_match && <Badge variant="outline">S</Badge>}{a.therapeutic_match && <Badge variant="outline">T</Badge>}</TableCell>
                </TableRow>);
              })}</TableBody></Table>
          </CardContent>
        </Card>

        <Card className="md:col-span-2"><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{t("clinical.details.interactions", "Drug Interactions")} ({ix.data?.length ?? 0})</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>{t("clinical.col.with", "With")}</TableHead><TableHead>{t("clinical.col.sev", "Severity")}</TableHead><TableHead>{t("clinical.col.effect", "Clinical effect")}</TableHead><TableHead>{t("clinical.col.rec", "Recommendation")}</TableHead></TableRow></TableHeader>
              <TableBody>{(ix.data ?? []).map((i) => {
                const other = i.medicine_a === id ? (i.b as { brand_name?: string } | null)?.brand_name : (i.a as { brand_name?: string } | null)?.brand_name;
                return (<TableRow key={i.id}>
                  <TableCell>{other ?? "—"}</TableCell>
                  <TableCell><Badge variant={sevColor(i.severity)}>{t(`clinical.sev.${i.severity}`, i.severity)}</Badge></TableCell>
                  <TableCell className="max-w-sm">{i.clinical_effect ?? "—"}</TableCell>
                  <TableCell className="max-w-sm">{i.recommendation ?? "—"}</TableCell>
                </TableRow>);
              })}</TableBody></Table>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base">{t("clinical.details.dosage", "Dosage Guide")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("clinical.details.adult", "Adult dose")}>{dose.data?.adult_dose ?? "—"}</Row>
            <Row label={t("clinical.details.child", "Child dose")}>{dose.data?.child_dose ?? "—"}</Row>
            <Row label={t("clinical.details.maxDaily", "Max daily")}>{dose.data?.max_daily_dose ?? "—"}</Row>
            <Row label={t("clinical.details.renal", "Renal adjustment")}>{dose.data?.renal_adjustment ?? "—"}</Row>
            <Row label={t("clinical.details.hepatic", "Hepatic adjustment")}>{dose.data?.hepatic_adjustment ?? "—"}</Row>
            <Row label={t("clinical.details.admin", "Administration notes")}>{dose.data?.administration_notes ?? "—"}</Row>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" />{t("clinical.details.contra", "Contraindications")} ({contra.data?.length ?? 0})</CardTitle></CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>{t("clinical.col.cond", "Condition")}</TableHead><TableHead>{t("clinical.col.sev", "Severity")}</TableHead><TableHead>{t("clinical.col.notes", "Notes")}</TableHead></TableRow></TableHeader>
              <TableBody>{(contra.data ?? []).map((c) => (<TableRow key={c.id}>
                <TableCell>{c.condition}</TableCell>
                <TableCell><Badge variant={sevColor(c.severity)}>{t(`clinical.sev.${c.severity}`, c.severity)}</Badge></TableCell>
                <TableCell>{c.notes ?? "—"}</TableCell>
              </TableRow>))}</TableBody></Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b py-1.5"><span className="text-muted-foreground">{label}</span><span className="text-right">{children}</span></div>;
}
