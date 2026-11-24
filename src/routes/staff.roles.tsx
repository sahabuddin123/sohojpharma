import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { Shield, ShieldAlert, Check, UserCheck, Percent, CreditCard, Ban, Box, Eye, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/roles")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Roles & Permissions — SohojPharma" }] }),
  component: RolesPage,
});

const SIX_PERMISSIONS = [
  { id: "discount", label: "ছাড় দেওয়া (Discount)", desc: "বিক্রির সময় ডিসকাউন্ট বা পার্সেন্টেজ ছাড় দেওয়ার অনুমতি।", icon: Percent },
  { id: "credit_sale", label: "বাকিতে বিক্রি (Credit Sale)", desc: "কাস্টমারকে বাকি রেখে চালান তৈরি করার অনুমতি।", icon: CreditCard },
  { id: "void_sale", label: "বিক্রয় বাতিল (Void/Cancel Sale)", desc: "সম্পন্ন হওয়া বিক্রয় বিল বাতিল বা রিফান্ড করার অনুমতি।", icon: Ban },
  { id: "grn_receive", label: "স্টক গ্রহণ (Receive Stock / GRN)", desc: "সাপ্লায়ারের চালান বুঝে নেওয়া এবং গোডাউনে স্টক তোলার অনুমতি।", icon: Box },
  { id: "view_cost", label: "ক্রয়মূল্য দেখা (View Purchase Price & Profit)", desc: "ওষুধের পাইকারি কেনা দাম এবং শতকরা লাভ দেখার অনুমতি।", icon: Eye },
  { id: "day_close", label: "দিন শেষ করা (Day Close & Cash Reconciliation)", desc: "ক্যাশ ড্রয়ার মিলিয়ে রেজিস্টার বন্ধ করার অনুমতি।", icon: Lock },
];

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
  const [selectedRole, setSelectedRole] = useState(roles[2]); // Cashier default
  const [simplePerms, setSimplePerms] = useState<Record<string, Record<string, boolean>>>({
    Cashier: { discount: true, credit_sale: false, void_sale: false, grn_receive: false, view_cost: false, day_close: true },
    Manager: { discount: true, credit_sale: true, void_sale: true, grn_receive: true, view_cost: true, day_close: true },
    Pharmacist: { discount: true, credit_sale: false, void_sale: false, grn_receive: true, view_cost: false, day_close: false },
    "Store Keeper": { discount: false, credit_sale: false, void_sale: false, grn_receive: true, view_cost: true, day_close: false },
  });

  const toggleSimplePerm = (role: string, permId: string) => {
    setSimplePerms((prev) => ({
      ...prev,
      [role]: {
        ...(prev[role] || {}),
        [permId]: !prev[role]?.[permId],
      },
    }));
    toast.success("অনুমতি আপডেট হয়েছে");
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('ops.staff.roles.title')} description={t('ops.staff.roles.desc')} />

      {/* 6 Essential Staff Permissions Card */}
      <Card className="shadow-card border-emerald-500/30 bg-gradient-to-br from-emerald-50/30 to-background dark:from-emerald-950/10">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-600" /> ৬টি স্পষ্ট ফার্মেসি অনুমতি (Simple Staff Controls)
              </CardTitle>
              <CardDescription className="text-xs">
                জটিল পারমিশন ম্যাট্রিক্স ছাড়াই কর্মচারীদের জরুরি ৬টি কাজ এক ক্লিকে নিয়ন্ত্রণ করুন।
              </CardDescription>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {roles.filter(r => r !== "Owner").map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedRole(r)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                    selectedRole === r
                      ? "bg-emerald-700 text-white border-emerald-700 shadow-2xs"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SIX_PERMISSIONS.map((perm) => {
              const Icon = perm.icon;
              const isEnabled = selectedRole === "Owner" ? true : Boolean(simplePerms[selectedRole]?.[perm.id]);
              return (
                <div
                  key={perm.id}
                  className={`flex items-start justify-between p-3 rounded-xl border transition-all ${
                    isEnabled
                      ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/20 shadow-2xs"
                      : "border-border bg-card opacity-80"
                  }`}
                >
                  <div className="space-y-1 pr-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                      <Icon className={`h-4 w-4 ${isEnabled ? "text-emerald-600" : "text-muted-foreground"}`} />
                      {perm.label}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">{perm.desc}</p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    disabled={selectedRole === "Owner"}
                    onCheckedChange={() => toggleSimplePerm(selectedRole, perm.id)}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Advanced Matrix Accordion / Tabs */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          বিস্তারিত পারমিশন ম্যাট্রিক্স (Advanced Matrix)
        </h3>
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
      </div>
    </div>
  );
}
