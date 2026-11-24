import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/staff/roles")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Roles & Permissions — SohojPharma" }] }),
  component: RolesPage,
});

const modules = ["Dashboard", "Products", "Inventory", "Purchase", "Sales", "Customers", "Suppliers", "Expenses", "Accounts", "Reports", "Staff", "Settings", "Subscriptions"];
const actions = ["View", "Create", "Edit", "Delete", "Approve", "Export"];
const roles = ["Owner", "Manager", "Cashier", "Pharmacist", "Store Keeper", "Accountant"];

// preset permissions per role for demo
const preset: Record<string, Record<string, string[]>> = {
  Owner: Object.fromEntries(modules.map((m) => [m, actions])),
  Manager: Object.fromEntries(modules.map((m) => [m, ["View", "Create", "Edit", "Approve", "Export"]])),
  Cashier: { Dashboard: ["View"], Sales: ["View", "Create"], Customers: ["View", "Create"], Products: ["View"] },
  Pharmacist: { Dashboard: ["View"], Products: ["View", "Edit"], Inventory: ["View", "Edit"], Sales: ["View", "Create"] },
  "Store Keeper": { Dashboard: ["View"], Products: ["View"], Inventory: ["View", "Create", "Edit"], Purchase: ["View", "Create"] },
  Accountant: { Dashboard: ["View"], Accounts: actions, Expenses: actions, Reports: ["View", "Export"] },
};

function RolesPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('ops.staff.roles.title')} description={t('ops.staff.roles.desc')} />
      <Tabs defaultValue={roles[0]}>
        <TabsList className="flex-wrap">{roles.map((r) => <TabsTrigger key={r} value={r}>{r}</TabsTrigger>)}</TabsList>
        {roles.map((r) => {
          const rolePerms = preset[r] ?? {};
          return (
            <TabsContent key={r} value={r} className="mt-4">
              <Card className="shadow-card"><CardHeader><CardTitle className="text-base">{t('ops.staff.roles.permissionsFor', { role: r })}</CardTitle></CardHeader><CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left">
                      <th className="w-48 py-2">{t('ops.staff.roles.colModule')}</th>
                      {actions.map((a) => <th key={a} className="px-3 py-2 text-center font-medium text-muted-foreground">{a}</th>)}
                    </tr></thead>
                    <tbody>
                      {modules.map((m) => {
                        const allowed = rolePerms[m] ?? [];
                        return (
                          <tr key={m} className="border-b border-border/40">
                            <td className="py-2 font-medium">{m}</td>
                            {actions.map((a) => (
                              <td key={a} className="px-3 py-2 text-center">
                                <Checkbox defaultChecked={allowed.includes(a)} disabled={r === "Owner"} />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent></Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </>
  );
}
