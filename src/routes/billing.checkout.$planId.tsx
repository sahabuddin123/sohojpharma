import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Upload, Zap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RouteErrorPanel } from "@/components/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { createBkashPayment } from "@/lib/api/bkash.functions";

const search = z.object({ cycle: z.enum(["monthly", "yearly"]).default("monthly") });

export const Route = createFileRoute("/billing/checkout/$planId")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  validateSearch: search,
  head: () => ({ meta: [{ title: "Checkout — SohojPharma" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { planId } = Route.useParams();
  const { cycle } = Route.useSearch();
  const { currentTenantId, user } = useAuth();
  const navigate = useNavigate();

  const [method, setMethod] = useState("bkash");
  const [txnId, setTxnId] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-detail", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id,name,code,price_bdt,price_yearly_bdt")
        .eq("id", planId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const baseAmount = plan
    ? cycle === "yearly"
      ? Number(plan.price_yearly_bdt ?? Number(plan.price_bdt) * 12)
      : Number(plan.price_bdt)
    : 0;

  // bKash gateway fee calculation: 1.5% (15tk per 1000tk)
  const isBkash = method === "bkash";
  const gatewayFee = isBkash ? Math.round(baseAmount * 0.015) : 0;
  const totalAmount = baseAmount + gatewayFee;

  const submit = useMutation({
    mutationFn: async () => {
      if (!currentTenantId || !user) throw new Error("Not signed in");
      let proofUrl: string | null = null;
      if (file) {
        const path = `${currentTenantId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const up = await supabase.storage.from("subscription-proofs").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        proofUrl = up.data.path;
      }
      const noteWithFee = gatewayFee > 0
        ? `${notes ? notes + " | " : ""}Gateway charge: ৳${gatewayFee} (1.5%) included. Subtotal: ৳${baseAmount}.`
        : notes || null;
      const { error } = await supabase.from("subscription_payments").insert({
        tenant_id: currentTenantId,
        plan_id: planId,
        billing_cycle: cycle,
        amount: totalAmount,
        method,
        transaction_id: txnId || null,
        proof_url: proofUrl,
        notes: noteWithFee,
        submitted_by: user.id,
        status: "pending_review",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment submitted — awaiting admin approval.");
      navigate({ to: "/billing/history" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <AppShell variant="store" title="Checkout"><p className="text-sm text-muted-foreground">Loading…</p></AppShell>;
  }
  if (!plan) {
    return <AppShell variant="store" title="Checkout"><p>Plan not found.</p></AppShell>;
  }

  return (
    <AppShell variant="store" title="Checkout">
      <PageHeader
        title={`Checkout — ${plan.name}`}
        description={`Billing cycle: ${cycle}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/billing/plans"><ArrowLeft className="mr-2 h-4 w-4" />Back to plans</Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>Pay with bKash (instant)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pay securely through bKash Checkout. Your subscription activates automatically the moment payment is confirmed — no admin review needed. Gateway charge (1.5% — ৳15 per ৳1000) is included.
            </p>
            <BkashPayButton planId={planId} cycle={cycle} amount={totalAmount} />
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or submit proof manually</span>
              </div>
            </div>
            <div>
              <Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bkash">bKash (manual)</SelectItem>
                  <SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="rocket">Rocket</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="manual">Other / Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Transaction ID</Label>
              <Input placeholder="e.g. 8N2Z5XK" value={txnId} onChange={(e) => setTxnId(e.target.value)} />
            </div>

            <div>
              <Label>Payment screenshot / receipt</Label>
              <div className="flex items-center gap-2">
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know…" />
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={submit.isPending || (!txnId && !file)}
              onClick={() => submit.mutate()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {submit.isPending ? "Submitting…" : "Submit for approval"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Order summary</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Plan</span><span className="font-medium">{plan.name}</span></div>
            <div className="flex justify-between"><span>Billing</span><span className="capitalize">{cycle}</span></div>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>৳ {baseAmount.toLocaleString("en-IN")}</span>
            </div>
            {gatewayFee > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>bKash Gateway Charge (1.5%)</span>
                <span>+ ৳ {gatewayFee.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total Payable</span><span className="text-primary font-bold">৳ {totalAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">bKash Payment Number</span>
                <span className="font-mono font-bold text-sm text-pink-600 bg-pink-50 px-2 py-0.5 rounded border border-pink-200">01951413828</span>
              </div>
              <p className="text-muted-foreground">
                Payment Type: <span className="font-medium text-foreground">Send Money / Merchant Payment</span>
              </p>
              <p className="text-muted-foreground">
                Gateway Fee: <span className="font-medium text-foreground">1.5% (৳15 per ৳1000)</span>
              </p>
              <p className="text-muted-foreground">
                Reference: <span className="font-medium text-foreground">Tenant Name / Mobile</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function BkashPayButton({ planId, cycle, amount }: { planId: string; cycle: "monthly" | "yearly"; amount: number }) {
  const { currentTenantId } = useAuth();
  const createFn = useServerFn(createBkashPayment);
  const pay = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error("Not signed in");
      return createFn({ data: { tenant_id: currentTenantId, plan_id: planId, billing_cycle: cycle } });
    },
    onSuccess: (res) => {
      if (res?.redirect_url) window.location.href = res.redirect_url;
      else toast.error("Could not start bKash checkout");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button className="w-full" disabled={pay.isPending || amount <= 0} onClick={() => pay.mutate()}>
      <Zap className="mr-2 h-4 w-4" />
      {pay.isPending ? "Redirecting to bKash…" : `Pay ৳ ${amount.toLocaleString("en-IN")} with bKash`}
    </Button>
  );
}
