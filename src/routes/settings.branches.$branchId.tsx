import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Save, UserPlus, X } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import {
  listBranches, updateBranch,
  listBranchMembers, listAssignableMembers, assignMemberDefaultBranch,
  listBranchAudit,
  type BranchRole,
} from "@/lib/api/branches.functions";

export const Route = createFileRoute("/settings/branches/$branchId")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Branch Details — SohojPharma" }] }),
  component: BranchDetailsPage,
});

function BranchDetailsPage() {
  const { t } = useTranslation();
  const { branchId } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const listFn = useServerFn(listBranches);
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-mgmt", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenant_id: tenantId } }),
  });
  const branch = branches.find((b) => b.id === branchId);

  return (
    <AppShell variant="store" title={branch?.name ?? t("settings.branches.details")}>
      <PageHeader
        title={branch?.name ?? "—"}
        description={branch?.code}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/branches">
              <ArrowLeft className="mr-1 h-4 w-4" />{t("settings.branches.title")}
            </Link>
          </Button>
        }
      />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t("settings.branches.general")}</TabsTrigger>
          <TabsTrigger value="members">{t("settings.branches.membersTab")}</TabsTrigger>
          <TabsTrigger value="audit">{t("settings.branches.auditTab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="mt-4">
          {branch && <GeneralTab branchId={branch.id} tenantId={tenantId} initial={branch} />}
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersTab branchId={branchId} tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab branchId={branchId} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function GeneralTab({ branchId, tenantId, initial }: {
  branchId: string; tenantId: string;
  initial: { name: string; branch_role: BranchRole; parent_branch_id: string | null;
    phone: string | null; email: string | null; address: string | null };
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateBranch);
  const listFn = useServerFn(listBranches);
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-mgmt", tenantId],
    queryFn: () => listFn({ data: { tenant_id: tenantId } }),
  });
  const [form, setForm] = useState({
    name: initial.name,
    branch_role: initial.branch_role,
    parent_branch_id: initial.parent_branch_id ?? "",
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    address: initial.address ?? "",
  });
  const mut = useMutation({
    mutationFn: () => updateFn({
      data: {
        branch_id: branchId,
        patch: {
          name: form.name,
          branch_role: form.branch_role,
          parent_branch_id: form.parent_branch_id || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
        },
      },
    }),
    onSuccess: () => {
      toast.success(t("audit.branch.updated"));
      qc.invalidateQueries({ queryKey: ["branches-mgmt", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card><CardContent className="grid grid-cols-2 gap-4 p-6">
      <div className="col-span-2"><Label>{t("settings.branches.name")}</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
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
      <div>
        <Label>{t("settings.branches.parent")}</Label>
        <Select
          value={form.parent_branch_id || "__none__"}
          onValueChange={(v) => setForm({ ...form, parent_branch_id: v === "__none__" ? "" : v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">{t("settings.branches.none")}</SelectItem>
            {branches.filter((b) => b.id !== branchId && b.branch_role !== "sub_branch").map((b) => (
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
      <div className="col-span-2 flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Save className="mr-2 h-4 w-4" />{t("settings.branches.saveBranch")}
        </Button>
      </div>
    </CardContent></Card>
  );
}

function MembersTab({ branchId, tenantId }: { branchId: string; tenantId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const membersFn = useServerFn(listBranchMembers);
  const allFn = useServerFn(listAssignableMembers);
  const assignFn = useServerFn(assignMemberDefaultBranch);

  const { data: members = [] } = useQuery({
    queryKey: ["branch-members", branchId],
    queryFn: () => membersFn({ data: { branch_id: branchId } }),
  });
  const { data: all = [] } = useQuery({
    queryKey: ["assignable-members", tenantId],
    enabled: !!tenantId,
    queryFn: () => allFn({ data: { tenant_id: tenantId } }),
  });
  const [pick, setPick] = useState<string>("");

  const assign = useMutation({
    mutationFn: (v: { user_id: string; branch_id: string | null }) => assignFn({
      data: { tenant_id: tenantId, user_id: v.user_id, branch_id: v.branch_id },
    }),
    onSuccess: (_d, v) => {
      toast.success(t(v.branch_id ? "audit.branch.member_assigned" : "audit.branch.member_removed"));
      qc.invalidateQueries({ queryKey: ["branch-members", branchId] });
      qc.invalidateQueries({ queryKey: ["assignable-members", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const candidates = all.filter((m) => m.default_branch_id !== branchId);

  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label>{t("settings.branches.selectUser")}</Label>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {candidates.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.full_name ?? m.user_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => pick && assign.mutate({ user_id: pick, branch_id: branchId })}
          disabled={!pick || assign.isPending}
        >
          <UserPlus className="mr-2 h-4 w-4" />{t("settings.branches.assignMember")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("settings.branches.name")}</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.user_id}>
              <TableCell>{m.full_name ?? m.user_id.slice(0, 8)}</TableCell>
              <TableCell><Badge variant="outline">{m.role ?? "—"}</Badge></TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm" variant="ghost"
                  onClick={() => assign.mutate({ user_id: m.user_id, branch_id: null })}
                >
                  <X className="mr-1 h-3.5 w-3.5" />{t("settings.branches.removeMember")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {members.length === 0 && (
            <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
              {t("settings.branches.noMembers")}
            </TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function AuditTab({ branchId }: { branchId: string }) {
  const auditFn = useServerFn(listBranchAudit);
  const { data: rows = [] } = useQuery({
    queryKey: ["branch-audit", branchId],
    queryFn: () => auditFn({ data: { branch_id: branchId } }),
  });
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader>
          <TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>User</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
              <TableCell><code className="text-xs">{r.action}</code></TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.user_id?.slice(0, 8) ?? "—"}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">—</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
