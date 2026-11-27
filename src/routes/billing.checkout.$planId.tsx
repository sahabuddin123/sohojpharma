import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  FileText,
  Info,
  ShieldCheck,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneCard } from "@/components/mobile/phone-ui";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { useServerFn } from "@tanstack/react-start";
import {
  createBkashPayment,
  executeBkashPayment,
  cancelBkashPayment,
  getBkashCheckoutPublicConfig,
} from "@/lib/api/bkash.functions";
import { cn } from "@/lib/utils";

const DEFAULT_BKASH_MERCHANT_NUMBER = "01951413828";

const search = z.object({
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
  from: z.enum(["mobile", "desktop"]).optional(),
});

export const Route = createFileRoute("/billing/checkout/$planId")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  validateSearch: search,
  head: () => ({ meta: [{ title: "Checkout — SohojPharma" }] }),
  component: CheckoutPage,
});

function formatBdt(amount: number) {
  return `৳${amount.toLocaleString("en-IN")}`;
}

function CheckoutPage() {
  const { t } = useTranslation();
  const { planId } = Route.useParams();
  const { cycle: initialCycle, from } = Route.useSearch();
  const { currentTenantId, user } = useAuth();
  const navigate = useNavigate();
  const viewportMobile = useIsMobile();

  const [cycle, setCycle] = useState<"monthly" | "yearly">(initialCycle);
  const [method, setMethod] = useState("bkash");
  const [txnId, setTxnId] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCycle(initialCycle);
  }, [initialCycle]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const forceDesktop = useMemo(() => {
    if (from === "desktop") return true;
    if (typeof window === "undefined") return false;
    try {
      return (
        window.location.search.includes("desktop=1") ||
        sessionStorage.getItem("pc.mobile.forceDesktop") === "1"
      );
    } catch {
      return false;
    }
  }, [from]);

  const isMobileView = !forceDesktop && (from === "mobile" || viewportMobile);
  const backTarget = isMobileView ? "/m/subscription" : "/billing/plans";

  const getBkashPublicFn = useServerFn(getBkashCheckoutPublicConfig);
  const { data: bkashPublic } = useQuery({
    queryKey: ["bkash-checkout-public-config"],
    queryFn: () => getBkashPublicFn(),
    staleTime: 30_000,
  });

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

  const merchantNumber = bkashPublic?.merchant_number || DEFAULT_BKASH_MERCHANT_NUMBER;
  const feePercent = Number(bkashPublic?.gateway_fee_percent ?? 1.5);
  const feeRate = Number.isFinite(feePercent) && feePercent >= 0 ? feePercent / 100 : 0.015;
  const instantBkashFee = Math.round(baseAmount * feeRate);
  const instantBkashTotal = baseAmount + instantBkashFee;
  const isManualBkash = method === "bkash";
  const manualGatewayFee = isManualBkash ? instantBkashFee : 0;
  const manualTotalAmount = baseAmount + manualGatewayFee;

  const submit = useMutation({
    mutationFn: async () => {
      if (!currentTenantId || !user) throw new Error(t("billing.checkout.notSignedIn"));
      let proofUrl: string | null = null;
      if (file) {
        const path = `${currentTenantId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const up = await supabase.storage.from("subscription-proofs").upload(path, file, { upsert: false });
        if (up.error) throw up.error;
        proofUrl = up.data.path;
      }
      const noteWithFee = manualGatewayFee > 0
        ? `${notes ? notes + " | " : ""}Gateway charge: ৳${manualGatewayFee} (${feePercent}%) included. Subtotal: ৳${baseAmount}.`
        : notes || null;
      const { error } = await supabase.from("subscription_payments").insert({
        tenant_id: currentTenantId,
        plan_id: planId,
        billing_cycle: cycle,
        amount: manualTotalAmount,
        method,
        transaction_id: txnId.trim() || null,
        proof_url: proofUrl,
        notes: noteWithFee,
        submitted_by: user.id,
        status: "pending_review",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("billing.checkout.submitSuccess"));
      navigate({ to: (isMobileView ? "/m/subscription" : "/billing/history") as never });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(merchantNumber);
      setCopied(true);
      toast.success(t("billing.checkout.copiedNumber"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(merchantNumber);
    }
  };

  const shellWrap = (content: React.ReactNode) =>
    isMobileView ? (
      <PhoneShell title={t("billing.checkout.title")} back contentClassName="pb-28">
        {content}
      </PhoneShell>
    ) : (
      <AppShell variant="store" title={t("billing.checkout.title")}>
        {content}
      </AppShell>
    );

  if (isLoading) {
    return shellWrap(
      <div className={cn("py-12 text-center text-sm text-muted-foreground", isMobileView && "mt-3")}>
        {t("billing.checkout.loading")}
      </div>,
    );
  }

  if (!plan || plan.code === "free") {
    return shellWrap(
      <div className={cn("space-y-3 py-8 text-center", isMobileView && "mt-3")}>
        <p className="text-sm font-medium text-muted-foreground">
          {plan?.code === "free"
            ? "ফ্রি প্ল্যানটি শুধুমাত্র প্রথমবার সাইনআপের জন্য প্রযোজ্য। অনুগ্রহ করে একটি পেইড প্ল্যান নির্বাচন করুন।"
            : t("billing.checkout.notFound")}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={backTarget as never}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("billing.checkout.backToPlans")}
          </Link>
        </Button>
      </div>,
    );
  }

  const cycleSuffix = cycle === "yearly" ? t("billing.checkout.perYear") : t("billing.checkout.perMonth");
  const canSubmitManual = !submit.isPending && (txnId.trim().length > 0 || file !== null);

  const summaryContent = (
    <div className="space-y-3.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">{t("billing.checkout.selectedPlan")}</p>
          <p className="mt-0.5 text-lg font-extrabold tracking-tight text-foreground">{plan.name}</p>
        </div>
        <Link
          to={backTarget as never}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          <ArrowLeft className="h-3 w-3" />
          {t("billing.checkout.changePlan")}
        </Link>
      </div>

      {/* Interactive Monthly / Yearly cycle toggle */}
      <div className="phone-grid-keep grid grid-cols-2 gap-1 rounded-xl bg-muted/70 p-1">
        <button
          type="button"
          onClick={() => setCycle("monthly")}
          className={cn(
            "rounded-lg py-1.5 text-xs font-semibold transition",
            cycle === "monthly"
              ? isMobileView
                ? "bg-card text-[#0d5c46] shadow-xs"
                : "bg-card text-primary shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("billing.checkout.monthly")}
        </button>
        <button
          type="button"
          onClick={() => setCycle("yearly")}
          className={cn(
            "rounded-lg py-1.5 text-xs font-semibold transition",
            cycle === "yearly"
              ? isMobileView
                ? "bg-card text-[#0d5c46] shadow-xs"
                : "bg-card text-primary shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("billing.checkout.yearly")}
        </button>
      </div>

      <div className="space-y-2 border-t border-border/70 pt-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("billing.checkout.subtotal")} ({cycleSuffix.replace("/", "").trim()})
          </span>
          <span className="font-semibold text-foreground">{formatBdt(baseAmount)}</span>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {manualGatewayFee > 0
              ? t("billing.checkout.gatewayChargeLabel")
              : t("billing.checkout.gatewayFeeFree")}
          </span>
          <span className="font-medium text-foreground">
            {manualGatewayFee > 0 ? `+ ${formatBdt(manualGatewayFee)}` : "৳0"}
          </span>
        </div>

        <div className="flex items-baseline justify-between border-t border-border/70 pt-2.5">
          <span className="text-sm font-bold text-foreground">{t("billing.checkout.totalPayable")}</span>
          <span className={cn("text-xl font-black", isMobileView ? "text-[#0d5c46]" : "text-primary")}>
            {formatBdt(manualTotalAmount)}
          </span>
        </div>
      </div>
    </div>
  );

  const instantPaymentContent = (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#E2136E]/10 text-[#E2136E]">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground flex flex-wrap items-center gap-1.5">
              <span>{t("billing.checkout.instantTitle")}</span>
              {bkashPublic?.active_mode === "sandbox" && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  Sandbox Test
                </span>
              )}
            </h2>
            <p className="text-[11px] text-muted-foreground">{t("billing.checkout.instantFeeNote")}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
          {t("billing.checkout.recommended")}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("billing.checkout.instantDesc")}
      </p>

      {bkashPublic?.is_enabled === false ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          বিকাশ অনলাইন পেমেন্ট সাময়িকভাবে বন্ধ রয়েছে। অনুগ্রহ করে নিচের ম্যানুয়াল পেমেন্ট অপশন ব্যবহার করুন।
        </div>
      ) : (
        <BkashPayButton
          planId={planId}
          cycle={cycle}
          amount={instantBkashTotal}
          isMobileView={isMobileView}
        />
      )}
    </div>
  );

  const manualPaymentContent = (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <h2 className="text-sm font-bold text-foreground">{t("billing.checkout.manualTitle")}</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("billing.checkout.manualDesc")}
        </p>
      </div>

      {/* Dedicated payment instruction / copyable bKash number card */}
      <div className="rounded-xl border border-pink-200/80 bg-pink-50/60 p-3 text-xs space-y-2 dark:border-pink-900/50 dark:bg-pink-950/20">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-foreground">{t("billing.checkout.bkashNumberLabel")}</span>
          <button
            type="button"
            onClick={handleCopyNumber}
            className="inline-flex items-center gap-1.5 rounded-lg border border-pink-300 bg-white px-2.5 py-1 font-mono text-xs font-bold text-[#E2136E] shadow-2xs transition hover:bg-pink-50 dark:border-pink-800 dark:bg-background"
          >
            <span>{merchantNumber}</span>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
          <p>
            {t("billing.checkout.paymentType")}:{" "}
            <span className="font-medium text-foreground">{t("billing.checkout.paymentTypeVal")}</span>
          </p>
          <p>
            {t("billing.checkout.gatewayFeeRule")}:{" "}
            <span className="font-medium text-foreground">{t("billing.checkout.gatewayFeeRuleVal")}</span>
          </p>
          <p className="sm:col-span-2">
            {t("billing.checkout.reference")}:{" "}
            <span className="font-medium text-foreground">{t("billing.checkout.referenceVal")}</span>
          </p>
        </div>
      </div>

      <div className="space-y-3.5">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">
            {t("billing.checkout.methodLabel")}
          </Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-10 rounded-xl bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bkash">{t("billing.checkout.methods.bkash")}</SelectItem>
              <SelectItem value="nagad">{t("billing.checkout.methods.nagad")}</SelectItem>
              <SelectItem value="rocket">{t("billing.checkout.methods.rocket")}</SelectItem>
              <SelectItem value="bank">{t("billing.checkout.methods.bank")}</SelectItem>
              <SelectItem value="cash">{t("billing.checkout.methods.cash")}</SelectItem>
              <SelectItem value="manual">{t("billing.checkout.methods.manual")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">
            {t("billing.checkout.txnIdLabel")}
          </Label>
          <Input
            className="h-10 rounded-xl bg-background font-mono"
            placeholder={t("billing.checkout.txnIdPlaceholder")}
            value={txnId}
            onChange={(e) => setTxnId(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">
            {t("billing.checkout.proofLabel")}
          </Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {!file ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/25 px-4 py-5 text-center transition hover:border-primary/50 hover:bg-muted/50"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Upload className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold text-foreground">
                {t("billing.checkout.uploadTitle")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("billing.checkout.uploadHint")}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-2.5">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {Math.max(1, Math.round(file.size / 1024))} KB
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("billing.checkout.removeFile")}
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground">
            {t("billing.checkout.notesLabel")}
          </Label>
          <Textarea
            rows={2}
            className="rounded-xl bg-background resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("billing.checkout.notesPlaceholder")}
          />
        </div>

        {!txnId.trim() && !file && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>{t("billing.checkout.submitHint")}</span>
          </p>
        )}

        <Button
          type="button"
          className={cn(
            "h-11 w-full rounded-xl font-bold shadow-xs",
            isMobileView
              ? "bg-[#0d5c46] text-white hover:bg-[#094735] disabled:opacity-50"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          disabled={!canSubmitManual}
          onClick={() => submit.mutate()}
        >
          <Upload className="mr-2 h-4 w-4" />
          {submit.isPending ? t("billing.checkout.submitting") : t("billing.checkout.submitBtn")}
        </Button>
      </div>
    </div>
  );

  if (isMobileView) {
    return shellWrap(
      <div className="mt-3 space-y-3">
        <PhoneCard>{summaryContent}</PhoneCard>

        <PhoneCard className="border-pink-200/80 dark:border-pink-900/40">
          {instantPaymentContent}
        </PhoneCard>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/70" />
          </div>
          <div className="relative flex justify-center text-[11px] font-medium">
            <span className="rounded-full border border-border/70 bg-card px-3 py-0.5 text-muted-foreground shadow-2xs">
              {t("billing.checkout.orManual")}
            </span>
          </div>
        </div>

        <PhoneCard>{manualPaymentContent}</PhoneCard>
      </div>,
    );
  }

  return shellWrap(
    <>
      <PageHeader
        title={t("billing.checkout.pageTitle", { name: plan.name })}
        description={`${t("billing.checkout.billingCycle")}: ${cycle === "yearly" ? t("billing.checkout.yearly") : t("billing.checkout.monthly")}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/billing/plans">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("billing.checkout.backToPlans")}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Summary appears first on small screens and sticky-right on desktop */}
        <Card className="order-first h-fit lg:order-last lg:sticky lg:top-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("billing.checkout.orderSummary")}</CardTitle>
          </CardHeader>
          <CardContent>{summaryContent}</CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-pink-200/70 dark:border-pink-900/40">
            <CardContent className="pt-5">{instantPaymentContent}</CardContent>
          </Card>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border/70" />
            </div>
            <div className="relative flex justify-center text-xs font-medium">
              <span className="rounded-full border border-border/70 bg-card px-3.5 py-0.5 text-muted-foreground shadow-2xs">
                {t("billing.checkout.orManual")}
              </span>
            </div>
          </div>

          <Card>
            <CardContent className="pt-5">{manualPaymentContent}</CardContent>
          </Card>
        </div>
      </div>
    </>,
  );
}

interface BkashGlobal {
  init: (opts: {
    paymentMode: "checkout" | "agreement";
    paymentRequest: { amount: string; intent: string; currency?: string; merchantInvoiceNumber?: string };
    createRequest: (request: unknown) => void;
    executeRequestOnAuthorization: () => void;
    onClose?: () => void;
  }) => void;
  create: () => { onSuccess: (data: unknown) => void; onError: () => void };
  execute: () => { onError: () => void };
}

declare global {
  interface Window {
    jQuery?: unknown;
    $?: unknown;
    bKash?: BkashGlobal;
  }
}

function cleanupBkashDom() {
  if (typeof document === "undefined") return;
  document.getElementById("bKashFrameWrapper")?.remove();
  document.getElementById("sp-bkash-host")?.remove();
}

function loadBkashSdk(scriptUrl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const existingAll = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[data-bkash-sdk="1"], script[src*="bKash-checkout"]'),
    );
    for (const s of existingAll) {
      if (s.src !== scriptUrl || s.dataset.failed === "1") {
        s.remove();
        delete window.bKash;
      }
    }

    if (window.bKash) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.bKash) resolve();
        else reject(new Error(`Script loaded without bKash global: ${scriptUrl}`));
      }, { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${scriptUrl}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.dataset.bkashSdk = "1";
    script.onload = () => {
      if (window.bKash) resolve();
      else reject(new Error(`Script loaded without bKash global: ${scriptUrl}`));
    };
    script.onerror = () => {
      script.dataset.failed = "1";
      reject(new Error(`Failed to load ${scriptUrl}`));
    };
    document.body.appendChild(script);
  });
}

