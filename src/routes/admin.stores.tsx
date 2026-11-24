import { createFileRoute, Link, Outlet, useNavigate, useMatches } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  Search, Filter, Eye, Plus, Loader2, MoreHorizontal,
  Pencil, KeyRound, CreditCard, ShieldCheck, ShieldOff, Ban,
  RefreshCw, History, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { createStoreAdmin } from "@/lib/api/admin-stores.functions";
import {
  approveTenant, rejectTenant, suspendTenant, activateTenant,
} from "@/lib/api/saas-approval.functions";

export const Route = createFileRoute("/admin/stores")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Stores — Super Admin" }] }),
  component: StoresLayout,
});

function StoresLayout() {
  const matches = useMatches();
  const hasChild = matches.some((m) => m.routeId === "/admin/stores/$id");
  if (hasChild) return <Outlet />;
  return <StoresPage />;
}

interface StoreRow {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  plan: string | null;
  status: string | null;
  created_at: string;
  custom_domain: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Basic (7 Days Trial)",
  basic: "Basic (৳999)",
  starter: "Starter (৳1,499)",
  business: "Business (৳2,499)",
  pro: "Business (৳2,499)",
  professional: "Business (৳2,499)",
  enterprise: "Enterprise (Custom)",
};

function StoresPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ["admin", "stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,slug,type,plan,status,created_at,custom_domain")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as StoreRow[];
    },
  });

  const filtered = stores.filter((s) => {
    const matchQ = !q || [s.name, s.slug, s.custom_domain ?? ""]
      .some((v) => v.toLowerCase().includes(q.toLowerCase()));
    const matchS = status === "all" || s.status === status;
    return matchQ && matchS;
  });

  const createFn = useServerFn(createStoreAdmin);
  const createMu = useMutation({
    mutationFn: createFn,
    onSuccess: (res: { tenantId: string }) => {
      toast.success("Store created");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "stores"] });
      navigate({ to: "/admin/stores/$id" as never, params: { id: res.tenantId } as never });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to create store"),
  });

  return (
    <AppShell variant="admin" title={t("nav.stores")}>
      <PageHeader
        title={t("admin.stores.title")}
        description={t("admin.stores.desc")}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Store
          </Button>
        }
      />

      <Card className="shadow-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("admin.stores.searchPh")} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.stores.allStatus")}</SelectItem>
                <SelectItem value="active">{t("common.active")}</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="expired">{t("common.expired")}</SelectItem>
                <SelectItem value="suspended">{t("common.suspended")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline"><Filter className="mr-1.5 h-4 w-4" /> {t("common.moreFilters")}</Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.stores.pharmacy")}</TableHead>
                  <TableHead>{t("admin.stores.contact")}</TableHead>
                  <TableHead>{t("admin.stores.plan")}</TableHead>
                  <TableHead>{t("admin.stores.registered")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{t("admin.stores.loading")}</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{t("admin.stores.none")}</TableCell></TableRow>
                ) : filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        to="/admin/stores/$id"
                        params={{ id: s.id }}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{s.slug}{s.custom_domain ? ` · ${s.custom_domain}` : ""}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.type ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                        {PLAN_LABELS[s.plan ?? "free"] ?? s.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status ?? "pending"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <StoreActionsMenu store={s} onChanged={() => qc.invalidateQueries({ queryKey: ["admin", "stores"] })} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddStoreDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        submitting={createMu.isPending}
        onSubmit={(payload) => createMu.mutate({ data: payload })}
      />
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "border-success/30 bg-success/10 text-success",
    pending: "border-warning/30 bg-warning/10 text-warning",
    suspended: "border-destructive/30 bg-destructive/10 text-destructive",
    expired: "border-muted-foreground/30 bg-muted text-muted-foreground",
    rejected: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return <Badge variant="outline" className={map[status] ?? map.pending}>{status}</Badge>;
}

type CreatePayload = {
  pharmacy_name: string;
  owner_name: string;
  mobile: string;
  email: string;
  password: string;
  address?: string;
  district?: string;
  trade_license?: string;
  plan: "basic" | "starter" | "business" | "enterprise";
  status: "pending" | "active";
};

