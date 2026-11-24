import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Pencil, Power, Building2, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  listBranches, createBranch, setBranchActive, getBranchPlanInfo,
  type BranchRow, type BranchRole,
} from "@/lib/api/branches.functions";

export const Route = createFileRoute("/settings/branches")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Branches — SohojPharma" }] }),
  component: BranchesPage,
});

function parsePlanError(msg: string): { code: string; limit: number } | null {
  try {
    const j = JSON.parse(msg);
    if (j?.code === "PLAN_LIMIT_BRANCHES") return j;
  } catch { /* ignore */ }
  return null;
}

function BranchesPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const listFn = useServerFn(listBranches);
  const planFn = useServerFn(getBranchPlanInfo);

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["branches-mgmt", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenant_id: tenantId } }),
  });

  const { data: plan } = useQuery({
    queryKey: ["branch-plan", tenantId],
    enabled: !!tenantId,
    queryFn: () => planFn({ data: { tenant_id: tenantId } }),
  });

  const [open, setOpen] = useState(false);

  const toggleFn = useServerFn(setBranchActive);
  const toggle = useMutation({
    mutationFn: (v: { branch_id: string; is_active: boolean }) => toggleFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(t(v.is_active ? "audit.branch.enabled" : "audit.branch.disabled"));
      qc.invalidateQueries({ queryKey: ["branches-mgmt", tenantId] });
      qc.invalidateQueries({ queryKey: ["branches-active", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const usage = plan
    ? plan.max_branches === null
      ? `${plan.current_count} (${t("settings.branches.unlimited")})`
      : `${plan.current_count} / ${plan.max_branches}`
    : "—";

  return (
    <AppShell variant="store" title={t("settings.branches.title")}>
      <PageHeader
        title={t("settings.branches.title")}
        description={t("settings.branches.desc")}
        actions={
          <div className="flex items-center gap-2">
            {plan && (
              <Badge variant="secondary" className="gap-1">
                {t("settings.branches.plan")}: {plan.plan_name ?? "—"} · {t("settings.branches.branchUsage")} {usage}
              </Badge>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button disabled={!plan?.can_create}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("settings.branches.newBranch")}
                </Button>
              </DialogTrigger>
              <CreateBranchDialog
                tenantId={tenantId}
                branches={branches}
                onCreated={() => {
                  setOpen(false);
                  qc.invalidateQueries({ queryKey: ["branches-mgmt", tenantId] });
                  qc.invalidateQueries({ queryKey: ["branch-plan", tenantId] });
                  qc.invalidateQueries({ queryKey: ["branches-active", tenantId] });
                }}
                planName={plan?.plan_name ?? null}
                maxBranches={plan?.max_branches ?? null}
              />
            </Dialog>
          </div>
        }
      />

      <Card className="shadow-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("settings.branches.name")}</TableHead>
                  <TableHead>{t("settings.branches.code")}</TableHead>
                  <TableHead>{t("settings.branches.role")}</TableHead>
                  <TableHead>{t("settings.branches.phone")}</TableHead>
                  <TableHead>{t("settings.branches.members")}</TableHead>
                  <TableHead>{t("settings.branches.status")}</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {b.name}
                      </div>
                    </TableCell>
                    <TableCell><code className="text-xs">{b.code}</code></TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(`settings.branches.${roleKey(b.branch_role)}`)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.phone ?? "—"}</TableCell>
                    <TableCell>{b.member_count}</TableCell>
                    <TableCell>
                      <Badge variant={b.is_active ? "default" : "secondary"}>
                        {t(b.is_active ? "settings.branches.active" : "settings.branches.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/settings/branches/$branchId" params={{ branchId: b.id }}>
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          {t("settings.branches.details")}
                          <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggle.mutate({ branch_id: b.id, is_active: !b.is_active })}
                        disabled={!plan?.can_create}
                      >
                        <Power className="mr-1 h-3.5 w-3.5" />
                        {t(b.is_active ? "settings.branches.disable" : "settings.branches.enable")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {branches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      —
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function roleKey(r: BranchRole) {
  return r === "head_office" ? "headOffice" : r === "sub_branch" ? "subBranch" : "branch";
}

function CreateBranchDialog({
  tenantId, branches, onCreated, planName, maxBranches,
}: {
  tenantId: string;
  branches: BranchRow[];
  onCreated: () => void;
  planName: string | null;
  maxBranches: number | null;
}) {
  const { t } = useTranslation();
  const createFn = useServerFn(createBranch);
  const [form, setForm] = useState({
    name: "", code: "", branch_role: "branch" as BranchRole,
    parent_branch_id: "" as string,
    phone: "", email: "", address: "",
  });
  const mut = useMutation({
    mutationFn: () => createFn({
      data: {
        tenant_id: tenantId,
        name: form.name.trim(),
        code: form.code.trim(),
        branch_role: form.branch_role,
        parent_branch_id: form.parent_branch_id || null,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
      },
    }),
    onSuccess: () => { toast.success(t("audit.branch.created")); onCreated(); },
    onError: (e: Error) => {
      const lim = parsePlanError(e.message);
      if (lim) {
        const msg = planName
          ? t("errors.plan_limit_branches", { plan: planName, max: maxBranches ?? lim.limit })
          : t("errors.plan_limit_branches_unknown");
        toast.error(msg);
        return;
      }
      toast.error(e.message);
    },
  });
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{t("settings.branches.createBranch")}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>{t("settings.branches.name")}</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>{t("settings.branches.code")}</Label>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        <div>
          <Label>{t("settings.branches.role")}</Label>
          <Select value={form.branch_role} onValueChange={(v) => setForm({ ...form, branch_role: v as BranchRole })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="head_office">{t("settings.branches.headOffice")}</SelectItem>
              <SelectItem value="branch">{t("settings.branches.branch")}</SelectItem>
              <SelectItem value="sub_branch">{t("settings.branches.subBranch")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>{t("settings.branches.parent")}</Label>
          <Select
            value={form.parent_branch_id || "__none__"}
            onValueChange={(v) => setForm({ ...form, parent_branch_id: v === "__none__" ? "" : v })}
          >
            <SelectTrigger><SelectValue placeholder={t("settings.branches.none")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("settings.branches.none")}</SelectItem>
              {branches.filter((b) => b.branch_role !== "sub_branch").map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>{t("settings.branches.phone")}</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div><Label>{t("settings.branches.email")}</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="col-span-2"><Label>{t("settings.branches.address")}</Label>
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => mut.mutate()} disabled={!form.name || !form.code || mut.isPending}>
          {t("settings.branches.saveBranch")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
