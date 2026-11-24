import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, Check, X, Pause, Play } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  listTenantsByStatus,
  approveTenant,
  rejectTenant,
  suspendTenant,
  activateTenant,
  getApprovalLogs,
  type TenantStatus,
} from "@/lib/api/saas-approval.functions";

type Action = "approve" | "reject" | "suspend" | "activate";

const STATUS_TONE: Record<TenantStatus, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  suspended: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  expired: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export function TenantApprovalTable({
  status,
  allowed,
}: {
  status: TenantStatus;
  allowed: Action[];
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const listFn = useServerFn(listTenantsByStatus);
  const approveFn = useServerFn(approveTenant);
  const rejectFn = useServerFn(rejectTenant);
  const suspendFn = useServerFn(suspendTenant);
  const activateFn = useServerFn(activateTenant);
  const logsFn = useServerFn(getApprovalLogs);

  const { data, isLoading } = useQuery({
    queryKey: ["saas-approval", "list", status],
    queryFn: () => listFn({ data: { status } }),
  });

  const [open, setOpen] = useState<null | { action: Action; tenantId: string; name: string }>(null);
  const [history, setHistory] = useState<null | { tenantId: string; name: string }>(null);
  const [remarks, setRemarks] = useState("");
  const [planId, setPlanId] = useState<string>("");
  const [durationMonths, setDurationMonths] = useState<string>("0");

  const { data: plansList = [] } = useQuery({
    queryKey: ["plans-for-approval"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, code, price_bdt, trial_days")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: async (params: { action: Action; tenantId: string; remarks: string; planId?: string; durationMonths?: number }) => {
      if (params.action === "approve") {
        return approveFn({
          data: {
            tenantId: params.tenantId,
            remarks: params.remarks,
            planId: params.planId || undefined,
            durationMonths: params.durationMonths ?? 0,
          },
        });
      }
      const arg = { data: { tenantId: params.tenantId, remarks: params.remarks } };
      switch (params.action) {
        case "reject": return rejectFn(arg);
        case "suspend": return suspendFn(arg);
        case "activate": return activateFn(arg);
      }
    },
    onSuccess: () => {
      toast.success(t("saas.approval.toast.success"));
      setOpen(null);
      setRemarks("");
      setPlanId("");
      setDurationMonths("0");
      qc.invalidateQueries({ queryKey: ["saas-approval"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const logsQ = useQuery({
    enabled: !!history,
    queryKey: ["saas-approval", "logs", history?.tenantId],
    queryFn: () => logsFn({ data: { tenantId: history!.tenantId } }),
  });

  const dateFmt = (s: string) =>
    new Date(s).toLocaleString(i18n.language === "bn" ? "bn-BD" : "en-US");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`saas.approval.lists.${status}`)}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">{t("saas.approval.empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("saas.approval.col.store")}</TableHead>
                <TableHead>{t("saas.approval.col.owner")}</TableHead>
                <TableHead>{t("saas.approval.col.contact")}</TableHead>
                <TableHead>{t("saas.approval.col.plan")}</TableHead>
                <TableHead>{t("saas.approval.col.status")}</TableHead>
                <TableHead>{t("saas.approval.col.created")}</TableHead>
                <TableHead className="text-right">{t("saas.approval.col.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data!.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">{row.slug}</div>
                  </TableCell>
                  <TableCell>{row.owner_name ?? "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{row.email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.mobile ?? row.phone ?? ""}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{row.plan}</Badge></TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_TONE[row.status as TenantStatus]}`}>
                      {t(`saas.approval.status.${row.status}`)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{dateFmt(row.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {allowed.includes("approve") && (
                        <Button size="sm" variant="default" onClick={() => setOpen({ action: "approve", tenantId: row.id, name: row.name })}>
                          <Check className="h-3.5 w-3.5" /> {t("saas.approval.action.approve")}
                        </Button>
                      )}
                      {allowed.includes("reject") && (
                        <Button size="sm" variant="destructive" onClick={() => setOpen({ action: "reject", tenantId: row.id, name: row.name })}>
                          <X className="h-3.5 w-3.5" /> {t("saas.approval.action.reject")}
                        </Button>
                      )}
                      {allowed.includes("suspend") && (
                        <Button size="sm" variant="outline" onClick={() => setOpen({ action: "suspend", tenantId: row.id, name: row.name })}>
                          <Pause className="h-3.5 w-3.5" /> {t("saas.approval.action.suspend")}
                        </Button>
                      )}
                      {allowed.includes("activate") && (
                        <Button size="sm" variant="default" onClick={() => setOpen({ action: "activate", tenantId: row.id, name: row.name })}>
                          <Play className="h-3.5 w-3.5" /> {t("saas.approval.action.activate")}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setHistory({ tenantId: row.id, name: row.name })}>
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Action dialog */}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) { setOpen(null); setRemarks(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {open && t(`saas.approval.dialog.${open.action}.title`, { name: open.name })}
            </DialogTitle>
            <DialogDescription>
              {open && t(`saas.approval.dialog.${open.action}.desc`)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {open?.action === "approve" && (
              <>
                <div className="space-y-2">
                  <Label>Assign Plan (প্ল্যান নির্ধারণ করুন)</Label>
                  <Select value={planId} onValueChange={setPlanId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a plan (Default: Basic)" />
                    </SelectTrigger>
                    <SelectContent>
                      {plansList.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} {p.price_bdt > 0 ? `(৳ ${Number(p.price_bdt).toLocaleString("en-IN")}/mo)` : "(Custom/Free)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Subscription Duration (মেয়াদ)</Label>
                  <Select value={durationMonths} onValueChange={setDurationMonths}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">৭ দিনের ফ্রি ট্রায়াল (7-Day Free Trial)</SelectItem>
                      <SelectItem value="1">১ মাস (1 Month)</SelectItem>
                      <SelectItem value="3">৩ মাস (3 Months)</SelectItem>
                      <SelectItem value="6">৬ মাস (6 Months)</SelectItem>
                      <SelectItem value="12">১ বছর (1 Year / 12 Months)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>{t("saas.approval.remarks")}</Label>
              <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} placeholder={t("saas.approval.remarksPh")} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(null); setRemarks(""); setPlanId(""); setDurationMonths("0"); }}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={mut.isPending}
              onClick={() => open && mut.mutate({
                action: open.action,
                tenantId: open.tenantId,
                remarks,
                planId: open.action === "approve" ? (planId || undefined) : undefined,
                durationMonths: open.action === "approve" ? Number(durationMonths) : undefined,
              })}
            >
              {t(`saas.approval.action.${open?.action ?? "approve"}`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!history} onOpenChange={(o) => { if (!o) setHistory(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("saas.approval.history.title", { name: history?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {logsQ.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : (logsQ.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t("saas.approval.history.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("saas.approval.col.when")}</TableHead>
                    <TableHead>{t("saas.approval.col.action")}</TableHead>
                    <TableHead>{t("saas.approval.col.from")}</TableHead>
                    <TableHead>{t("saas.approval.col.to")}</TableHead>
                    <TableHead>{t("saas.approval.col.remarks")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsQ.data!.map((l: any) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{dateFmt(l.created_at)}</TableCell>
                      <TableCell>{t(`saas.approval.action.${l.action}`, { defaultValue: l.action })}</TableCell>
                      <TableCell>{l.from_status ? t(`saas.approval.status.${l.from_status}`) : "—"}</TableCell>
                      <TableCell>{t(`saas.approval.status.${l.to_status}`)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.remarks ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