function AddStoreDialog({
  open, onOpenChange, submitting, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  submitting: boolean;
  onSubmit: (p: CreatePayload) => void;
}) {
  const [form, setForm] = useState<CreatePayload>({
    pharmacy_name: "", owner_name: "", mobile: "", email: "", password: "",
    address: "", district: "", trade_license: "", plan: "basic", status: "pending",
  });
  const set = <K extends keyof CreatePayload>(k: K, v: CreatePayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Store</DialogTitle>
          <DialogDescription>Create a new pharmacy account on behalf of the owner.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Store Information</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Pharmacy Name" required>
                <Input required value={form.pharmacy_name} onChange={(e) => set("pharmacy_name", e.target.value)} />
              </Field>
              <Field label="Owner Name" required>
                <Input required value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
              </Field>
              <Field label="Mobile" required>
                <Input required placeholder="01XXXXXXXXX" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
              </Field>
              <Field label="Email" required>
                <Input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Password" required>
                <Input required type="password" minLength={8} value={form.password} onChange={(e) => set("password", e.target.value)} />
              </Field>
              <Field label="District">
                <Input value={form.district} onChange={(e) => set("district", e.target.value)} />
              </Field>
              <Field label="Address" className="sm:col-span-2">
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </Field>
              <Field label="Trade License" className="sm:col-span-2">
                <Input value={form.trade_license} onChange={(e) => set("trade_license", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Subscription">
              <Select value={form.plan} onValueChange={(v) => set("plan", v as CreatePayload["plan"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic (৳999/mo · 7d trial)</SelectItem>
                  <SelectItem value="starter">Starter (৳1,499/mo · 7d trial)</SelectItem>
                  <SelectItem value="business">Business (৳2,499/mo · 7d trial)</SelectItem>
                  <SelectItem value="enterprise">Enterprise (Custom · 7d trial)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v as CreatePayload["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </section>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Store
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, className, children }: {
  label: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

type ConfirmKind = "approve" | "reject" | "suspend" | "activate" | null;

function StoreActionsMenu({ store, onChanged }: { store: StoreRow; onChanged: () => void }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [remarks, setRemarks] = useState("");

  const go = (sub?: string) =>
    navigate({
      to: "/admin/stores/$id" as never,
      params: { id: store.id } as never,
      search: sub ? ({ tab: sub } as never) : undefined,
    });

  const onSuccess = (msg: string) => () => {
    toast.success(msg);
    setConfirm(null);
    setRemarks("");
    onChanged();
  };
  const onErr = (e: Error) => toast.error(e.message);

  const approveMu = useMutation({ mutationFn: useServerFn(approveTenant), onSuccess: onSuccess("Store approved"), onError: onErr });
  const rejectMu  = useMutation({ mutationFn: useServerFn(rejectTenant),  onSuccess: onSuccess("Store rejected"), onError: onErr });
  const suspendMu = useMutation({ mutationFn: useServerFn(suspendTenant), onSuccess: onSuccess("Store suspended"), onError: onErr });
  const activMu   = useMutation({ mutationFn: useServerFn(activateTenant), onSuccess: onSuccess("Store activated"), onError: onErr });

  const status = (store.status ?? "pending").toLowerCase();
  const busy = approveMu.isPending || rejectMu.isPending || suspendMu.isPending || activMu.isPending;

  const runConfirm = () => {
    const payload = { data: { tenantId: store.id, remarks: remarks || undefined } };
    if (confirm === "approve")  approveMu.mutate(payload);
    if (confirm === "reject")   rejectMu.mutate(payload);
    if (confirm === "suspend")  suspendMu.mutate(payload);
    if (confirm === "activate") activMu.mutate(payload);
  };

  const confirmMeta: Record<Exclude<ConfirmKind, null>, { title: string; desc: string; cta: string; danger?: boolean }> = {
    approve:  { title: "Approve store?", desc: "This will activate the store and provision HQ branch, warehouse and subscription.", cta: "Approve" },
    reject:   { title: "Reject store?",   desc: "The store will be marked as rejected. The owner will not gain access.", cta: "Reject", danger: true },
    suspend:  { title: "Suspend store?",  desc: "Access will be blocked until the store is reactivated.", cta: "Suspend", danger: true },
    activate: { title: "Reactivate store?", desc: "The store will be set to active and regain access.", cta: "Reactivate" },
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => go()}>
            <Eye className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>

          {status === "pending" && (
            <>
              <DropdownMenuItem onClick={() => setConfirm("approve")}>
                <ShieldCheck className="mr-2 h-4 w-4 text-success" /> Approve Store
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirm("reject")} className="text-destructive focus:text-destructive">
                <Ban className="mr-2 h-4 w-4" /> Reject Store
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("edit")}>
                <Pencil className="mr-2 h-4 w-4" /> Edit Store
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("password")}>
                <KeyRound className="mr-2 h-4 w-4" /> Reset Password
              </DropdownMenuItem>
            </>
          )}

          {status === "active" && (
            <>
              <DropdownMenuItem onClick={() => go("edit")}>
                <Pencil className="mr-2 h-4 w-4" /> Edit Store
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("plan")}>
                <CreditCard className="mr-2 h-4 w-4" /> Change Plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("password")}>
                <KeyRound className="mr-2 h-4 w-4" /> Reset Password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => go("subscription")}>
                <History className="mr-2 h-4 w-4" /> Subscription History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("usage")}>
                <BarChart3 className="mr-2 h-4 w-4" /> Usage Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirm("suspend")} className="text-destructive focus:text-destructive">
                <ShieldOff className="mr-2 h-4 w-4" /> Suspend Store
              </DropdownMenuItem>
            </>
          )}

          {status === "suspended" && (
            <>
              <DropdownMenuItem onClick={() => setConfirm("activate")}>
                <ShieldCheck className="mr-2 h-4 w-4 text-success" /> Reactivate Store
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("plan")}>
                <CreditCard className="mr-2 h-4 w-4" /> Change Plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("password")}>
                <KeyRound className="mr-2 h-4 w-4" /> Reset Password
              </DropdownMenuItem>
            </>
          )}

          {status === "expired" && (
            <>
              <DropdownMenuItem onClick={() => go("subscription")}>
                <RefreshCw className="mr-2 h-4 w-4" /> Renew Subscription
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirm("activate")}>
                <ShieldCheck className="mr-2 h-4 w-4 text-success" /> Reactivate Store
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("plan")}>
                <CreditCard className="mr-2 h-4 w-4" /> Change Plan
              </DropdownMenuItem>
            </>
          )}

          {status === "rejected" && (
            <DropdownMenuItem onClick={() => setConfirm("approve")}>
              <ShieldCheck className="mr-2 h-4 w-4 text-success" /> Approve Store
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
                  onClick={runConfirm}
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
    </>
  );
}
