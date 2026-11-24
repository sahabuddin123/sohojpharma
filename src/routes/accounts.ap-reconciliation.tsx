import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import {
  getAPReconciliation,
  backfillSupplierLedger,
  backfillSupplierJournals,
} from "@/lib/api/supplier-ledger.functions";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/accounts/ap-reconciliation")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "AP Reconciliation — SohojPharma" }] }),
  component: APReconPage,
});

const fmt = (n: number) =>
  `৳ ${new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

function APReconPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId;
  const reconFn = useServerFn(getAPReconciliation);
  const backfillFn = useServerFn(backfillSupplierLedger);
  const backfillJournalFn = useServerFn(backfillSupplierJournals);

  const q = useQuery({
    queryKey: ["ap-recon", tenantId],
    queryFn: () => reconFn({ data: { tenantId: tenantId! } }),
    enabled: !!tenantId,
  });

  const backfill = useMutation({
    mutationFn: () => backfillFn({ data: { tenantId: tenantId! } }),
    onSuccess: (r) => {
      toast.success(`Ledger — opening ${r.opening}, purchases ${r.purchase}, payments ${r.payment}`);
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const backfillJournals = useMutation({
    mutationFn: () => backfillJournalFn({ data: { tenantId: tenantId! } }),
    onSuccess: (r) => {
      toast.success(`Journals — opening ${r.opening}, purchases ${r.purchase}, payments ${r.payment}`);
      q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  if (!tenantId) {
    return (
      <Alert>
        <AlertTitle>No tenant</AlertTitle>
        <AlertDescription>Sign in to a tenant to view AP reconciliation.</AlertDescription>
      </Alert>
    );
  }

  const d = q.data;
  const ok = d?.reconciled;

  return (
    <div className="space-y-4">
      <PageHeader
        title="AP Reconciliation"
        description="Supplier Ledger total vs Accounts Payable (2000) journal balance."
        actions={
          <>
            <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" onClick={() => backfill.mutate()} disabled={backfill.isPending}>
              Backfill Ledger
            </Button>
            <Button onClick={() => backfillJournals.mutate()} disabled={backfillJournals.isPending}>
              Backfill Journals
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Supplier Ledger Due</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {d ? fmt(d.supplier_ledger_due) : "—"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">AP Account (2000)</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {d ? fmt(d.ap_account_due) : "—"}
          </CardContent>
        </Card>
        <Card className={ok ? "border-green-500" : "border-amber-500"}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {ok ? (
                <><CheckCircle2 className="h-4 w-4 text-green-600" /> Reconciled</>
              ) : (
                <><AlertTriangle className="h-4 w-4 text-amber-600" /> Variance</>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {d ? fmt(d.variance) : "—"}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
