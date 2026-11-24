import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronDown, KeyRound, Pencil, ShieldOff, ShieldCheck, CreditCard, Loader2,
  Ban, RefreshCw, Building2, Users, Receipt, ScrollText, History,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getStoreDetail, updateStore, resetStorePassword, changeStorePlan, getStoreStats,
} from "@/lib/api/admin-stores.functions";
import {
  approveTenant, rejectTenant, suspendTenant, activateTenant,
} from "@/lib/api/saas-approval.functions";

type TabKey = "edit" | "password" | "plan" | "subscription" | "usage";

export const Route = createFileRoute("/admin/stores/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Store Details — Super Admin" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: TabKey } => {
    const t = s.tab;
    return t === "edit" || t === "password" || t === "plan" || t === "subscription" || t === "usage"
      ? { tab: t } : {};
  },
  component: StoreDetailsPage,
});

const PLAN_LABELS: Record<string, string> = {
  basic: "Basic (৳৯৯৯/মাস)",
  starter: "Starter (৳১,৪৯৯/মাস)",
  business: "Business (৳২,৪৯৯/মাস)",
  pro: "Business (৳২,৪৯৯/মাস)",
  professional: "Business (৳২,৪৯৯/মাস)",
  enterprise: "Enterprise (কাস্টম)",
  free: "Free Trial (৭ দিন)",
};

type ConfirmKind = "approve" | "reject" | "suspend" | "activate" | null;

