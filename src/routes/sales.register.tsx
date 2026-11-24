import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wallet, ArrowLeft, Plus } from "lucide-react";
import { useActiveRegister } from "@/hooks/use-active-register";
import {
  OpenRegisterDialog, CloseRegisterDialog,
} from "@/components/pos/cash-register-dialogs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sales/register")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  notFoundComponent: () => <div className="p-8">Not found</div>,
  head: () => ({
    meta: [
      { title: "Cash Register — SohojPharma" },
      { name: "description", content: "Open and close cash registers, view shift history and reconciliation." },
    ],
  }),
  component: RegisterPage,
});

type Row = {
  id: string;
  register_name: string;
  status: "open" | "closed";
  user_id: string;
  opening_amount: number;
  expected_closing_amount: number | null;
  actual_closing_amount: number | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  branch_id: string | null;
};

function RegisterPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { data: active, refetch } = useActiveRegister();

  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [status, setStatus] = useState<"all" | "open" | "closed">("all");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["register-history", tenantId, status, from, to],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from("cash_registers")
        .select("id,register_name,status,user_id,opening_amount,expected_closing_amount,actual_closing_amount,opened_at,closed_at,notes,branch_id")
        .eq("tenant_id", tenantId)
        .order("opened_at", { ascending: false })
        .limit(200);
      if (status !== "all") q = q.eq("status", status);
      if (from) q = q.gte("opened_at", `${from}T00:00:00`);
      if (to)   q = q.lte("opened_at", `${to}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const summary = useMemo(() => {
    const open = rows.filter((r) => r.status === "open").length;
    const closed = rows.filter((r) => r.status === "closed");
    const diff = closed.reduce((s, r) => s + ((r.actual_closing_amount ?? 0) - (r.expected_closing_amount ?? 0)), 0);
    return { open, closed: closed.length, diff };
  }, [rows]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/sales"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Cash Register</h1>
            <p className="text-sm text-muted-foreground">Shifts, drawer balances and reconciliations.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {active ? (
            <>
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                Active: {active.register_name}
              </Badge>
              <Button variant="outline" onClick={() => setCloseModal(true)}>Close Register</Button>
              <Button asChild>
                <Link to="/sales/pos" search={{ edit: undefined, recall: undefined, ref: undefined }}><Wallet className="mr-1 h-4 w-4" /> Open POS</Link>
              </Button>
            </>
          ) : (
            <Button onClick={() => setOpenModal(true)}>
              <Plus className="mr-1 h-4 w-4" /> Open Register
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Open registers</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{summary.open}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Closed shifts</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{summary.closed}</CardContent></Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Total difference (closed)</CardTitle></CardHeader>
          <CardContent className={cn("text-2xl font-bold",
            Math.abs(summary.diff) < 0.01 ? "text-success"
              : summary.diff > 0 ? "text-warning" : "text-destructive")}>
            ৳ {summary.diff.toFixed(2)}
          </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "all" | "open" | "closed")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Register</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Opened</th>
                  <th className="px-4 py-2 text-left">Closed</th>
                  <th className="px-4 py-2 text-right">Opening</th>
                  <th className="px-4 py-2 text-right">Expected</th>
                  <th className="px-4 py-2 text-right">Actual</th>
                  <th className="px-4 py-2 text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isFetching && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">No registers in this period</td></tr>
                )}
                {rows.map((r) => {
                  const d = (r.actual_closing_amount ?? 0) - (r.expected_closing_amount ?? 0);
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2 font-medium">{r.register_name}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={cn(
                          r.status === "open"
                            ? "border-success/40 bg-success/10 text-success"
                            : "border-muted-foreground/30 bg-muted/40"
                        )}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-2">{new Date(r.opened_at).toLocaleString()}</td>
                      <td className="px-4 py-2">{r.closed_at ? new Date(r.closed_at).toLocaleString() : "—"}</td>
                      <td className="px-4 py-2 text-right font-mono">৳ {r.opening_amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right font-mono">{r.expected_closing_amount != null ? `৳ ${r.expected_closing_amount.toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-2 text-right font-mono">{r.actual_closing_amount != null ? `৳ ${r.actual_closing_amount.toFixed(2)}` : "—"}</td>
                      <td className={cn("px-4 py-2 text-right font-mono font-semibold",
                        r.status !== "closed" ? "text-muted-foreground"
                          : Math.abs(d) < 0.01 ? "text-success"
                            : d > 0 ? "text-warning" : "text-destructive")}>
                        {r.status === "closed" ? `৳ ${d.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <OpenRegisterDialog open={openModal} onOpenChange={(v) => { setOpenModal(v); if (!v) refetch(); }} />
      <CloseRegisterDialog open={closeModal} onOpenChange={(v) => { setCloseModal(v); if (!v) refetch(); }} register={active ?? null} />
    </div>
  );
}
