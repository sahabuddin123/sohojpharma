import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { toast } from "sonner";
import { Activity, Pill, Repeat, AlertTriangle, ShieldAlert, BookOpen } from "lucide-react";
import {
  adminListClasses, adminSaveClass, adminDeleteClass,
  adminListAlternatives, adminDeleteAlternative,
  adminListInteractions, adminDeleteInteraction,
} from "@/lib/api/clinical.functions";

export const Route = createFileRoute("/admin/clinical")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Clinical Intelligence — SohojPharma Admin" }] }),
  component: ClinicalAdminPage,
});

function ClinicalAdminPage() {
  const { t } = useTranslation();
  return (
    <AppShell variant="admin">
      <PageHeader
        title={t("clinical.title", "Clinical Intelligence")}
        description={t("clinical.desc", "Therapeutic classes, alternatives, interactions, dosage, contraindications.")}
        actions={<Activity className="h-5 w-5 text-primary" />}
      />
      <Tabs defaultValue="classes" className="mt-4">
        <TabsList>
          <TabsTrigger value="classes"><BookOpen className="mr-1 h-4 w-4" />{t("clinical.tabs.classes", "Therapeutic Classes")}</TabsTrigger>
          <TabsTrigger value="alternatives"><Repeat className="mr-1 h-4 w-4" />{t("clinical.tabs.alts", "Alternatives")}</TabsTrigger>
          <TabsTrigger value="interactions"><AlertTriangle className="mr-1 h-4 w-4" />{t("clinical.tabs.ix", "Drug Interactions")}</TabsTrigger>
          <TabsTrigger value="reports"><ShieldAlert className="mr-1 h-4 w-4" />{t("clinical.tabs.reports", "Reports")}</TabsTrigger>
        </TabsList>
        <TabsContent value="classes"><ClassesTab /></TabsContent>
        <TabsContent value="alternatives"><AlternativesTab /></TabsContent>
        <TabsContent value="interactions"><InteractionsTab /></TabsContent>
        <TabsContent value="reports"><ReportsTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ClassesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(adminListClasses);
  const save = useServerFn(adminSaveClass);
  const del = useServerFn(adminDeleteClass);
  const q = useQuery({ queryKey: ["clinical-classes"], queryFn: () => list() });
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  const m = useMutation({
    mutationFn: async () => save({ data: { name, code: code || null, description: null } }),
    onSuccess: () => { setName(""); setCode(""); toast.success(t("clinical.classSaved", "Class saved")); qc.invalidateQueries({ queryKey: ["clinical-classes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success(t("clinical.deleted", "Deleted")); qc.invalidateQueries({ queryKey: ["clinical-classes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card><CardHeader><CardTitle>{t("clinical.tabs.classes", "Therapeutic Classes")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input placeholder={t("clinical.classNamePh", "Class name")} value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder={t("clinical.classCodePh", "Code")} value={code} onChange={(e) => setCode(e.target.value)} className="w-32" />
          <Button onClick={() => name && m.mutate()} disabled={m.isPending}>{t("common.add", "Add")}</Button>
        </div>
        <Table><TableHeader><TableRow><TableHead>{t("clinical.col.name", "Name")}</TableHead><TableHead>{t("clinical.col.code", "Code")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((c) => (<TableRow key={c.id}><TableCell>{c.name}</TableCell><TableCell><Badge variant="outline">{c.code ?? "—"}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => d.mutate(c.id)}>{t("common.delete", "Delete")}</Button></TableCell></TableRow>))}
          </TableBody></Table>
      </CardContent>
    </Card>
  );
}

function AlternativesTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(adminListAlternatives);
  const del = useServerFn(adminDeleteAlternative);
  const q = useQuery({ queryKey: ["clinical-alts"], queryFn: () => list({ data: {} }) });
  const d = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success(t("clinical.deleted", "Deleted")); qc.invalidateQueries({ queryKey: ["clinical-alts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card><CardHeader><CardTitle>{t("clinical.tabs.alts", "Alternatives")}</CardTitle></CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>{t("clinical.col.source", "Source")}</TableHead><TableHead>{t("clinical.col.alt", "Alternative")}</TableHead><TableHead>{t("clinical.col.match", "Match")}</TableHead><TableHead>{t("clinical.col.status", "Status")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((a) => (
              <TableRow key={a.id}>
                <TableCell>{(a.source as { brand_name?: string } | null)?.brand_name ?? "—"}</TableCell>
                <TableCell>{(a.alternative as { brand_name?: string } | null)?.brand_name ?? "—"}</TableCell>
                <TableCell className="space-x-1">
                  {a.generic_match && <Badge variant="outline">G</Badge>}
                  {a.strength_match && <Badge variant="outline">S</Badge>}
                  {a.therapeutic_match && <Badge variant="outline">T</Badge>}
                </TableCell>
                <TableCell>{a.approved ? <Badge>{t("common.approved", "Approved")}</Badge> : <Badge variant="secondary">{t("common.pending", "Pending")}</Badge>}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => d.mutate(a.id)}>{t("common.delete", "Delete")}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
      </CardContent>
    </Card>
  );
}

function InteractionsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(adminListInteractions);
  const del = useServerFn(adminDeleteInteraction);
  const q = useQuery({ queryKey: ["clinical-ix"], queryFn: () => list() });
  const d = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success(t("clinical.deleted", "Deleted")); qc.invalidateQueries({ queryKey: ["clinical-ix"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const sevColor = (s: string) => s === "major" ? "destructive" : s === "moderate" ? "default" : "secondary";
  return (
    <Card><CardHeader><CardTitle>{t("clinical.tabs.ix", "Drug Interactions")}</CardTitle></CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>{t("clinical.col.medA", "Medicine A")}</TableHead><TableHead>{t("clinical.col.medB", "Medicine B")}</TableHead><TableHead>{t("clinical.col.sev", "Severity")}</TableHead><TableHead>{t("clinical.col.effect", "Clinical effect")}</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((i) => (
              <TableRow key={i.id}>
                <TableCell>{(i.a as { brand_name?: string } | null)?.brand_name ?? "—"}</TableCell>
                <TableCell>{(i.b as { brand_name?: string } | null)?.brand_name ?? "—"}</TableCell>
                <TableCell><Badge variant={sevColor(i.severity)}>{t(`clinical.sev.${i.severity}`, i.severity)}</Badge></TableCell>
                <TableCell className="max-w-md truncate" title={i.clinical_effect ?? ""}>{i.clinical_effect ?? "—"}</TableCell>
                <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => d.mutate(i.id)}>{t("common.delete", "Delete")}</Button></TableCell>
              </TableRow>
            ))}
          </TableBody></Table>
      </CardContent>
    </Card>
  );
}

function ReportsTab() {
  const { t } = useTranslation();
  const listClasses = useServerFn(adminListClasses);
  const listIx = useServerFn(adminListInteractions);
  const classes = useQuery({ queryKey: ["clinical-classes"], queryFn: () => listClasses() });
  const ix = useQuery({ queryKey: ["clinical-ix"], queryFn: () => listIx() });
  return (
    <div className="grid gap-4 md:grid-cols-3 mt-2">
      <Card><CardHeader><CardTitle className="text-sm">{t("clinical.rpt.classes", "Therapeutic Classes")}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{classes.data?.length ?? "—"}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm">{t("clinical.rpt.ix", "Drug Interactions")}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{ix.data?.length ?? "—"}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-sm flex items-center gap-2"><Pill className="h-4 w-4" />{t("clinical.rpt.note", "Note")}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{t("clinical.rpt.body", "Dosage and contraindications are managed per medicine in the Medicine Details page.")}</CardContent></Card>
    </div>
  );
}
