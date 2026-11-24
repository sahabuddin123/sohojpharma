import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/roles")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Roles & Permissions — Super Admin" }] }),
  component: RolesPage,
});

const permissionGroups = [
  { group: "Dashboard", perms: ["view", "export"] },
  { group: "Stores", perms: ["view", "create", "edit", "suspend", "delete", "login_as"] },
  { group: "Payments", perms: ["view", "approve", "reject", "refund"] },
  { group: "Plans", perms: ["view", "create", "edit", "delete"] },
  { group: "Reports", perms: ["view", "export"] },
  { group: "Settings", perms: ["view", "edit"] },
  { group: "Support", perms: ["view", "reply", "close", "assign"] },
];

interface Role {
  id: string;
  name: string;
  users: number;
  description: string;
  enabledPerms: Set<string>;
}

const initialRoles: Role[] = [
  { id: "super_admin", name: "Super Admin", users: 2, description: "Full system access", enabledPerms: new Set(permissionGroups.flatMap((g) => g.perms.map((p) => `${g.group}.${p}`))) },
  { id: "admin", name: "Admin", users: 4, description: "Manage stores, plans and payments", enabledPerms: new Set(["Stores.view","Stores.edit","Stores.suspend","Payments.view","Payments.approve","Plans.view","Plans.edit","Reports.view"]) },
  { id: "support", name: "Support Agent", users: 8, description: "Handle tickets and view tenants", enabledPerms: new Set(["Stores.view","Support.view","Support.reply","Support.close","Support.assign"]) },
];

function RolesPage() {
  const { t } = useTranslation();
  const [roles, setRoles] = useState(initialRoles);
  const [editing, setEditing] = useState<Role | null>(null);

  const toggle = (perm: string) => {
    if (!editing) return;
    const next = new Set(editing.enabledPerms);
    next.has(perm) ? next.delete(perm) : next.add(perm);
    setEditing({ ...editing, enabledPerms: next });
  };

  const save = () => {
    if (!editing) return;
    setRoles((arr) => arr.map((r) => (r.id === editing.id ? editing : r)));
    setEditing(null);
  };

  return (
    <AppShell variant="admin" title={t("nav.roles")}>
      <PageHeader
        title={t("admin.roles.title")}
        description={t("admin.roles.desc")}
        actions={
          <Dialog>
            <DialogTrigger asChild><Button><Plus className="mr-1.5 h-4 w-4" /> {t("admin.roles.newRole")}</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("admin.roles.createRole")}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-2"><Label>{t("admin.roles.roleName")}</Label><Input placeholder={t("admin.roles.roleNamePh")} /></div>
                <div className="space-y-2"><Label>{t("admin.roles.description")}</Label><Input placeholder={t("admin.roles.descPh")} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline">{t("common.cancel")}</Button>
                <Button>{t("admin.roles.createBtn")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => (
          <Card key={r.id} className="shadow-card">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{r.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </div>
                </div>
                <Badge variant="outline">{t("admin.roles.users", { n: r.users })}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("admin.roles.permissions", { n: r.enabledPerms.size })}
              </p>
              <div className="flex flex-wrap gap-1">
                {Array.from(r.enabledPerms).slice(0, 6).map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                ))}
                {r.enabledPerms.size > 6 && <Badge variant="outline" className="text-[10px]">+{r.enabledPerms.size - 6}</Badge>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(r)}>
                  <Pencil className="mr-1.5 h-4 w-4" /> {t("admin.roles.manage")}
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>{t("admin.roles.permsTitle", { name: editing.name })}</DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
                {permissionGroups.map((g) => (
                  <div key={g.group} className="rounded-lg border border-border p-4">
                    <h4 className="mb-3 text-sm font-semibold">{g.group}</h4>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {g.perms.map((p) => {
                        const key = `${g.group}.${p}`;
                        return (
                          <label key={key} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={editing.enabledPerms.has(key)}
                              onCheckedChange={() => toggle(key)}
                            />
                            <span className="capitalize">{p.replace("_", " ")}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
                <Button onClick={save}>{t("admin.roles.saveBtn")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
