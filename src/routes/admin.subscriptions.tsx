import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, RefreshCw, MoreHorizontal, Download, FileText, FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListSubscriptions, adminListPlans, adminListTenantsLite, adminPlanAnalytics,
  adminAssignPlan, adminChangePlan, adminCancelScheduledChange, adminRenewSubscription,
  adminSetSubscriptionStatus, adminConvertTrial,
  getPlanPricingOptions, adminGetSubscriptionHistory, adminExpiryWidgets,
} from "@/lib/api/subscriptions.functions";

export const Route = createFileRoute("/admin/subscriptions")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Subscriptions — Super Admin" }] }),
  component: SubscriptionsPage,
});

const STATUSES = ["trial", "active", "past_due", "grace_period", "suspended", "cancelled", "expired"] as const;
const CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-Yearly" },
  { value: "yearly", label: "Yearly" },
  { value: "lifetime", label: "Lifetime" },
] as const;

type SubRow = {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  last_payment_at: string | null;
  expires_at: string | null;
  notes: string | null;
  scheduled_plan_id: string | null;
  scheduled_cycle: string | null;
  scheduled_change_at: string | null;
  created_at: string;
  updated_at: string;
  tenant: { id: string; name: string; email: string | null; status: string } | null;
  plan: { id: string; name: string; code: string; price_bdt: number; price_yearly_bdt: number | null } | null;
};

type TenantLite = { id: string; name: string; email: string | null; status: string };
type PlanLite = { id: string; name: string; code: string; price_bdt: number; is_active: boolean };

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "active") return "default";
  if (s === "trial") return "secondary";
  if (s === "past_due" || s === "suspended") return "destructive";
  return "outline";
}

