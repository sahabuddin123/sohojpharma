import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Check, X } from "lucide-react";

export const Route = createFileRoute("/staff/leave")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Leave — SohojPharma" }] }),
  component: LeavePage,
});

const requests = [
  { emp: "Joshim Ali", type: "Sick Leave", from: "2026-06-12", to: "2026-06-16", days: 5, status: "Approved", approver: "Manager" },
  { emp: "Sumon Ahmed", type: "Casual Leave", from: "2026-06-20", to: "2026-06-21", days: 2, status: "Pending", approver: "Manager" },
  { emp: "Rina Khatun", type: "Annual Leave", from: "2026-07-01", to: "2026-07-07", days: 7, status: "Pending", approver: "Owner" },
  { emp: "Maliha Noor", type: "Emergency Leave", from: "2026-05-22", to: "2026-05-22", days: 1, status: "Rejected", approver: "Manager" },
];

const tone: Record<string, string> = {
  Approved: "bg-success/15 text-success",
  Pending: "bg-warning/15 text-warning",
  Rejected: "bg-destructive/15 text-destructive",
};

function LeavePage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("ops.staff.leave.title")} description={t("ops.staff.leave.desc")} actions={<ApplyLeaveDialog />} />
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("ops.staff.leave.leaveRequests")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("ops.staff.leave.colEmployee")}</TableHead>
              <TableHead>{t("ops.staff.leave.colType")}</TableHead>
              <TableHead>{t("ops.staff.leave.colFrom")}</TableHead>
              <TableHead>{t("ops.staff.leave.colTo")}</TableHead>
              <TableHead className="text-right">{t("ops.staff.leave.colDays")}</TableHead>
              <TableHead>{t("ops.staff.leave.colApprover")}</TableHead>
              <TableHead>{t("ops.staff.leave.colStatus")}</TableHead>
              <TableHead className="text-right">{t("ops.staff.leave.colActions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {requests.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{r.emp}</TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell>{r.from}</TableCell>
                  <TableCell>{r.to}</TableCell>
                  <TableCell className="text-right">{r.days}</TableCell>
                  <TableCell>{r.approver}</TableCell>
                  <TableCell><Badge className={tone[r.status]}>{r.status}</Badge></TableCell>
                  <TableCell className="space-x-1 text-right">
                    {r.status === "Pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="text-success"><Check className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive"><X className="h-4 w-4" /></Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function ApplyLeaveDialog() {
  const { t } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger asChild><Button><Plus className="mr-1.5 h-4 w-4" /> {t("ops.staff.leave.applyForLeave")}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("ops.staff.leave.applyForLeave")}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>{t("ops.staff.leave.leaveType")}</Label>
            <Select><SelectTrigger><SelectValue placeholder={t("common.search")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">{t("ops.staff.leave.casual")}</SelectItem>
                <SelectItem value="sick">{t("ops.staff.leave.sick")}</SelectItem>
                <SelectItem value="annual">{t("ops.staff.leave.annual")}</SelectItem>
                <SelectItem value="emergency">{t("ops.staff.leave.emergency")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("ops.staff.leave.from")}</Label><Input type="date" /></div>
            <div><Label>{t("ops.staff.leave.to")}</Label><Input type="date" /></div>
          </div>
          <div><Label>{t("ops.staff.leave.reason")}</Label><Textarea rows={3} /></div>
        </div>
        <DialogFooter><Button>{t("ops.staff.leave.submitRequest")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
