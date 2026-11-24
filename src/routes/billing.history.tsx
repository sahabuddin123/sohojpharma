import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RouteErrorPanel } from "@/components/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/billing/history")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Payment History — SohojPharma" }] }),
  component: HistoryPage,
});

function HistoryPage() {
  const { currentTenantId } = useAuth();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["billing-history", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_payments")
        .select("id,amount,currency,method,billing_cycle,transaction_id,status,created_at,reviewed_at,review_notes,plans(name)")
        .eq("tenant_id", currentTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const variant = (s: string) =>
    s === "approved" ? "default"
    : s === "rejected" ? "destructive"
    : s === "cancelled" ? "outline"
    : "secondary";

  return (
    <AppShell variant="store" title="Billing history">
      <PageHeader
        title="Payment history"
        description="Past and pending subscription payments."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/billing"><ArrowLeft className="mr-2 h-4 w-4" />Back to billing</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Txn ID</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No payments yet.</TableCell></TableRow>
              ) : (
                rows.map((r) => {
                  const plan = (r as { plans: { name: string } | null }).plans;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(r.created_at as string).toLocaleString()}</TableCell>
                      <TableCell>{plan?.name ?? "—"}</TableCell>
                      <TableCell className="capitalize">{r.billing_cycle}</TableCell>
                      <TableCell className="uppercase">{r.method}</TableCell>
                      <TableCell className="font-mono text-xs">{r.transaction_id ?? "—"}</TableCell>
                      <TableCell className="text-right">৳ {Number(r.amount).toLocaleString("en-IN")}</TableCell>
                      <TableCell><Badge variant={variant(r.status as string)}>{r.status}</Badge></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
