import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Trash2, Power } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminListPlans, adminUpsertPlan, adminDeletePlan, adminTogglePlan,
  adminPlanAnalytics,
  adminListPlanPricing, adminUpsertPlanPricing, adminTogglePlanPricing, adminDeletePlanPricing,
} from "@/lib/api/subscriptions.functions";

export const Route = createFileRoute("/admin/plans")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-8">Not found</div>,
  head: () => ({ meta: [{ title: "Plans — Super Admin" }] }),
  component: AdminPlansPage,
});

const BILLING_OPTS = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-Yearly" },
  { value: "yearly", label: "Yearly" },
  { value: "lifetime", label: "Lifetime" },
] as const;

const FEATURE_KEYS = [
  ["pos", "POS"], ["inventory", "Inventory"], ["purchase", "Purchase"], ["sales", "Sales"],
  ["accounting", "Accounting"], ["prescription", "Prescription"], ["crm", "CRM"], ["reports", "Reports"],
  ["sms", "SMS"], ["whatsapp_invoice", "WhatsApp Invoice"], ["mobile_app", "Mobile App"], ["ai_features", "AI Features"],
] as const;

type PlanRow = {
  id: string;
  code: string;
  slug: string | null;
  name: string;
  description: string | null;
  billing_interval: string;
  price_bdt: number;
  price_yearly_bdt: number | null;
  trial_days: number;
  sort_order: number;
  is_active: boolean;
  is_unlimited: boolean;
  max_products: number | null;
  max_users: number | null;
  max_branches: number | null;
  max_warehouses: number | null;
  max_storage_mb: number | null;
  max_api_requests_per_month: number | null;
  sms_enabled: boolean;
  api_enabled: boolean;
  features: Record<string, boolean> | null;
  payment_methods: string[] | null;
};

type FormState = Omit<PlanRow, "id"> & { id?: string };

const emptyFeatures = Object.fromEntries(FEATURE_KEYS.map(([k]) => [k, false])) as Record<string, boolean>;

