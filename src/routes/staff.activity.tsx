import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/staff/activity")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Activity Log — SohojPharma" }] }),
  component: ActivityPage,
});

const logs = [
  { time: "16:48", user: "Sumon Ahmed", action: "Sale Created", entity: "INV-10428 · ৳ 8,420", device: "Web", ip: "103.99.x.x" },
  { time: "16:30", user: "Rina Khatun", action: "Stock Updated", entity: "Napa Extra +200", device: "Mobile", ip: "192.168.x.x" },
  { time: "15:22", user: "Karim Hossain", action: "Purchase Created", entity: "Beximco · ৳ 18,400", device: "Web", ip: "103.99.x.x" },
  { time: "14:11", user: "Tania Akter", action: "Expense Added", entity: "Electricity · ৳ 4,200", device: "Web", ip: "203.76.x.x" },
  { time: "11:05", user: "Maliha Noor", action: "Product Updated", entity: "Seclo 20mg price", device: "Web", ip: "103.99.x.x" },
  { time: "09:30", user: "Karim Hossain", action: "Product Added", entity: "Maxpro 20mg", device: "Mobile", ip: "192.168.x.x" },
];

const tone: Record<string, string> = {
  "Sale Created": "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
  "Stock Updated": "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300",
  "Purchase Created": "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "Expense Added": "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
  "Product Updated": "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300",
  "Product Added": "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
};

function ActivityPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("ops.staff.activity.title")} description={t("ops.staff.activity.desc")} />
      <div className="mb-3 flex max-w-sm items-center gap-2 rounded-md border border-border/60 px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("ops.staff.activity.searchPh")} className="border-0 focus-visible:ring-0" />
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("ops.staff.activity.todayActivity")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ops.staff.activity.colTime")}</TableHead>
                <TableHead>{t("ops.staff.activity.colUser")}</TableHead>
                <TableHead>{t("ops.staff.activity.colAction")}</TableHead>
                <TableHead>{t("ops.staff.activity.colEntity")}</TableHead>
                <TableHead>{t("ops.staff.activity.colDevice")}</TableHead>
                <TableHead>{t("ops.staff.activity.colIp")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-muted-foreground">{l.time}</TableCell>
                  <TableCell className="font-medium">{l.user}</TableCell>
                  <TableCell><Badge className={tone[l.action]}>{l.action}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{l.entity}</TableCell>
                  <TableCell>{l.device}</TableCell>
                  <TableCell className="text-muted-foreground">{l.ip}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