function SubscriptionsPage() {
  const qc = useQueryClient();

  // server fns
  const listSubs = useServerFn(adminListSubscriptions);
  const listPlans = useServerFn(adminListPlans);
  const listTenants = useServerFn(adminListTenantsLite);
  const planAnalytics = useServerFn(adminPlanAnalytics);
  const expiryWidgetsFn = useServerFn(adminExpiryWidgets);
  const assignFn = useServerFn(adminAssignPlan);
  const changeFn = useServerFn(adminChangePlan);
  const renewFn = useServerFn(adminRenewSubscription);
  const statusFn = useServerFn(adminSetSubscriptionStatus);
  const convertFn = useServerFn(adminConvertTrial);
  const cancelScheduledFn = useServerFn(adminCancelScheduledChange);

  // filters
  const [status, setStatus] = useState<string>("");
  const [planId, setPlanId] = useState<string>("");
  const [cycle, setCycle] = useState<string>("");
  const [search, setSearch] = useState("");

  const subsKey = ["admin", "subscriptions", status, planId, cycle, search];
  const { data: subs = [], isLoading, refetch } = useQuery({
    queryKey: subsKey,
    queryFn: () => listSubs({ data: {
      status: (status || undefined) as (typeof STATUSES)[number] | undefined,
      plan_id: planId || undefined,
      billing_cycle: (cycle || undefined) as "monthly" | "quarterly" | "half_yearly" | "yearly" | "lifetime" | undefined,
      search: search || undefined,
      limit: 300,
    }}) as Promise<SubRow[]>,
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["admin", "plans-mgmt"],
    queryFn: () => listPlans() as Promise<PlanLite[]>,
  });

  const { data: tenants = [] } = useQuery({
    queryKey: ["admin", "tenants-lite"],
    queryFn: () => listTenants() as Promise<TenantLite[]>,
  });

  const { data: stats = [] } = useQuery({
    queryKey: ["admin", "plan-analytics"],
    queryFn: () => planAnalytics(),
    staleTime: 60_000,
  });

  const { data: widgets } = useQuery({
    queryKey: ["admin", "expiry-widgets"],
    queryFn: () => expiryWidgetsFn(),
    refetchInterval: 60_000,
  });

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel("admin-subs")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions" },
        () => qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_payments" },
        () => qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const kpis = useMemo(() => {
    let active = 0, trial = 0, past = 0, susp = 0, exp = 0, mrr = 0;
    for (const s of stats) {
      active += Number(s.active_count); trial += Number(s.trial_count);
      exp += Number(s.expired_count); susp += Number(s.suspended_count);
      mrr += Number(s.mrr);
    }
    for (const s of subs) if (s.status === "past_due") past++;
    const churn = active + exp > 0 ? (exp / (active + exp)) * 100 : 0;
    return { active, trial, past, susp, exp, mrr, churn };
  }, [stats, subs]);

  // dialogs
  const [assignOpen, setAssignOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState<SubRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState<SubRow | null>(null);

  const [assignForm, setAssignForm] = useState({
    tenant_id: "", plan_id: "", billing_cycle: "monthly" as string, trial_days: 14,
  });
  const [changeForm, setChangeForm] = useState({
    plan_id: "", billing_cycle: "monthly" as string,
    mode: "auto" as "auto" | "force_upgrade" | "force_downgrade",
    waive_fees: false,
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    qc.invalidateQueries({ queryKey: ["admin", "plan-analytics"] });
  };

  const assignMut = useMutation({
    mutationFn: () => assignFn({ data: {
      tenant_id: assignForm.tenant_id, plan_id: assignForm.plan_id,
      billing_cycle: assignForm.billing_cycle as "monthly" | "quarterly" | "half_yearly" | "yearly" | "lifetime",
      trial_days: assignForm.trial_days,
    } }),
    onSuccess: () => { toast.success("Plan assigned"); setAssignOpen(false); inv(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeMut = useMutation({
    mutationFn: () => changeFn({ data: {
      subscription_id: changeOpen!.id,
      plan_id: changeForm.plan_id,
      billing_cycle: changeForm.billing_cycle as "monthly" | "quarterly" | "half_yearly" | "yearly" | "lifetime",
      mode: changeForm.mode,
      waive_fees: changeForm.waive_fees,
    } }),
    onSuccess: (res) => {
      if (res.action === "downgrade_scheduled") {
        toast.success(`Downgrade scheduled for ${res.effective_at ? new Date(res.effective_at).toLocaleDateString() : "next renewal"}`);
      } else if (res.action === "upgrade") {
        toast.success(`Upgraded — credit ৳${res.credit ?? 0}, charge ৳${res.charge ?? 0}${res.waived ? " (waived)" : ""}`);
      } else {
        toast.success(`Downgraded immediately — credit ৳${res.credit ?? 0}, charge ৳${res.charge ?? 0}`);
      }
      setChangeOpen(null); inv();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelScheduledMut = useMutation({
    mutationFn: (id: string) => cancelScheduledFn({ data: { subscription_id: id } }),
    onSuccess: () => { toast.success("Scheduled change cancelled"); inv(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const renewMut = useMutation({
    mutationFn: (id: string) => renewFn({ data: { subscription_id: id } }),
    onSuccess: () => { toast.success("Renewed"); inv(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, st }: { id: string; st: (typeof STATUSES)[number] }) =>
      statusFn({ data: { subscription_id: id, status: st } }),
    onSuccess: () => { toast.success("Status updated"); inv(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertMut = useMutation({
    mutationFn: (id: string) => convertFn({ data: { subscription_id: id } }),
    onSuccess: () => { toast.success("Trial converted"); inv(); },
    onError: (e: Error) => toast.error(e.message),
  });

  // exports
  function rowsToCsv(rows: SubRow[]) {
    const header = ["Store","Email","Plan","Cycle","Status","Period Start","Period End","Trial Ends","Last Payment"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.tenant?.name ?? "",
        r.tenant?.email ?? "",
        r.plan?.name ?? "",
        r.billing_cycle,
        r.status,
        r.current_period_start ?? "",
        r.current_period_end ?? "",
        r.trial_ends_at ?? "",
        r.last_payment_at ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    }
    return lines.join("\n");
  }
  function download(filename: string, body: BlobPart, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
  function exportCsv() {
    download(`subscriptions-${Date.now()}.csv`, rowsToCsv(subs), "text/csv");
  }
  async function exportXlsx() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(subs.map((r) => ({
      Store: r.tenant?.name ?? "", Email: r.tenant?.email ?? "",
      Plan: r.plan?.name ?? "", Cycle: r.billing_cycle, Status: r.status,
      PeriodStart: r.current_period_start, PeriodEnd: r.current_period_end,
      TrialEnds: r.trial_ends_at, LastPayment: r.last_payment_at,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Subscriptions");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    download(`subscriptions-${Date.now()}.xlsx`, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  async function exportPdf() {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14); doc.text("Subscriptions", 14, 14);
    doc.setFontSize(9);
    let y = 24;
    doc.text(["Store", "Plan", "Cycle", "Status", "Period End"].join("    "), 14, y); y += 6;
    for (const r of subs.slice(0, 50)) {
      const line = [
        (r.tenant?.name ?? "").slice(0, 24),
        (r.plan?.name ?? "").slice(0, 18),
        r.billing_cycle, r.status,
        r.current_period_end ? format(new Date(r.current_period_end), "yyyy-MM-dd") : "",
      ].join("    ");
      doc.text(line, 14, y); y += 5;
      if (y > 190) { doc.addPage(); y = 16; }
    }
    doc.save(`subscriptions-${Date.now()}.pdf`);
  }

  function openAssign() {
    setAssignForm({ tenant_id: "", plan_id: "", billing_cycle: "monthly", trial_days: 14 });
    setAssignOpen(true);
  }
  function openChange(s: SubRow) {
    setChangeForm({ plan_id: s.plan_id, billing_cycle: s.billing_cycle, mode: "auto", waive_fees: false });
    setChangeOpen(s);
  }

  return (
    <AppShell variant="admin" title="Subscriptions">
      <PageHeader
        title="Subscriptions"
        description="Assign, upgrade, renew, suspend and track every store's subscription."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-1 h-4 w-4" /> Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline"><Download className="mr-1 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={exportCsv}><FileText className="mr-2 h-4 w-4" /> CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={exportXlsx}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={exportPdf}><FileText className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openAssign}><Plus className="mr-1 h-4 w-4" /> Assign plan</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
        <Kpi label="Active" value={kpis.active} />
        <Kpi label="Trial" value={kpis.trial} />
        <Kpi label="Past Due" value={kpis.past} />
        <Kpi label="Suspended" value={kpis.susp} />
        <Kpi label="Expired/Cancelled" value={kpis.exp} />
        <Kpi label="MRR (BDT)" value={`৳ ${Math.round(kpis.mrr).toLocaleString()}`} />
        <Kpi label="Churn % (30d)" value={`${kpis.churn.toFixed(1)}%`} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <button type="button" onClick={() => { setStatus("active"); }}
          className="rounded-lg border bg-card p-4 text-left hover:bg-accent transition">
          <div className="text-xs text-muted-foreground">Expiring Today</div>
          <div className="mt-1 text-2xl font-semibold">{widgets?.expiring_today ?? "—"}</div>
        </button>
        <button type="button" onClick={() => { setStatus("active"); }}
          className="rounded-lg border bg-card p-4 text-left hover:bg-accent transition">
          <div className="text-xs text-muted-foreground">Expiring This Week</div>
          <div className="mt-1 text-2xl font-semibold">{widgets?.expiring_this_week ?? "—"}</div>
        </button>
        <button type="button" onClick={() => setStatus("grace_period")}
          className="rounded-lg border bg-card p-4 text-left hover:bg-accent transition">
          <div className="text-xs text-muted-foreground">In Grace Period</div>
          <div className="mt-1 text-2xl font-semibold text-amber-600">{widgets?.in_grace_period ?? "—"}</div>
        </button>
        <button type="button" onClick={() => setStatus("suspended")}
          className="rounded-lg border bg-card p-4 text-left hover:bg-accent transition">
          <div className="text-xs text-muted-foreground">Suspended Stores</div>
          <div className="mt-1 text-2xl font-semibold text-destructive">{widgets?.suspended_stores ?? "—"}</div>
        </button>
      </div>


      <Card className="mt-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Plan</Label>
            <Select value={planId || "all"} onValueChange={(v) => setPlanId(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All plans" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All plans</SelectItem>
                {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Billing cycle</Label>
            <Select value={cycle || "all"} onValueChange={(v) => setCycle(v === "all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="All cycles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                {CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Search store / email</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pharma name or owner email" />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead>Trial Ends</TableHead>
                <TableHead>Last Payment</TableHead>
                <TableHead className="w-12 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : subs.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No subscriptions match the filters.</TableCell></TableRow>
              ) : subs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.tenant?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.tenant?.email ?? ""}</div>
                  </TableCell>
                  <TableCell>{s.plan?.name ?? "—"}</TableCell>
                  <TableCell className="capitalize">{s.billing_cycle.replace("_", " ")}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(s.status)} className="capitalize">
                      {s.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.current_period_end ? format(new Date(s.current_period_end), "yyyy-MM-dd") : "—"}</TableCell>
                  <TableCell>{s.trial_ends_at ? format(new Date(s.trial_ends_at), "yyyy-MM-dd") : "—"}</TableCell>
                  <TableCell>{s.last_payment_at ? format(new Date(s.last_payment_at), "yyyy-MM-dd") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setHistoryOpen(s)}>View history</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openChange(s)}>Change plan / cycle</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => renewMut.mutate(s.id)}>Renew period</DropdownMenuItem>
                        {s.scheduled_plan_id && (
                          <DropdownMenuItem onClick={() => cancelScheduledMut.mutate(s.id)}>
                            Cancel scheduled downgrade
                          </DropdownMenuItem>
                        )}
                        {s.status === "trial" && (
                          <DropdownMenuItem onClick={() => convertMut.mutate(s.id)}>Convert trial → paid</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {s.status !== "suspended" && (
                          <DropdownMenuItem onClick={() => statusMut.mutate({ id: s.id, st: "suspended" })}>Suspend</DropdownMenuItem>
                        )}
                        {s.status !== "active" && (
                          <DropdownMenuItem onClick={() => statusMut.mutate({ id: s.id, st: "active" })}>Reactivate</DropdownMenuItem>
                        )}
                        {s.status !== "cancelled" && (
                          <DropdownMenuItem className="text-destructive" onClick={() => statusMut.mutate({ id: s.id, st: "cancelled" })}>
                            Cancel
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Assign plan dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign plan to store</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Store</Label>
              <Select value={assignForm.tenant_id} onValueChange={(v) => setAssignForm({ ...assignForm, tenant_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choose a store" /></SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plan</Label>
              <Select value={assignForm.plan_id} onValueChange={(v) => setAssignForm({ ...assignForm, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                <SelectContent>
                  {plans.filter((p) => p.is_active).map((p) =>
                    <SelectItem key={p.id} value={p.id}>{p.name} — ৳{Number(p.price_bdt).toLocaleString()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <AssignPricingPicker
              planId={assignForm.plan_id}
              cycle={assignForm.billing_cycle}
              trialDays={assignForm.trial_days}
              onCycleChange={(v) => setAssignForm({ ...assignForm, billing_cycle: v })}
              onTrialChange={(v) => setAssignForm({ ...assignForm, trial_days: v })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => assignMut.mutate()}
              disabled={!assignForm.tenant_id || !assignForm.plan_id || assignMut.isPending}>
              {assignMut.isPending ? "Saving…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change plan dialog */}
      <Dialog open={!!changeOpen} onOpenChange={(o) => !o && setChangeOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
          </DialogHeader>
          {changeOpen && (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">
                Store: <span className="font-medium text-foreground">{changeOpen.tenant?.name}</span>
              </p>
              <div>
                <Label>New plan</Label>
                <Select value={changeForm.plan_id} onValueChange={(v) => setChangeForm({ ...changeForm, plan_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — ৳{Number(p.price_bdt).toLocaleString()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Billing cycle</Label>
                <Select value={changeForm.billing_cycle} onValueChange={(v) => setChangeForm({ ...changeForm, billing_cycle: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mode</Label>
                <Select value={changeForm.mode} onValueChange={(v) => setChangeForm({ ...changeForm, mode: v as typeof changeForm.mode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (upgrade now, downgrade at renewal)</SelectItem>
                    <SelectItem value="force_upgrade">Force upgrade now (prorate)</SelectItem>
                    <SelectItem value="force_downgrade">Force downgrade now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={changeForm.waive_fees}
                  onChange={(e) => setChangeForm({ ...changeForm, waive_fees: e.target.checked })} />
                Waive proration fees
              </label>
              {changeOpen.scheduled_plan_id && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                  A downgrade to plan <code>{changeOpen.scheduled_plan_id.slice(0,8)}</code> is scheduled for{" "}
                  {changeOpen.scheduled_change_at ? format(new Date(changeOpen.scheduled_change_at), "yyyy-MM-dd") : "next renewal"}.
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeOpen(null)}>Cancel</Button>
            <Button onClick={() => changeMut.mutate()} disabled={changeMut.isPending}>
              {changeMut.isPending ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History timeline dialog */}
      <Dialog open={!!historyOpen} onOpenChange={(o) => !o && setHistoryOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Subscription history{historyOpen?.tenant?.name ? ` — ${historyOpen.tenant.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {historyOpen ? <HistoryTimeline subscriptionId={historyOpen.id} /> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><p className="text-xl font-bold">{value}</p></CardContent>
    </Card>
  );
}

type PricingOption = {
  id: string; billing_cycle: string; duration_days: number;
  price_bdt: number; discount_percent: number; net_price: number;
};

function AssignPricingPicker({
  planId, cycle, trialDays, onCycleChange, onTrialChange,
}: {
  planId: string; cycle: string; trialDays: number;
  onCycleChange: (v: string) => void; onTrialChange: (v: number) => void;
}) {
  const fetchPricing = useServerFn(getPlanPricingOptions);
  const { data: options = [] } = useQuery({
    queryKey: ["plan-pricing-public", planId],
    queryFn: () => fetchPricing({ data: { plan_id: planId } }) as Promise<PricingOption[]>,
    enabled: !!planId,
  });

  const selected = options.find((o) => o.billing_cycle === cycle);
  const days = selected?.duration_days ?? 30;
  const expiry = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + Math.max(trialDays, 0) + days);
    return base;
  }, [trialDays, days]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Duration</Label>
          <Select value={cycle} onValueChange={onCycleChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(options.length > 0
                ? options.map((o) => ({
                    value: o.billing_cycle,
                    label: `${CYCLES.find((c) => c.value === o.billing_cycle)?.label ?? o.billing_cycle} — ৳${Number(o.net_price).toLocaleString()}`,
                  }))
                : CYCLES.map((c) => ({ value: c.value, label: c.label }))
              ).map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Trial days</Label>
          <Input type="number" value={trialDays}
            onChange={(e) => onTrialChange(Number(e.target.value) || 0)} />
        </div>
      </div>

      {planId ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          {selected ? (
            <div className="grid grid-cols-3 gap-2">
              <div><div className="text-xs text-muted-foreground">Amount</div>
                <div className="font-semibold">৳ {Number(selected.price_bdt).toLocaleString()}</div></div>
              <div><div className="text-xs text-muted-foreground">Discount</div>
                <div className="font-semibold">{Number(selected.discount_percent)}%</div></div>
              <div><div className="text-xs text-muted-foreground">Net</div>
                <div className="font-semibold">৳ {Number(selected.net_price).toLocaleString()}</div></div>
              <div className="col-span-3 text-xs text-muted-foreground">
                Duration: <b>{days} days</b> · Expires: <b>{format(expiry, "PP")}</b>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No pricing row for this cycle — default duration ({days} days) will be used; expiry: {format(expiry, "PP")}.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

type HistoryRow = {
  id: string; subscription_id: string; tenant_id: string; plan_id: string | null;
  from_status: string | null; to_status: string | null; event: string;
  actor_user_id: string | null; metadata: Record<string, unknown> | null; created_at: string;
};

function eventLabel(e: string) {
  return ({
    created: "Created", renewed: "Renewed", upgraded: "Upgraded", downgraded: "Downgraded",
    suspended: "Suspended", reactivated: "Reactivated", expired: "Expired", cancelled: "Cancelled",
    trial_converted: "Trial converted", grace_started: "Grace period started",
    status_changed: "Status changed",
  } as Record<string, string>)[e] ?? e;
}

function eventDotClass(e: string) {
  switch (e) {
    case "created":
    case "reactivated":
    case "renewed":
    case "trial_converted":
    case "upgraded":
      return "bg-emerald-500";
    case "suspended":
    case "grace_started":
      return "bg-amber-500";
    case "expired":
    case "cancelled":
    case "downgraded":
      return "bg-destructive";
    default:
      return "bg-muted-foreground";
  }
}

function HistoryTimeline({ subscriptionId }: { subscriptionId: string }) {
  const fetchHistory = useServerFn(adminGetSubscriptionHistory);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["subscription-history", subscriptionId],
    queryFn: () => fetchHistory({ data: { subscription_id: subscriptionId } }) as Promise<HistoryRow[]>,
  });

  if (isLoading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No history yet.</p>;
  }
  return (
    <div className="max-h-[60vh] overflow-y-auto pr-2">
      <ol className="relative ml-3 border-l">
        {rows.map((r) => (
          <li key={r.id} className="mb-5 ml-4">
            <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ring-2 ring-background ${eventDotClass(r.event)}`} />
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{eventLabel(r.event)}</p>
              <time className="text-xs text-muted-foreground">{format(new Date(r.created_at), "PP p")}</time>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.from_status ? <>From <b>{r.from_status}</b> → </> : null}
              {r.to_status ? <b>{r.to_status}</b> : null}
            </p>
            {r.metadata && Object.keys(r.metadata).length > 0 ? (
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[11px]">
                {JSON.stringify(r.metadata, null, 2)}
              </pre>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
