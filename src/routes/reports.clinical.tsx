import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { Activity, AlertCircle, CheckCircle2, Clock, FileText, Pill, ShieldCheck } from "lucide-react";
import { clinicalDashboardKpis, listRefills, updateRefillStatus } from "@/lib/api/fulfillment.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/reports/clinical")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Clinical Dashboard — SohojPharma" },
      { name: "description", content: "Clinical KPIs: OCR accuracy, fulfillment rate, refill follow-ups." },
    ],
  }),
  component: ClinicalDashboard,
});

function Kpi({ icon: Icon, label, value, sub, tone = "default" }: { icon: typeof Activity; label: string; value: string | number; sub?: string; tone?: "default" | "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ClinicalDashboard() {
  const { currentTenantId } = useAuth();
  const [days, setDays] = useState(30);
  const [refillFilter, setRefillFilter] = useState<"all" | "pending" | "due" | "completed">("all");

  const kpisFn = useServerFn(clinicalDashboardKpis);
  const refillsFn = useServerFn(listRefills);
  const updFn = useServerFn(updateRefillStatus);

  const kpis = useQuery({
    queryKey: ["clinical-kpis", currentTenantId, days],
    queryFn: () => kpisFn({ data: { tenantId: currentTenantId!, days } }),
    enabled: !!currentTenantId,
  });

  const refills = useQuery({
    queryKey: ["clinical-refills", currentTenantId, refillFilter],
    queryFn: () => refillsFn({ data: { tenantId: currentTenantId!, status: refillFilter } }),
    enabled: !!currentTenantId,
  });

  async function mark(id: string, status: "completed" | "notified" | "skipped") {
    if (!currentTenantId) return;
    try {
      await updFn({ data: { tenantId: currentTenantId, id, status } });
      toast.success(`Marked ${status}`);
      refills.refetch();
      kpis.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const k = kpis.data;

  return (
    <AppShell variant="store" title="Clinical Dashboard">
      <PageHeader
        title="Clinical Dashboard"
        description="Prescription accuracy, fulfillment and refill performance."
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={ShieldCheck} label="OCR success rate" value={`${k?.ocr.success_rate ?? 0}%`} sub={`${k?.ocr.success ?? 0}/${k?.ocr.total ?? 0} jobs`} tone={(k?.ocr.success_rate ?? 0) >= 90 ? "good" : "warn"} />
        <Kpi icon={FileText} label="Manual correction" value={`${k?.ocr.manual_correction_rate ?? 0}%`} sub={`Avg conf ${k?.ocr.avg_confidence ?? 0}%`} tone={(k?.ocr.manual_correction_rate ?? 0) > 20 ? "warn" : "default"} />
        <Kpi icon={CheckCircle2} label="Fulfillment rate" value={`${k?.prescriptions.fulfillment_rate ?? 0}%`} sub={`${k?.prescriptions.fulfilled ?? 0}/${k?.prescriptions.total ?? 0}`} tone={(k?.prescriptions.fulfillment_rate ?? 0) >= 80 ? "good" : "warn"} />
        <Kpi icon={AlertCircle} label="Partially fulfilled" value={`${k?.prescriptions.partial_rate ?? 0}%`} sub={`${k?.prescriptions.partial ?? 0} prescriptions`} tone={(k?.prescriptions.partial_rate ?? 0) > 15 ? "warn" : "default"} />
        <Kpi icon={Clock} label="Refills due" value={k?.refills.due ?? 0} sub="Today or overdue" tone={(k?.refills.due ?? 0) > 0 ? "bad" : "good"} />
        <Kpi icon={Pill} label="Refills completed" value={k?.refills.completed ?? 0} sub={`${k?.refills.total ?? 0} total in window`} tone="default" />
        <Kpi icon={Activity} label="Prescriptions" value={k?.prescriptions.total ?? 0} sub={`Last ${days} days`} />
        <Kpi icon={AlertCircle} label="Cancelled" value={k?.prescriptions.cancelled ?? 0} tone={(k?.prescriptions.cancelled ?? 0) > 0 ? "warn" : "default"} />
      </div>

      <Card className="mt-6 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2"><Pill className="h-4 w-4" /> Refill follow-ups</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={refillFilter} onValueChange={(v) => setRefillFilter(v as typeof refillFilter)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" asChild>
              <Link to="/reports/clinical-safety">Safety report</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(refills.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No refills in this view.</TableCell></TableRow>
                )}
                {(refills.data ?? []).map((r) => {
                  const overdue = r.status !== "completed" && r.expected_date <= today;
                  const patient = (r.customers as { name?: string } | null)?.name
                    ?? (r.prescriptions as { patient_name?: string } | null)?.patient_name
                    ?? "—";
                  const doctor = (r.prescriptions as { doctor_name?: string } | null)?.doctor_name ?? "—";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{patient}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doctor}</TableCell>
                      <TableCell className="tabular-nums">{r.expected_date}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "completed" ? "outline" : overdue ? "destructive" : "secondary"} className="capitalize">
                          {overdue && r.status !== "completed" ? "due" : r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status !== "completed" && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => mark(r.id, "notified")}>Notified</Button>
                            <Button size="sm" variant="ghost" onClick={() => mark(r.id, "skipped")}>Skip</Button>
                            <Button size="sm" onClick={() => mark(r.id, "completed")}>Complete</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