function BkashPayButton({
  planId,
  cycle,
  amount,
  isMobileView,
}: {
  planId: string;
  cycle: "monthly" | "yearly";
  amount: number;
  isMobileView: boolean;
}) {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createFn = useServerFn(createBkashPayment);
  const executeFn = useServerFn(executeBkashPayment);
  const cancelFn = useServerFn(cancelBkashPayment);

  const [phase, setPhase] = useState<"idle" | "creating" | "modal" | "executing">("idle");
  const settledRef = useRef(false);

  useEffect(() => {
    return () => {
      cleanupBkashDom();
    };
  }, []);

  const pay = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error(t("billing.checkout.notSignedIn"));
      setPhase("creating");
      return createFn({ data: { tenant_id: currentTenantId, plan_id: planId, billing_cycle: cycle } });
    },
    onSuccess: async (res) => {
      if (res?.mode === "tokenized" && res?.redirect_url) {
        window.location.href = res.redirect_url;
        return;
      }

      if (res?.mode === "checkout" && res.payment_data?.paymentID && res.script_url && currentTenantId) {
        try {
          await loadBkashSdk(res.script_url);

          if (!window.bKash) {
            throw new Error(t("billing.checkout.bkashScriptFailed"));
          }

          // IMPORTANT: Mount #bKash_button directly in an unclipped container on document.body!
          // bKash-checkout.js inserts #bKashFrameWrapper right next to #bKash_button — never wrap
          // its parent in .sr-only / overflow:hidden / clip, otherwise the modal clips to 1x1px!
          cleanupBkashDom();
          const host = document.createElement("div");
          host.id = "sp-bkash-host";
          const hiddenBtn = document.createElement("button");
          hiddenBtn.id = "bKash_button";
          hiddenBtn.type = "button";
          hiddenBtn.className = "sr-only";
          hiddenBtn.tabIndex = -1;
          hiddenBtn.setAttribute("aria-hidden", "true");
          hiddenBtn.textContent = "bKash";
          host.appendChild(hiddenBtn);
          document.body.appendChild(host);

          settledRef.current = false;
          setPhase("modal");

          const bkashPaymentID = String(res.payment_data.paymentID);
          const paymentRowId = res.payment_id;
          const tenantId = currentTenantId;

          window.bKash.init({
            paymentMode: "checkout",
            paymentRequest: {
              amount: String(res.payment_data.amount ?? amount.toFixed(2)),
              intent: String(res.payment_data.intent ?? "sale"),
              currency: "BDT",
              merchantInvoiceNumber: String(res.payment_data.merchantInvoiceNumber ?? ""),
            },
            createRequest: () => {
              window.bKash?.create().onSuccess(res.payment_data);
            },
            executeRequestOnAuthorization: () => {
              settledRef.current = true;
              setPhase("executing");
              executeFn({
                data: {
                  tenant_id: tenantId,
                  payment_row_id: paymentRowId,
                  bkash_payment_id: bkashPaymentID,
                },
              })
                .then(async (execRes) => {
                  cleanupBkashDom();
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["subscription-status"] }),
                    queryClient.invalidateQueries({ queryKey: ["billing-history"] }),
                    queryClient.invalidateQueries({ queryKey: ["usage"] }),
                  ]);
                  toast.success(
                    t("billing.checkout.bkashSuccess", { trxId: execRes.trxID ?? bkashPaymentID }),
                  );
                  setPhase("idle");
                  navigate({
                    to: (isMobileView ? "/m/subscription" : "/billing/history") as never,
                  });
                })
                .catch((err: unknown) => {
                  window.bKash?.execute().onError();
                  cleanupBkashDom();
                  setPhase("idle");
                  const msg = err instanceof Error ? err.message : t("billing.checkout.bkashExecuteFailed");
                  toast.error(msg);
                });
            },
            onClose: () => {
              cleanupBkashDom();
              if (settledRef.current) return;
              setPhase("idle");
              cancelFn({
                data: { tenant_id: tenantId, payment_row_id: paymentRowId, reason: "cancelled" },
              }).catch(() => {});
              toast.info(t("billing.checkout.bkashCancelled"));
            },
          });

          hiddenBtn.click();

          // Safety check: confirm #bKashFrameWrapper actually mounted cleanly
          window.setTimeout(() => {
            if (!settledRef.current && !document.getElementById("bKashFrameWrapper")) {
              cleanupBkashDom();
              setPhase((cur) => (cur === "modal" ? "idle" : cur));
              toast.error(t("billing.checkout.bkashScriptFailed"));
            }
          }, 1500);
        } catch (err) {
          cleanupBkashDom();
          setPhase("idle");
          const msg = err instanceof Error ? err.message : t("billing.checkout.bkashScriptFailed");
          toast.error(msg);
        }
        return;
      }

      setPhase("idle");
      toast.error(t("billing.checkout.bkashStartFailed"));
    },
    onError: (e: Error) => {
      cleanupBkashDom();
      setPhase("idle");
      toast.error(e.message);
    },
  });

  const busy = pay.isPending || phase !== "idle";
  const label =
    phase === "executing"
      ? t("billing.checkout.bkashExecuting")
      : phase === "creating" || phase === "modal"
        ? t("billing.checkout.redirectingBkash")
        : t("billing.checkout.payWithBkash", { amount: amount.toLocaleString("en-IN") });

  return (
    <Button
      type="button"
      className="h-11 w-full rounded-xl bg-[#E2136E] font-bold text-white shadow-xs hover:bg-[#c80f60]"
      disabled={busy || amount <= 0}
      onClick={() => pay.mutate()}
    >
      <Zap className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