const emptyForm: FormState = {
  code: "", slug: "", name: "", description: "",
  billing_interval: "monthly",
  price_bdt: 0, price_yearly_bdt: 0, trial_days: 14, sort_order: 100,
  is_active: true, is_unlimited: false,
  max_products: null, max_users: null, max_branches: null, max_warehouses: null,
  max_storage_mb: null, max_api_requests_per_month: null,
  sms_enabled: false, api_enabled: false,
  features: emptyFeatures,
  payment_methods: [],
};

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function AdminPlansPage() {
  const qc = useQueryClient();
  const listPlans = useServerFn(adminListPlans);
  const upsertPlan = useServerFn(adminUpsertPlan);
  const deletePlan = useServerFn(adminDeletePlan);
  const togglePlan = useServerFn(adminTogglePlan);
  const analytics = useServerFn(adminPlanAnalytics);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin", "plans-mgmt"],
    queryFn: () => listPlans() as Promise<PlanRow[]>,
  });

  const { data: stats = [] } = useQuery({
    queryKey: ["admin", "plan-analytics"],
    queryFn: () => analytics(),
    staleTime: 60_000,
  });

  const statsByPlan = useMemo(() => {
    const map = new Map<string, (typeof stats)[number]>();
    for (const s of stats) map.set(s.plan_id, s);
    return map;
  }, [stats]);

  const totals = useMemo(() => {
    let active = 0, trial = 0, mrr = 0;
    for (const s of stats) { active += Number(s.active_count); trial += Number(s.trial_count); mrr += Number(s.mrr); }
    return {
      activePlans: plans.filter((p) => p.is_active).length,
      totalPlans: plans.length,
      activeSubs: active, trialSubs: trial, mrr,
    };
  }, [stats, plans]);

  const save = useMutation({
    mutationFn: (input: FormState) => upsertPlan({ data: {
      ...input,
      description: input.description ?? null,
      price_yearly_bdt: input.price_yearly_bdt ?? null,
    } }),
    onSuccess: () => {
      toast.success(form.id ? "Plan updated" : "Plan created");
      qc.invalidateQueries({ queryKey: ["admin", "plans-mgmt"] });
      qc.invalidateQueries({ queryKey: ["admin", "plan-analytics"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePlan({ data: { id } }),
    onSuccess: () => {
      toast.success("Plan deleted");
      qc.invalidateQueries({ queryKey: ["admin", "plans-mgmt"] });
      qc.invalidateQueries({ queryKey: ["admin", "plan-analytics"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      togglePlan({ data: { id, is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans-mgmt"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() {
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(p: PlanRow) {
    setForm({
      ...p,
      description: p.description ?? "",
      price_yearly_bdt: p.price_yearly_bdt ?? 0,
      features: { ...emptyFeatures, ...(p.features ?? {}) },
      payment_methods: p.payment_methods ?? [],
      slug: p.slug ?? slugify(p.name),
    });
    setOpen(true);
  }

  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  return (
    <AppShell variant="admin" title="Plans">
      <PageHeader
        title="Subscription Plans"
        description="Create, edit, and price the subscription plans available to stores."
        actions={
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> New plan</Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Total Plans" value={totals.totalPlans} />
        <Kpi label="Active Plans" value={totals.activePlans} />
        <Kpi label="Active Subs" value={totals.activeSubs} />
        <Kpi label="Trial Subs" value={totals.trialSubs} />
        <Kpi label="MRR (BDT)" value={`৳ ${Math.round(totals.mrr).toLocaleString()}`} />
      </div>

      <Card className="mt-5">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead className="text-right">Branches</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : plans.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">No plans yet</TableCell></TableRow>
              ) : plans.map((p) => {
                const s = statsByPlan.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><code className="text-xs">{p.slug ?? p.code}</code></TableCell>
                    <TableCell className="capitalize">{p.billing_interval.replace("_", " ")}</TableCell>
                    <TableCell className="text-right">৳ {Number(p.price_bdt ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{p.is_unlimited ? "∞" : (p.max_products ?? "∞")}</TableCell>
                    <TableCell className="text-right">{p.is_unlimited ? "∞" : (p.max_users ?? "∞")}</TableCell>
                    <TableCell className="text-right">{p.is_unlimited ? "∞" : (p.max_branches ?? "∞")}</TableCell>
                    <TableCell className="text-right">{s ? Number(s.active_count) : 0}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>
                        {p.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => toggle.mutate({ id: p.id, is_active: !p.is_active })} title={p.is_active ? "Deactivate" : "Activate"}>
                        <Power className={`h-4 w-4 ${p.is_active ? "text-emerald-600" : "text-muted-foreground"}`} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        onClick={() => { if (confirm(`Delete plan "${p.name}"?`)) remove.mutate(p.id); }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit plan" : "New plan"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basics">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basics">Basics</TabsTrigger>
              <TabsTrigger value="limits">Limits</TabsTrigger>
              <TabsTrigger value="features">Features</TabsTrigger>
              <TabsTrigger value="pricing" disabled={!form.id}>Pricing</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="grid grid-cols-2 gap-3 pt-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f, name,
                      slug: f.id ? f.slug : slugify(name),
                      code: f.id ? f.code : slugify(name).replace(/-/g, "_"),
                    }));
                  }}
                />
              </div>
              <div>
                <Label>Slug</Label>
                <Input
                  value={form.slug ?? ""}
                  onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
                />
              </div>
              <div>
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                  disabled={!!form.id}
                />
              </div>
              <div>
                <Label>Billing cycle</Label>
                <Select value={form.billing_interval} onValueChange={(v) => setForm({ ...form, billing_interval: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILLING_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={form.description ?? ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Price (৳)</Label>
                <Input type="number" value={form.price_bdt}
                  onChange={(e) => setForm({ ...form, price_bdt: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Price yearly (৳)</Label>
                <Input type="number" value={form.price_yearly_bdt ?? 0}
                  onChange={(e) => setForm({ ...form, price_yearly_bdt: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Trial days</Label>
                <Input type="number" value={form.trial_days}
                  onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input type="number" value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch checked={form.is_unlimited} onCheckedChange={(v) => setForm({ ...form, is_unlimited: v })} />
                <Label>Unlimited resources</Label>
              </div>
            </TabsContent>

            <TabsContent value="limits" className="grid grid-cols-2 gap-3 pt-4">
              {form.is_unlimited && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  Unlimited mode is on — these limits will be ignored at runtime.
                </p>
              )}
              <LimitField label="Max products" value={form.max_products}
                onChange={(v) => setForm({ ...form, max_products: v })} disabled={form.is_unlimited} />
              <LimitField label="Max users" value={form.max_users}
                onChange={(v) => setForm({ ...form, max_users: v })} disabled={form.is_unlimited} />
              <LimitField label="Max branches" value={form.max_branches}
                onChange={(v) => setForm({ ...form, max_branches: v })} disabled={form.is_unlimited} />
              <LimitField label="Max warehouses" value={form.max_warehouses}
                onChange={(v) => setForm({ ...form, max_warehouses: v })} disabled={form.is_unlimited} />
              <LimitField label="Storage (MB)" value={form.max_storage_mb}
                onChange={(v) => setForm({ ...form, max_storage_mb: v })} disabled={form.is_unlimited} />
              <LimitField label="API requests / month" value={form.max_api_requests_per_month}
                onChange={(v) => setForm({ ...form, max_api_requests_per_month: v })} disabled={form.is_unlimited} />
            </TabsContent>

            <TabsContent value="features" className="grid grid-cols-2 gap-3 pt-4 md:grid-cols-3">
              {FEATURE_KEYS.map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{label}</span>
                  <Switch
                    checked={!!form.features?.[key]}
                    onCheckedChange={(v) => setForm({
                      ...form, features: { ...(form.features ?? {}), [key]: v },
                    })}
                  />
                </label>
              ))}
              <label className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">SMS Enabled (system flag)</span>
                <Switch checked={form.sms_enabled} onCheckedChange={(v) => setForm({ ...form, sms_enabled: v })} />
              </label>
              <label className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">API Enabled (system flag)</span>
                <Switch checked={form.api_enabled} onCheckedChange={(v) => setForm({ ...form, api_enabled: v })} />
              </label>
            </TabsContent>

            <TabsContent value="pricing" className="pt-4">
              {form.id ? (
                <PricingMatrixEditor planId={form.id} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Save the plan first to manage its pricing matrix.
                </p>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.name || !form.code || !form.slug || save.isPending}
            >
              {save.isPending ? "Saving…" : form.id ? "Save changes" : "Create plan"}
            </Button>
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
      <CardContent><p className="text-2xl font-bold">{value}</p></CardContent>
    </Card>
  );
}

function LimitField({ label, value, onChange, disabled }: {
  label: string; value: number | null; onChange: (v: number | null) => void; disabled?: boolean;
}) {
  return (
    <div>
      <Label>{label} <span className="text-xs text-muted-foreground">(blank = ∞)</span></Label>
      <Input
        type="number"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}

type PricingRow = {
  id: string;
  plan_id: string;
  billing_cycle: "monthly" | "quarterly" | "half_yearly" | "yearly" | "lifetime";
  duration_days: number;
  price_bdt: number;
  discount_percent: number;
  is_active: boolean;
};

const CYCLE_DAYS_DEFAULT: Record<string, number> = {
  monthly: 30, quarterly: 90, half_yearly: 180, yearly: 365, lifetime: 36500,
};

function PricingMatrixEditor({ planId }: { planId: string }) {
  const qc = useQueryClient();
  const list = useServerFn(adminListPlanPricing);
  const upsert = useServerFn(adminUpsertPlanPricing);
  const toggle = useServerFn(adminTogglePlanPricing);
  const remove = useServerFn(adminDeletePlanPricing);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "plan-pricing", planId],
    queryFn: () => list({ data: { plan_id: planId } }) as Promise<PricingRow[]>,
  });

  const [draft, setDraft] = useState<{
    billing_cycle: "monthly" | "quarterly" | "half_yearly" | "yearly" | "lifetime"; duration_days: number; price_bdt: number; discount_percent: number;
  }>({ billing_cycle: "monthly", duration_days: 30, price_bdt: 0, discount_percent: 0 });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "plan-pricing", planId] });

  type UpsertInput = {
    id?: string;
    plan_id: string;
    billing_cycle: "monthly" | "quarterly" | "half_yearly" | "yearly" | "lifetime";
    duration_days: number;
    price_bdt: number;
    discount_percent: number;
    is_active: boolean;
  };
  const save = useMutation({
    mutationFn: (input: UpsertInput) => upsert({ data: input }),
    onSuccess: () => { invalidate(); toast.success("Pricing saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const tog = useMutation({
    mutationFn: (r: PricingRow) => toggle({ data: { id: r.id, is_active: !r.is_active } }),
    onSuccess: invalidate,
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { invalidate(); toast.success("Pricing row deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cycle</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead className="text-right">Price (৳)</TableHead>
              <TableHead className="text-right">Discount %</TableHead>
              <TableHead className="text-right">Net (৳)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-6 text-center text-muted-foreground">No pricing rows yet</TableCell></TableRow>
            ) : rows.map((r) => {
              const net = Math.round(Number(r.price_bdt) * (1 - Number(r.discount_percent) / 100) * 100) / 100;
              return (
                <TableRow key={r.id}>
                  <TableCell className="capitalize">{r.billing_cycle.replace("_", " ")}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" className="h-8 w-20 text-right ml-auto"
                      defaultValue={r.duration_days}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || r.duration_days;
                        if (v !== r.duration_days) save.mutate({ ...r, duration_days: v });
                      }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" className="h-8 w-24 text-right ml-auto"
                      defaultValue={r.price_bdt}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== Number(r.price_bdt)) save.mutate({ ...r, price_bdt: v });
                      }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" className="h-8 w-20 text-right ml-auto"
                      defaultValue={r.discount_percent}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== Number(r.discount_percent)) save.mutate({ ...r, discount_percent: v });
                      }} />
                  </TableCell>
                  <TableCell className="text-right font-medium">৳ {net.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "secondary"}>
                      {r.is_active ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => tog.mutate(r)} title={r.is_active ? "Disable" : "Enable"}>
                      <Power className={`h-4 w-4 ${r.is_active ? "text-emerald-600" : "text-muted-foreground"}`} />
                    </Button>
                    <Button size="icon" variant="ghost"
                      onClick={() => { if (confirm("Delete this pricing row?")) del.mutate(r.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-2 text-sm font-medium">Add pricing row</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div>
            <Label className="text-xs">Cycle</Label>
            <Select
              value={draft.billing_cycle}
              onValueChange={(v) => setDraft((d) => ({ ...d, billing_cycle: v as typeof d.billing_cycle, duration_days: CYCLE_DAYS_DEFAULT[v] ?? d.duration_days }))}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BILLING_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Days</Label>
            <Input type="number" value={draft.duration_days}
              onChange={(e) => setDraft({ ...draft, duration_days: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <Label className="text-xs">Price (৳)</Label>
            <Input type="number" value={draft.price_bdt}
              onChange={(e) => setDraft({ ...draft, price_bdt: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <Label className="text-xs">Discount %</Label>
            <Input type="number" value={draft.discount_percent}
              onChange={(e) => setDraft({ ...draft, discount_percent: Number(e.target.value) || 0 })} />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={save.isPending || draft.duration_days <= 0}
              onClick={() => save.mutate({
                plan_id: planId,
                billing_cycle: draft.billing_cycle,
                duration_days: draft.duration_days,
                price_bdt: draft.price_bdt,
                discount_percent: draft.discount_percent,
                is_active: true,
              })}
            >
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Adding a cycle that already exists will update its price.
        </p>
      </div>
    </div>
  );
}