function StoreDetailsPage() {
  const { id } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fetchDetail = useServerFn(getStoreDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "store", id],
    queryFn: () => fetchDetail({ data: { tenantId: id } }),
  });

  const fetchStats = useServerFn(getStoreStats);
  const { data: stats } = useQuery({
    queryKey: ["admin", "store", id, "stats"],
    queryFn: () => fetchStats({ data: { tenantId: id } }),
  });

  // Dialog visibility is derived directly from the URL ?tab= param so:
  //  - the dialog reliably opens on first navigation (no Dialog-mount race during loading)
  //  - re-clicking the same action after close re-opens it (URL changes again)
  //  - deep links like ?tab=edit always work
  const editOpen = tab === "edit";
  const pwOpen = tab === "password";
  const planOpen = tab === "plan";

  const setTab = (next?: TabKey) =>
    navigate({
      to: "/admin/stores/$id",
      params: { id },
      search: next ? { tab: next } : {},
      replace: true,
    });

  const setEditOpen = (o: boolean) => setTab(o ? "edit" : undefined);
  const setPwOpen = (o: boolean) => setTab(o ? "password" : undefined);
  const setPlanOpen = (o: boolean) => setTab(o ? "plan" : undefined);

  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [remarks, setRemarks] = useState("");



  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "store", id] });
    qc.invalidateQueries({ queryKey: ["admin", "store", id, "stats"] });
    qc.invalidateQueries({ queryKey: ["admin", "stores"] });
  };

  const onSuccess = (msg: string) => () => {
    toast.success(msg);
    setConfirm(null);
    setRemarks("");
    invalidate();
  };
  const onErr = (e: Error) => toast.error(e.message);

  const suspendMu  = useMutation({ mutationFn: useServerFn(suspendTenant),  onSuccess: onSuccess("Store suspended"),  onError: onErr });
  const activateMu = useMutation({ mutationFn: useServerFn(activateTenant), onSuccess: onSuccess("Store activated"),  onError: onErr });
  const approveMu  = useMutation({ mutationFn: useServerFn(approveTenant),  onSuccess: onSuccess("Store approved"),   onError: onErr });
  const rejectMu   = useMutation({ mutationFn: useServerFn(rejectTenant),   onSuccess: onSuccess("Store rejected"),   onError: onErr });

  const busy = suspendMu.isPending || activateMu.isPending || approveMu.isPending || rejectMu.isPending;

  const runConfirm = (tenantId: string) => {
    const payload = { data: { tenantId, remarks: remarks || undefined } };
    if (confirm === "approve")  approveMu.mutate(payload);
    if (confirm === "reject")   rejectMu.mutate(payload);
    if (confirm === "suspend")  suspendMu.mutate(payload);
    if (confirm === "activate") activateMu.mutate(payload);
  };

  const confirmMeta: Record<Exclude<ConfirmKind, null>, { title: string; desc: string; cta: string; danger?: boolean }> = {
    approve:  { title: "Approve store?",   desc: "Activate the store and provision HQ branch, warehouse and subscription.", cta: "Approve" },
    reject:   { title: "Reject store?",    desc: "Mark the store as rejected. The owner will not gain access.", cta: "Reject", danger: true },
    suspend:  { title: "Suspend store?",   desc: "Block access until the store is reactivated.", cta: "Suspend", danger: true },
    activate: { title: "Reactivate store?", desc: "Set the store to active and restore access.", cta: "Reactivate" },
  };

  if (isLoading || !data) {
    return (
      <AppShell variant="admin" title="Store">
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      </AppShell>
    );
  }

  const tenant = data.tenant as {
    id: string; name: string; slug: string; type: string | null; plan: string | null;
    status: string | null; email: string | null; phone: string | null; mobile: string | null;
    owner_name: string | null; address_line: string | null; district: string | null;
    trade_license_no: string | null; custom_domain: string | null;
    created_at: string; updated_at: string;
  };
  const owner = (data.owner ?? null) as
    | { user_id: string; full_name: string | null; email: string | null; phone: string | null }
    | null;
  const ownerName = owner?.full_name ?? tenant.owner_name ?? "—";
  const ownerEmail = owner?.email ?? tenant.email ?? "—";
  const ownerPhone = owner?.phone ?? tenant.mobile ?? tenant.phone ?? "—";

  return (
    <AppShell variant="admin" title={tenant.name}>
      <PageHeader
        title={tenant.name}
        description={`${tenant.slug}${tenant.custom_domain ? ` · ${tenant.custom_domain}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/admin/stores"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={busy}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Actions <ChevronDown className="ml-1.5 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit Store
                </DropdownMenuItem>
                {tenant.status === "pending" && (
                  <>
                    <DropdownMenuItem onClick={() => setConfirm("approve")}>
                      <ShieldCheck className="mr-2 h-4 w-4 text-success" /> Approve Store
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setConfirm("reject")} className="text-destructive focus:text-destructive">
                      <Ban className="mr-2 h-4 w-4" /> Reject Store
                    </DropdownMenuItem>
                  </>
                )}
                {tenant.status === "suspended" && (
                  <DropdownMenuItem onClick={() => setConfirm("activate")}>
                    <ShieldCheck className="mr-2 h-4 w-4 text-success" /> Reactivate Store
                  </DropdownMenuItem>
                )}
                {tenant.status === "expired" && (
                  <>
                    <DropdownMenuItem onClick={() => setConfirm("activate")}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Renew & Reactivate
                    </DropdownMenuItem>
                  </>
                )}
                {tenant.status === "active" && (
                  <DropdownMenuItem onClick={() => setConfirm("suspend")} className="text-destructive focus:text-destructive">
                    <ShieldOff className="mr-2 h-4 w-4" /> Suspend Store
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setPlanOpen(true)}>
                  <CreditCard className="mr-2 h-4 w-4" /> Change Plan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPwOpen(true)}>
                  <KeyRound className="mr-2 h-4 w-4" /> Reset Password
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-card">
          <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Info label="Owner" value={ownerName} />
            <Info label="Email" value={ownerEmail} />
            <Info label="Mobile" value={ownerPhone} />
            <Info label="District" value={tenant.district ?? "—"} />
            <Info label="Address" value={tenant.address_line ?? "—"} className="sm:col-span-2" />
            <Info label="Trade License" value={tenant.trade_license_no ?? "—"} />
            <Info label="Type" value={tenant.type ?? "—"} />
            <Info label="Registered" value={new Date(tenant.created_at).toLocaleString()} />
            <Info label="Updated" value={new Date(tenant.updated_at).toLocaleString()} />
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="space-y-4 p-5">
            <Info label="Status" value={<Badge variant="outline">{tenant.status ?? "pending"}</Badge>} />
            <Info label="Plan" value={
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {PLAN_LABELS[tenant.plan ?? "free"] ?? tenant.plan}
              </Badge>
            } />
            {data.subscription && (
              <>
                <Info label="Subscription" value={data.subscription.status ?? "—"} />
                {data.subscription.trial_ends_at && (
                  <Info label="Trial Ends" value={new Date(data.subscription.trial_ends_at).toLocaleDateString()} />
                )}
                {data.subscription.current_period_end && (
                  <Info label="Period End" value={new Date(data.subscription.current_period_end).toLocaleDateString()} />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatCard icon={<Building2 className="h-4 w-4" />} title="Branch Statistics" count={stats?.branchCount ?? 0} label="branches">
          <ul className="divide-y text-sm">
            {(stats?.branches ?? []).slice(0, 6).map((b) => (
              <li key={b.id} className="flex items-center justify-between py-1.5">
                <span className="truncate">{b.name} <span className="text-xs text-muted-foreground">({b.code})</span></span>
                <span className="flex items-center gap-1.5 text-xs">
                  {b.is_main && <Badge variant="outline" className="border-primary/30 text-primary">Main</Badge>}
                  <Badge variant="outline" className={b.is_active ? "border-success/30 text-success" : "border-muted-foreground/30 text-muted-foreground"}>
                    {b.is_active ? "Active" : "Inactive"}
                  </Badge>
                </span>
              </li>
            ))}
            {!stats?.branches?.length && <li className="py-3 text-center text-xs text-muted-foreground">No branches</li>}
          </ul>
        </StatCard>

        <StatCard icon={<Users className="h-4 w-4" />} title="User Statistics" count={stats?.userCount ?? 0} label="members">
          <p className="text-xs text-muted-foreground">Total active tenant members across all branches and roles.</p>
        </StatCard>

        <Card id="subscription" className="lg:col-span-2 shadow-card">
          <CardHeader className="flex flex-row items-center gap-2 pb-2"><History className="h-4 w-4" /><CardTitle className="text-base">Subscription History</CardTitle></CardHeader>
          <CardContent className="p-5 pt-0">
            {(stats?.subscriptionHistory ?? []).length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">No subscription records</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b"><th className="py-2 text-left">Status</th><th className="text-left">Plan</th><th className="text-left">Trial Ends</th><th className="text-left">Period End</th><th className="text-left">Created</th></tr>
                  </thead>
                  <tbody>
                    {(stats?.subscriptionHistory ?? []).map((s) => (
                      <tr key={s.id} className="border-b last:border-b-0">
                        <td className="py-1.5"><Badge variant="outline">{s.status ?? "—"}</Badge></td>
                        <td>{s.plan_id ?? "—"}</td>
                        <td className="text-xs text-muted-foreground">{s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString() : "—"}</td>
                        <td className="text-xs text-muted-foreground">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
                        <td className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="usage" className="lg:col-span-2 shadow-card">
          <CardHeader className="flex flex-row items-center gap-2 pb-2"><Receipt className="h-4 w-4" /><CardTitle className="text-base">Payment History</CardTitle></CardHeader>
          <CardContent className="p-5 pt-0">
            {(stats?.payments ?? []).length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">No payments yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b"><th className="py-2 text-left">Date</th><th className="text-left">Amount</th><th className="text-left">Method</th><th className="text-left">Cycle</th><th className="text-left">Status</th></tr>
                  </thead>
                  <tbody>
                    {(stats?.payments ?? []).map((p) => (
                      <tr key={p.id} className="border-b last:border-b-0">
                        <td className="py-1.5 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                        <td className="font-medium">{p.amount} {p.currency}</td>
                        <td className="text-xs">{p.method ?? "—"}</td>
                        <td className="text-xs">{p.billing_cycle ?? "—"}</td>
                        <td><Badge variant="outline">{p.status ?? "—"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-card">
          <CardHeader className="flex flex-row items-center gap-2 pb-2"><ScrollText className="h-4 w-4" /><CardTitle className="text-base">Audit Timeline</CardTitle></CardHeader>
          <CardContent className="p-5 pt-0">
            {(stats?.audit ?? []).length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">No audit entries</p>
            ) : (
              <ul className="space-y-2">
                {(stats?.audit ?? []).map((a) => (
                  <li key={a.id} className="flex items-start gap-3 border-l-2 border-primary/30 pl-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.action}</p>
                      <p className="text-xs text-muted-foreground">{a.entity_table}{a.entity_id ? ` · ${a.entity_id.slice(0, 8)}` : ""}</p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <EditDialog open={editOpen} onOpenChange={setEditOpen} tenant={tenant} owner={owner} onSaved={invalidate} />
      <ResetPwDialog open={pwOpen} onOpenChange={setPwOpen} tenantId={tenant.id} />
      <ChangePlanDialog open={planOpen} onOpenChange={setPlanOpen} tenantId={tenant.id} current={tenant.plan ?? "free"} onSaved={invalidate} />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) { setConfirm(null); setRemarks(""); } }}>
        <AlertDialogContent>
          {confirm && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmMeta[confirm].title}</AlertDialogTitle>
                <AlertDialogDescription>{confirmMeta[confirm].desc}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label className="text-xs">Remarks (optional)</Label>
                <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Internal note for audit log" />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => runConfirm(tenant.id)}
                  disabled={busy}
                  className={confirmMeta[confirm].danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
                >
                  {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {confirmMeta[confirm].cta}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function StatCard({ icon, title, count, label, children }: {
  icon: React.ReactNode; title: string; count: number; label: string; children?: React.ReactNode;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{count} {label}</Badge>
      </CardHeader>
      <CardContent className="p-5 pt-0">{children}</CardContent>
    </Card>
  );
}

function Info({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function EditDialog({ open, onOpenChange, tenant, owner, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  tenant: { id: string; name: string; owner_name: string | null; mobile: string | null; email: string | null; address_line: string | null; district: string | null; trade_license_no: string | null };
  owner: { user_id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  onSaved: () => void;
}) {
  const seed = () => ({
    name: tenant.name,
    owner_name: owner?.full_name ?? tenant.owner_name ?? "",
    mobile: owner?.phone ?? tenant.mobile ?? "",
    email: owner?.email ?? tenant.email ?? "",
    address_line: tenant.address_line ?? "",
    district: tenant.district ?? "",
    trade_license_no: tenant.trade_license_no ?? "",
  });
  const [form, setForm] = useState(seed);
  useEffect(() => { setForm(seed()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [tenant.id, owner?.user_id, owner?.full_name, owner?.email, owner?.phone,
     tenant.name, tenant.owner_name, tenant.email, tenant.mobile,
     tenant.address_line, tenant.district, tenant.trade_license_no]);
  const mu = useMutation({
    mutationFn: useServerFn(updateStore),
    onSuccess: () => { toast.success("Store updated"); onOpenChange(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Edit Store</DialogTitle></DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); mu.mutate({ data: { tenantId: tenant.id, ...form } }); }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <FormField label="Pharmacy Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <FormField label="Owner Name" value={form.owner_name} onChange={(v) => setForm({ ...form, owner_name: v })} />
          <FormField label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} />
          <FormField label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <FormField label="District" value={form.district} onChange={(v) => setForm({ ...form, district: v })} />
          <FormField label="Trade License" value={form.trade_license_no} onChange={(v) => setForm({ ...form, trade_license_no: v })} />
          <div className="sm:col-span-2">
            <FormField label="Address" value={form.address_line} onChange={(v) => setForm({ ...form, address_line: v })} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mu.isPending}>
              {mu.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPwDialog({ open, onOpenChange, tenantId }: { open: boolean; onOpenChange: (o: boolean) => void; tenantId: string }) {
  const [pw, setPw] = useState("");
  const mu = useMutation({
    mutationFn: useServerFn(resetStorePassword),
    onSuccess: () => { toast.success("Password reset"); onOpenChange(false); setPw(""); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reset Owner Password</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mu.mutate({ data: { tenantId, password: pw } }); }} className="space-y-3">
          <FormField label="New Password" type="password" value={pw} onChange={setPw} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mu.isPending || pw.length < 8}>
              {mu.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Reset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePlanDialog({ open, onOpenChange, tenantId, current, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; tenantId: string; current: string; onSaved: () => void;
}) {
  const [plan, setPlan] = useState(current);
  const mu = useMutation({
    mutationFn: useServerFn(changeStorePlan),
    onSuccess: () => { toast.success("Plan changed"); onOpenChange(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Change Plan</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mu.mutate({ data: { tenantId, plan: plan as "free" | "starter" | "pro" | "enterprise" } }); }} className="space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs font-medium">Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic (৳999/mo)</SelectItem>
                <SelectItem value="starter">Starter (৳1,499/mo)</SelectItem>
                <SelectItem value="business">Business (৳2,499/mo)</SelectItem>
                <SelectItem value="enterprise">Enterprise (Custom)</SelectItem>
                <SelectItem value="free">Free Trial (7 Days)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mu.isPending}>
              {mu.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs font-medium">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
