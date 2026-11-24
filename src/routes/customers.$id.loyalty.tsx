import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import {
  customerPointsList, recordCustomerPoints,
} from "@/lib/api/customer-analytics.functions";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/customers/$id/loyalty")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Loyalty — SohojPharma" }] }),
  component: Page,
});

const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function Page() {
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const listFn = useServerFn(customerPointsList);
  const recordFn = useServerFn(recordCustomerPoints);

  const q = useQuery({
    queryKey: ["customer-points", tenantId, id],
    queryFn: () => listFn({ data: { tenantId, customerId: id } }),
    enabled: !!tenantId,
  });

  const [tab, setTab] = useState<"earn" | "redeem">("earn");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const v = Number(amount);
      if (!v || v <= 0) throw new Error("Enter a valid amount");
      return recordFn({
        data: {
          tenantId,
          customerId: id,
          earned: tab === "earn" ? v : 0,
          used: tab === "redeem" ? v : 0,
          note: note || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success(tab === "earn" ? "Points earned" : "Points redeemed");
      setAmount(""); setNote("");
      qc.invalidateQueries({ queryKey: ["customer-points", tenantId, id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell variant="store">
      <PageHeader
        title="Loyalty Points"
        actions={<Button asChild variant="outline" size="sm"><Link to="/customers/$id" params={{ id }}>Back to customer</Link></Button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className="mt-1 text-2xl font-bold">{fmt2(q.data?.balance ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Earned</div>
          <div className="mt-1 text-2xl font-bold text-success">{fmt2(q.data?.totalEarned ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Redeemed</div>
          <div className="mt-1 text-2xl font-bold text-destructive">{fmt2(q.data?.totalUsed ?? 0)}</div>
        </CardContent></Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Add Points Transaction</CardTitle></CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "earn" | "redeem")}>
            <TabsList><TabsTrigger value="earn">Earn</TabsTrigger><TabsTrigger value="redeem">Redeem</TabsTrigger></TabsList>
            <TabsContent value={tab} className="mt-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div><Label>Points</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                <div className="md:col-span-2"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></div>
              </div>
              <Button className="mt-4" onClick={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tab === "earn" ? "Add Earned" : "Redeem"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Earned</TableHead><TableHead className="text-right">Used</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Note</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(q.data?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    {Number(r.points_earned) > 0
                      ? <Badge className="bg-success/10 text-success border-success/30" variant="outline">Earned</Badge>
                      : <Badge className="bg-destructive/10 text-destructive border-destructive/30" variant="outline">Redeemed</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{fmt2(Number(r.points_earned))}</TableCell>
                  <TableCell className="text-right">{fmt2(Number(r.points_used))}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt2(Number(r.balance))}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.note ?? "—"}</TableCell>
                </TableRow>
              ))}
              {(q.data?.rows ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No points history yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
