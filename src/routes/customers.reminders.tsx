import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import {
  dueRemindersPreview, sendDueReminders, reminderHistory,
} from "@/lib/api/customer-analytics.functions";
import { Loader2, Send } from "lucide-react";

export const Route = createFileRoute("/customers/reminders")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Reminders — SohojPharma" }] }),
  component: Page,
});

const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const BUCKET_LABEL: Record<string, string> = {
  due_7: "7+ days", due_15: "15+ days", due_30: "30+ days", due_60: "60+ days",
};
const BUCKET_TONE: Record<string, string> = {
  due_7: "border-warning/30 bg-warning/10 text-warning",
  due_15: "border-warning/30 bg-warning/10 text-warning",
  due_30: "border-destructive/30 bg-destructive/10 text-destructive",
  due_60: "border-destructive/30 bg-destructive/10 text-destructive",
};

function Page() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const previewFn = useServerFn(dueRemindersPreview);
  const sendFn = useServerFn(sendDueReminders);
  const historyFn = useServerFn(reminderHistory);

  const preview = useQuery({
    queryKey: ["due-reminders-preview", tenantId],
    queryFn: () => previewFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });
  const history = useQuery({
    queryKey: ["reminder-history", tenantId],
    queryFn: () => historyFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  const items = preview.data ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allKey = useMemo(() => items.map((i) => `${i.customer_id}:${i.bucket}`), [items]);
  const allSelected = allKey.length > 0 && allKey.every((k) => selected.has(k));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allKey));
  };
  const toggle = (k: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const mut = useMutation({
    mutationFn: async () => {
      const payload = items
        .filter((i) => selected.has(`${i.customer_id}:${i.bucket}`))
        .map((i) => ({
          customerId: i.customer_id,
          bucket: i.bucket,
          dueAmount: i.due_amount,
          ageDays: i.age_days,
        }));
      if (payload.length === 0) throw new Error("Select at least one customer");
      return sendFn({ data: { tenantId, items: payload } });
    },
    onSuccess: (r) => {
      toast.success(`Sent ${r.count} in-app reminder${r.count === 1 ? "" : "s"}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["reminder-history", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = items.reduce<Record<string, number>>((a, i) => ({ ...a, [i.bucket]: (a[i.bucket] ?? 0) + 1 }), {});

  return (
    <AppShell variant="store">
      <PageHeader
        title="Due Reminders"
        description="Send in-app reminders to customers with outstanding dues"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["due_7", "due_15", "due_30", "due_60"] as const).map((b) => (
          <Card key={b}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{BUCKET_LABEL[b]}</div>
            <div className="mt-1 text-2xl font-bold">{counts[b] ?? 0}</div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="pending" className="mt-6">
        <TabsList>
          <TabsTrigger value="pending">Pending ({items.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Customers with overdue dues</CardTitle>
              <Button onClick={() => mut.mutate()} disabled={mut.isPending || selected.size === 0}>
                {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            </CardHeader>
            <CardContent>
              {preview.isLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Bucket</TableHead>
                      <TableHead className="text-right">Age (days)</TableHead>
                      <TableHead className="text-right">Due Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => {
                      const k = `${i.customer_id}:${i.bucket}`;
                      return (
                        <TableRow key={`${k}:${i.sale_id}`}>
                          <TableCell><Checkbox checked={selected.has(k)} onCheckedChange={() => toggle(k)} /></TableCell>
                          <TableCell>
                            <div className="font-medium">{i.customer_name}</div>
                            <div className="text-xs text-muted-foreground">{i.phone ?? "—"}</div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className={BUCKET_TONE[i.bucket]}>{BUCKET_LABEL[i.bucket]}</Badge></TableCell>
                          <TableCell className="text-right">{i.age_days}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt2(i.due_amount)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {items.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No customers in overdue buckets.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sent At</TableHead><TableHead>Type</TableHead>
                    <TableHead>Channel</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead><TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(history.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{new Date(r.sent_at).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{BUCKET_LABEL[r.reminder_type] ?? r.reminder_type}</Badge></TableCell>
                      <TableCell className="capitalize">{r.channel.replace("_", " ")}</TableCell>
                      <TableCell><Badge variant={r.status === "sent" ? "default" : "destructive"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-right">{r.amount != null ? fmt2(Number(r.amount)) : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.message ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {(history.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No reminders sent yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
