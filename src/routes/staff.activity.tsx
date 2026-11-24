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
  "Sale Created": "bg-success/15 text-success",
  "Stock Updated": "bg-primary/15 text-primary",
  "Purchase Created": "bg-secondary/15 text-secondary",
  "Expense Added": "bg-warning/15 text-warning",
  "Product Updated": "bg-primary/15 text-primary",
  "Product Added": "bg-success/15 text-success",
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
