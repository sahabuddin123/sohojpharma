import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check, X, Image as ImageIcon, Search, Clock, CircleCheck, CircleX,
  CreditCard, Loader2, ExternalLink, Plus, Sparkles, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListSubscriptionPayments,
  adminApproveSubscriptionPayment,
  adminRejectSubscriptionPayment,
  adminRecordManualSubscriptionPayment,
} from "@/lib/api/admin-subscription-payments.functions";

export const Route = createFileRoute("/admin/payments")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Subscription Payments — Super Admin" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [active, setActive] = useState<any | null>(null);
  const [tab, setTab] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const listFn = useServerFn(adminListSubscriptionPayments);
  const approveFn = useServerFn(adminApproveSubscriptionPayment);
  const rejectFn = useServerFn(adminRejectSubscriptionPayment);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["admin-subscription-payments", tab, search],
    queryFn: () => listFn({ data: { status: tab, search } }),
  });

  const approveMu = useMutation({
    mutationFn: async () => {
      if (!active) return;
      return approveFn({ data: { paymentId: active.id, notes: reviewNotes } });
    },
    onSuccess: () => {
      toast.success("Payment approved & subscription activated!");
      setActive(null);
      setReviewNotes("");
      qc.invalidateQueries({ queryKey: ["admin-subscription-payments"] });
      qc.invalidateQueries({ queryKey: ["admin", "stores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMu = useMutation({
    mutationFn: async () => {
      if (!active) return;
      return rejectFn({ data: { paymentId: active.id, notes: reviewNotes } });
    },
    onSuccess: () => {
      toast.success("Payment rejected.");
      setActive(null);
      setReviewNotes("");
      qc.invalidateQueries({ queryKey: ["admin-subscription-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingCount = payments.filter((p: any) => p.status === "pending" || p.status === "pending_review").length;
  const approvedCount = payments.filter((p: any) => p.status === "approved").length;
  const rejectedCount = payments.filter((p: any) => p.status === "rejected").length;
  const totalVolume = payments
    .filter((p: any) => p.status === "approved")
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  const dateFmt = (d?: string) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  return (
    <AppShell variant="admin" title={t("nav.payments")}>
      <PageHeader
        title={t("admin.payments.title")}
        description="Review and approve store subscription renewal and upgrade payments."
        actions={
          <Button onClick={() => setManualOpen(true)} className="gap-2 font-semibold shadow-sm">
            <Plus className="h-4 w-4" />
            ম্যানুয়াল পেমেন্ট রেকর্ড করুন
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.payments.pending")} value={pendingCount.toString()} icon={Clock} tone="warning" />
        <StatCard label={t("admin.payments.approvedMo")} value={approvedCount.toString()} icon={CircleCheck} tone="success" />
        <StatCard label={t("admin.payments.rejected")} value={rejectedCount.toString()} icon={CircleX} tone="secondary" />
        <StatCard label="Total Approved Volume" value={`৳ ${totalVolume.toLocaleString("en-IN")}`} icon={CreditCard} tone="primary" />
      </div>

      <Card className="mt-6 shadow-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">{t("common.all")}</TabsTrigger>
                <TabsTrigger value="pending">{t("common.pending")}</TabsTrigger>
                <TabsTrigger value="approved">{t("common.approved")}</TabsTrigger>
                <TabsTrigger value="rejected">{t("common.rejected")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative ml-auto min-w-0 flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by store or transaction ID…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : payments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No subscription payments found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment ID</TableHead>
                    <TableHead>{t("admin.payments.tenant")}</TableHead>
                    <TableHead>{t("admin.payments.plan")}</TableHead>
                    <TableHead>{t("admin.payments.method")}</TableHead>
                    <TableHead className="text-right">{t("admin.payments.amount")}</TableHead>
                    <TableHead>{t("admin.payments.date")}</TableHead>
                    <TableHead>{t("admin.payments.status")}</TableHead>
                    <TableHead className="text-right">{t("admin.payments.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{p.tenants?.name ?? "Store"}</div>
                        <div className="text-xs text-muted-foreground">{p.tenants?.slug}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {p.plans?.name ?? p.plan_id ?? "Custom"}
                        </Badge>
                        <span className="ml-1 text-[10px] text-muted-foreground capitalize">({p.billing_cycle})</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium uppercase">{p.method}</span>
                        {p.transaction_id && <p className="font-mono text-[11px] text-pink-600 font-bold">{p.transaction_id}</p>}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        ৳ {Number(p.amount || 0).toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{dateFmt(p.created_at)}</TableCell>
                      <TableCell>
                        <PaymentBadge status={p.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => { setActive(p); setReviewNotes(p.review_notes || ""); }}>
                          {t("admin.payments.review")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!active} onOpenChange={(o) => { if (!o) { setActive(null); setReviewNotes(""); } }}>
        <DialogContent className="max-w-2xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>Verify Payment — {active.id.slice(0, 8).toUpperCase()}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2.5 text-sm">
                  <Row label="Store" value={<span className="font-bold">{active.tenants?.name}</span>} />
                  <Row label="Plan" value={<span>{active.plans?.name} ({active.billing_cycle})</span>} />
                  <Row label="Total Amount" value={<span className="font-bold text-primary text-base">৳ {Number(active.amount).toLocaleString("en-IN")}</span>} />
                  <Row label="Method" value={<span className="uppercase font-semibold">{active.method}</span>} />
                  {active.transaction_id && (
                    <Row label="Txn ID" value={<span className="font-mono font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded">{active.transaction_id}</span>} />
                  )}
                  <Row label="Status" value={<PaymentBadge status={active.status} />} />
                  <Row label="Submitted" value={<span>{dateFmt(active.created_at)}</span>} />
                  {active.notes && (
                    <div className="rounded border bg-muted/20 p-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Customer Notes: </span>{active.notes}
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("admin.payments.adminNotes")}</label>
                    <Textarea
                      className="mt-1"
                      rows={2}
                      placeholder="Approval remarks or reason for rejection…"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 p-4 text-center">
                  {active.proof_url ? (
                    <div className="space-y-3 w-full">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Payment Screenshot / Receipt</p>
                      <div className="max-h-56 overflow-hidden rounded-lg border bg-white flex items-center justify-center p-2">
                        <img
                          src={`http://127.0.0.1:54321/storage/v1/object/public/subscription-proofs/${active.proof_url}`}
                          alt="Proof"
                          className="max-h-52 object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <Button asChild variant="outline" size="sm" className="w-full text-xs">
                        <a
                          href={`http://127.0.0.1:54321/storage/v1/object/public/subscription-proofs/${active.proof_url}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open receipt in new tab
                        </a>
                      </Button>
                    </div>
                  ) : (
                    <div className="py-8">
                      <ImageIcon className="mx-auto h-10 w-10 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">No screenshot uploaded</p>
                      <p className="text-xs text-muted-foreground">Verify via Transaction ID</p>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="destructive"
                  disabled={rejectMu.isPending || approveMu.isPending}
                  onClick={() => rejectMu.mutate()}
                >
                  {rejectMu.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <X className="mr-1.5 h-4 w-4" />}
                  {t("admin.payments.reject")}
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={rejectMu.isPending || approveMu.isPending}
                  onClick={() => approveMu.mutate()}
                >
                  {approveMu.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                  Approve & Activate Subscription
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <RecordManualPaymentDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["admin-subscription-payments"] });
          qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
          qc.invalidateQueries({ queryKey: ["admin", "stores"] });
        }}
      />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-2 text-sm">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <div>{value}</div>
    </div>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    pending_review: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    rejected: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    failed: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  };
  const label: Record<string, string> = {
    pending: "Pending",
    pending_review: "Pending Review",
    approved: "Approved",
    rejected: "Rejected",
    failed: "Failed",
  };
  return <Badge variant="outline" className={map[status] || ""}>{label[status] || status}</Badge>;
}

function RecordManualPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}) {
  const [tenantId, setTenantId] = useState("");
  const [planId, setPlanId] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [durationMonths, setDurationMonths] = useState(1);
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<"bkash" | "nagad" | "rocket" | "bank" | "cash" | "manual">("bkash");
  const [transactionId, setTransactionId] = useState("");
  const [notes, setNotes] = useState("");
  const [autoActivate, setAutoActivate] = useState(true);

  // Load active stores & plans
  const { data: tenants = [], isLoading: loadingTenants } = useQuery({
    queryKey: ["admin", "tenants-lite-payments"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, name, slug, status").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["admin", "plans-lite-payments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("plans")
        .select("id, name, code, price_bdt, price_yearly_bdt")
        .eq("is_active", true)
        .order("sort_order");
      return data ?? [];
    },
    enabled: open,
  });

  // Auto-select first plan when plans load
  useEffect(() => {
    if (plans.length > 0 && !planId) {
      setPlanId(plans[0].id);
    }
  }, [plans, planId]);

  // Recalculate amount when plan, billingCycle, or durationMonths changes
  useEffect(() => {
    const sel = plans.find((p) => p.id === planId);
    if (sel) {
      if (billingCycle === "yearly") {
        const yrPrice = Number(sel.price_yearly_bdt ?? sel.price_bdt * 12);
        const years = Math.max(1, Math.round(durationMonths / 12));
        setAmount(yrPrice * years);
      } else {
        setAmount(Number(sel.price_bdt) * durationMonths);
      }
    }
  }, [planId, billingCycle, durationMonths, plans]);

  const recordFn = useServerFn(adminRecordManualSubscriptionPayment);
  const recordMu = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("অনুগ্রহ করে একটি ফার্মেসি স্টোর নির্বাচন করুন");
      if (!planId) throw new Error("অনুগ্রহ করে একটি প্ল্যান নির্বাচন করুন");
      return recordFn({
        data: {
          tenantId,
          planId,
          billingCycle,
          amount: Number(amount) || 0,
          method,
          transactionId: transactionId.trim() || undefined,
          durationMonths: Number(durationMonths) || 1,
          notes: notes.trim() || undefined,
          autoActivate,
        },
      });
    },
    onSuccess: () => {
      toast.success(
        autoActivate
          ? "পেমেন্ট সফলভাবে রেকর্ড ও সাবস্ক্রিপশন চালু হয়েছে!"
          : "পেমেন্ট রেকর্ড করা হয়েছে (অনুমোদনের জন্য মুলতুবি)"
      );
      onOpenChange(false);
      onSuccess();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5 text-primary" />
            ম্যানুয়াল পেমেন্ট রেকর্ড করুন
          </DialogTitle>
          <DialogDescription>
            ফার্মেসি থেকে নগদ, সরাসরি বিকাশ বা ব্যাংকে পাওয়া পেমেন্ট এন্ট্রি করে স্টোর সাবস্ক্রিপশন সক্রিয় বা নবায়ন করুন।
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            recordMu.mutate();
          }}
          className="space-y-4 pt-1"
        >
          {/* Select Tenant */}
          <div className="space-y-1.5">
            <Label htmlFor="tenant-select" className="text-xs font-semibold">ফার্মেসি স্টোর *</Label>
            <Select value={tenantId} onValueChange={setTenantId} required>
              <SelectTrigger id="tenant-select">
                <SelectValue placeholder={loadingTenants ? "লোড হচ্ছে..." : "স্টোর নির্বাচন করুন..."} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.slug}) · <span className="capitalize text-muted-foreground">{t.status}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Select Plan & Billing Cycle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">প্ল্যান *</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingPlans ? "লোড হচ্ছে..." : "প্ল্যান..."} />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.price_bdt > 0 ? `(৳${p.price_bdt}/মাস)` : "(Custom)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">বিলিং সাইকেল</Label>
              <Select
                value={billingCycle}
                onValueChange={(v) => {
                  setBillingCycle(v as "monthly" | "yearly");
                  if (v === "yearly") setDurationMonths(12);
                  else if (durationMonths === 12) setDurationMonths(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">মাসিক (Monthly)</SelectItem>
                  <SelectItem value="yearly">বার্ষিক (Yearly)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration & Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">মেয়াদ (মাস)</Label>
              <Select
                value={String(durationMonths)}
                onValueChange={(v) => setDurationMonths(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">১ মাস (1 Month)</SelectItem>
                  <SelectItem value="2">২ মাস (2 Months)</SelectItem>
                  <SelectItem value="3">৩ মাস (3 Months)</SelectItem>
                  <SelectItem value="6">৬ মাস (6 Months)</SelectItem>
                  <SelectItem value="12">১২ মাস (1 Year)</SelectItem>
                  <SelectItem value="24">২৪ মাস (2 Years)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">টাকার পরিমাণ (BDT) *</Label>
              <Input
                type="number"
                min="0"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                placeholder="যেমন: 999"
              />
            </div>
          </div>

          {/* Method & Txn ID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">পেমেন্ট মেথড *</Label>
              <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bkash">বিকাশ (bKash - 01951413828)</SelectItem>
                  <SelectItem value="nagad">নগদ (Nagad)</SelectItem>
                  <SelectItem value="rocket">রকেট (Rocket)</SelectItem>
                  <SelectItem value="bank">ব্যাংক ডিপোজিট (Bank)</SelectItem>
                  <SelectItem value="cash">নগদ ক্যাশ (Cash)</SelectItem>
                  <SelectItem value="manual">অন্যান্য (Other)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">ট্রানজেকশন আইডি / রেফারেন্স</Label>
              <Input
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="যেমন: 9N2XK5..."
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">অ্যাডমিন নোট (ঐচ্ছিক)</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="পেমেন্ট বা কাস্টমারের সাথে আলোচনা সম্পর্কিত তথ্য..."
            />
          </div>

          {/* Auto activate toggle */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
            <div>
              <p className="font-semibold text-xs text-foreground">সরাসরি স্টোর এক্টিভ ও মেয়াদ বৃদ্ধি করুন</p>
              <p className="text-[11px] text-muted-foreground">পেমেন্টটি সাথে সাথে অনুমোদিত হয়ে স্টোরের মেয়াদ বেড়ে যাবে।</p>
            </div>
            <Switch checked={autoActivate} onCheckedChange={setAutoActivate} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={recordMu.isPending}>
              বাতিল
            </Button>
            <Button type="submit" disabled={recordMu.isPending || !tenantId || !planId}>
              {recordMu.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              পেমেন্ট সংরক্ষণ করুন
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
