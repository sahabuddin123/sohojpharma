import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, BookOpen, Search, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizePostgrestSearch } from "@/lib/security/postgrest";
import {
  CollectPaymentDialog, CustomerLedgerDrawer, type DueCustomer,
} from "@/components/pos/customer-due-dialogs";

export const Route = createFileRoute("/sales/due-collections")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-8">Not found</div>,
  head: () => ({
    meta: [
      { title: "Due Collections — SohojPharma" },
      { name: "description", content: "Outstanding customer dues, collections, ledgers and payment history." },
    ],
  }),
  component: DueCollectionsPage,
});

type Row = DueCustomer & {
  total_sales: number;
  total_collected: number;
  total_paid_on_sales: number;
  last_payment_at: string | null;
  last_purchase_at: string | null;
};

function statusFor(net: number, lastPurchase: string | null) {
  if (net <= 0.001) return { label: "No Due", cls: "border-muted-foreground/30 bg-muted/40 text-muted-foreground" };
  const days = lastPurchase ? Math.floor((Date.now() - new Date(lastPurchase).getTime()) / 86_400_000) : 0;
  if (days > 60 || net > 50_000) return { label: "Critical", cls: "border-destructive/40 bg-destructive/10 text-destructive" };
  if (days > 30) return { label: "Overdue", cls: "border-warning/40 bg-warning/10 text-warning" };
  return { label: "Due", cls: "border-primary/30 bg-primary/10 text-primary" };
}

function DueCollectionsPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [q, setQ] = useState("");
  const [dbq, setDbq] = useState("");
  const [show, setShow] = useState<"due" | "all">("due");
  const [collect, setCollect] = useState<DueCustomer | null>(null);
  const [ledger, setLedger] = useState<DueCustomer | null>(null);

  useEffect(() => { const t = setTimeout(() => setDbq(q.trim().toLowerCase()), 200); return () => clearTimeout(t); }, [q]);

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["due-customers", tenantId, show, dbq],
    enabled: !!tenantId,
    queryFn: async () => {
      let qy = supabase
        .from("v_customer_due")
        .select("customer_id,name,phone,total_sales,total_paid_on_sales,total_collected,net_due,open_invoice_due,last_purchase_at,last_payment_at")
        .eq("tenant_id", tenantId)
        .order("net_due", { ascending: false })
        .limit(500);
      if (show === "due") qy = qy.gt("net_due", 0);
      const safeDbq = sanitizePostgrestSearch(dbq);
      if (safeDbq) qy = qy.or(`name.ilike.%${safeDbq}%,phone.ilike.%${safeDbq}%`);
      const { data, error } = await qy;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const { data: todayCollection = 0 } = useQuery({
    queryKey: ["today-collection", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("customer_payments").select("amount")
        .eq("tenant_id", tenantId).eq("payment_date", today);
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
    },
  });

  const kpis = useMemo(() => {
    const due = rows.filter((r) => r.net_due > 0);
    const totalDue = due.reduce((s, r) => s + r.net_due, 0);
    const overdue = due.filter((r) => statusFor(r.net_due, r.last_purchase_at).label !== "Due")
                       .reduce((s, r) => s + r.net_due, 0);
    const totalSales = rows.reduce((s, r) => s + r.total_sales, 0);
    const totalCollected = rows.reduce((s, r) => s + r.total_collected, 0);
    const rate = totalSales > 0 ? Math.min(100, (totalCollected / totalSales) * 100) : 0;
    return { totalDue, overdue, dueCount: due.length, rate };
  }, [rows]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/sales"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Due Collections</h1>
            <p className="text-sm text-muted-foreground">Outstanding customer balances, payment recovery and ledgers.</p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to="/sales/pos" search={{ edit: undefined, recall: undefined, ref: undefined }}><Wallet className="mr-1 h-4 w-4" /> Open POS</Link>
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total due" value={`৳ ${kpis.totalDue.toFixed(0)}`} accent="text-destructive" />
        <Kpi label="Today's collection" value={`৳ ${Number(todayCollection).toFixed(0)}`} accent="text-success" />
        <Kpi label="Overdue amount" value={`৳ ${kpis.overdue.toFixed(0)}`} accent="text-warning" />
        <Kpi label="Due customers" value={kpis.dueCount.toString()} />
        <Kpi label="Collection rate" value={`${kpis.rate.toFixed(1)} %`} accent="text-primary" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="w-72 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={show === "due" ? "default" : "outline"} size="sm" onClick={() => setShow("due")}>With due</Button>
              <Button variant={show === "all" ? "default" : "outline"} size="sm" onClick={() => setShow("all")}>All customers</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Customer</th>
                  <th className="px-4 py-2 text-left">Phone</th>
                  <th className="px-4 py-2 text-right">Total sales</th>
                  <th className="px-4 py-2 text-right">Total paid</th>
                  <th className="px-4 py-2 text-right">Current due</th>
                  <th className="px-4 py-2 text-left">Last payment</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isFetching && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Nothing to collect right now</td></tr>
                )}
                {rows.map((r) => {
                  const s = statusFor(r.net_due, r.last_purchase_at);
                  return (
                    <tr key={r.customer_id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{r.name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.phone ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-mono">৳ {Number(r.total_sales).toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-mono text-success">৳ {Number(r.total_collected).toFixed(2)}</td>
                      <td className={cn("px-4 py-2 text-right font-mono font-bold",
                        r.net_due > 0 ? "text-destructive" : r.net_due < 0 ? "text-success" : "text-muted-foreground")}>
                        {r.net_due < 0 ? `Adv ৳ ${Math.abs(r.net_due).toFixed(2)}` : `৳ ${r.net_due.toFixed(2)}`}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {r.last_payment_at ? new Date(r.last_payment_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={s.cls}>{s.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setLedger(r)}>
                            <BookOpen className="mr-1 h-3.5 w-3.5" /> Ledger
                          </Button>
                          <Button size="sm" disabled={r.net_due <= 0} onClick={() => setCollect(r)}>
                            <Wallet className="mr-1 h-3.5 w-3.5" /> Collect
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <CollectPaymentDialog
        open={!!collect}
        onOpenChange={(v) => { if (!v) setCollect(null); }}
        customer={collect}
      />
      <CustomerLedgerDrawer
        open={!!ledger}
        onOpenChange={(v) => { if (!v) setLedger(null); }}
        customer={ledger}
      />
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent className={cn("text-2xl font-bold", accent)}>{value}</CardContent>
    </Card>
  );
}
