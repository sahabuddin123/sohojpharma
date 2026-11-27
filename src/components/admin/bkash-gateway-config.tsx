import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  FlaskConical,
  Loader2,
  Play,
  Save,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminGetBkashConfig,
  adminSaveBkashConfig,
  adminTestBkashConnection,
} from "@/lib/api/bkash.functions";
import { cn } from "@/lib/utils";

type EnvSlotForm = {
  base_url: string;
  app_key: string;
  app_secret: string;
  username: string;
  password: string;
  clear_credentials: boolean;
};

type TestOutcome = {
  ok: boolean;
  base: string;
  mode: string;
  isSandbox: boolean;
  expiresIn?: number;
  error?: string;
} | null;

const EMPTY_SLOT: EnvSlotForm = {
  base_url: "",
  app_key: "",
  app_secret: "",
  username: "",
  password: "",
  clear_credentials: false,
};

export function BkashGatewayConfig() {
  const qc = useQueryClient();
  const getConfigFn = useServerFn(adminGetBkashConfig);
  const saveConfigFn = useServerFn(adminSaveBkashConfig);
  const testConnFn = useServerFn(adminTestBkashConnection);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["admin-bkash-config"],
    queryFn: () => getConfigFn(),
  });

  const [isEnabled, setIsEnabled] = useState(true);
  const [activeMode, setActiveMode] = useState<"sandbox" | "live">("live");
  const [checkoutFlow, setCheckoutFlow] = useState<"checkout" | "tokenized">("checkout");
  const [merchantNumber, setMerchantNumber] = useState("01951413828");
  const [feePercent, setFeePercent] = useState("1.5");
  const [sandbox, setSandbox] = useState<EnvSlotForm>(EMPTY_SLOT);
  const [live, setLive] = useState<EnvSlotForm>(EMPTY_SLOT);
  const [showSecrets, setShowSecrets] = useState<{ sandbox: boolean; live: boolean }>({
    sandbox: false,
    live: false,
  });
  const [testResult, setTestResult] = useState<{ sandbox: TestOutcome; live: TestOutcome }>({
    sandbox: null,
    live: null,
  });

  useEffect(() => {
    if (!cfg) return;
    setIsEnabled(cfg.is_enabled);
    setActiveMode(cfg.active_mode);
    setCheckoutFlow(cfg.checkout_flow);
    setMerchantNumber(cfg.merchant_number || "01951413828");
    setFeePercent(String(cfg.gateway_fee_percent ?? 1.5));
    setSandbox({
      base_url: cfg.sandbox.base_url || "",
      app_key: "",
      app_secret: "",
      username: cfg.sandbox.username || "",
      password: "",
      clear_credentials: false,
    });
    setLive({
      base_url: cfg.live.base_url || "",
      app_key: "",
      app_secret: "",
      username: cfg.live.username || "",
      password: "",
      clear_credentials: false,
    });
  }, [cfg]);

  const saveMu = useMutation({
    mutationFn: () =>
      saveConfigFn({
        data: {
          is_enabled: isEnabled,
          active_mode: activeMode,
          checkout_flow: checkoutFlow,
          merchant_number: merchantNumber.trim() || "01951413828",
          gateway_fee_percent: Math.max(0, Math.min(20, Number(feePercent) || 0)),
          sandbox,
          live,
        },
      }),
    onSuccess: () => {
      toast.success("bKash গেটওয়ে সেটিংস সংরক্ষিত হয়েছে!");
      qc.invalidateQueries({ queryKey: ["admin-bkash-config"] });
      qc.invalidateQueries({ queryKey: ["bkash-checkout-public-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testMu = useMutation({
    mutationFn: async (target: "sandbox" | "live") => {
      const slot = target === "sandbox" ? sandbox : live;
      return {
        target,
        res: await testConnFn({
          data: {
            target_mode: target,
            checkout_flow: checkoutFlow,
            base_url: slot.base_url.trim() || undefined,
            app_key: slot.app_key.trim() || undefined,
            app_secret: slot.app_secret.trim() || undefined,
            username: slot.username.trim() || undefined,
            password: slot.password.trim() || undefined,
          },
        }),
      };
    },
    onSuccess: ({ target, res }) => {
      setTestResult((prev) => ({ ...prev, [target]: res }));
      if (res.ok) {
        toast.success(`${target === "sandbox" ? "Sandbox" : "Live"} bKash কানেকশন সফল!`);
      } else {
        toast.error(res.error || "Connection test failed");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> লোড হচ্ছে…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Gateway Mode & General Bar */}
      <Card className="shadow-card border-pink-200/70 dark:border-pink-900/40">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#E2136E]/10 text-[#E2136E] text-xs font-black">
                  bK
                </span>
                bKash Payment Gateway (Sandbox & Live)
              </CardTitle>
              <CardDescription className="mt-1">
                এখান থেকে টেস্ট করার জন্য <strong>Sandbox</strong> এবং প্রোডাকশনের জন্য <strong>Live</strong> মোড ও API কী কনফিগার করুন। খালি রাখলে সার্ভারের <code>.env</code> ব্যাকআপ ব্যবহৃত হবে।
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  activeMode === "sandbox"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold"
                }
              >
                {activeMode === "sandbox" ? "Active: SANDBOX (Test)" : "Active: LIVE (Production)"}
              </Badge>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5 bg-muted/30">
                <span className="text-xs font-medium">{isEnabled ? "সক্রিয়" : "বন্ধ"}</span>
                <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">সক্রিয় এনভায়রনমেন্ট (Environment)</Label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setActiveMode("sandbox")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition",
                  activeMode === "sandbox"
                    ? "bg-amber-500 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <FlaskConical className="h-3.5 w-3.5" /> Sandbox
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("live")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition",
                  activeMode === "live"
                    ? "bg-[#E2136E] text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Live
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">চেকআউট ফ্লো (Flow)</Label>
            <Select
              value={checkoutFlow}
              onValueChange={(v) => {
                const nextFlow = v as "checkout" | "tokenized";
                setCheckoutFlow(nextFlow);
                setSandbox((s) => ({
                  ...s,
                  base_url:
                    !s.base_url || s.base_url.includes("bka.sh/v1.2.0-beta")
                      ? nextFlow === "tokenized"
                        ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta"
                        : "https://checkout.sandbox.bka.sh/v1.2.0-beta"
                      : s.base_url,
                }));
                setLive((l) => ({
                  ...l,
                  base_url:
                    !l.base_url || l.base_url.includes("bka.sh/v1.2.0-beta")
                      ? nextFlow === "tokenized"
                        ? "https://tokenized.pay.bka.sh/v1.2.0-beta"
                        : "https://checkout.pay.bka.sh/v1.2.0-beta"
                      : l.base_url,
                }));
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checkout">Classic Checkout Popup (v1.2.0-beta)</SelectItem>
                <SelectItem value="tokenized">Tokenized Redirect (bKash Page)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">মার্চেন্ট / ম্যানুয়াল নম্বর</Label>
            <Input
              className="h-9 font-mono"
              value={merchantNumber}
              onChange={(e) => setMerchantNumber(e.target.value)}
              placeholder="01XXXXXXXXX"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">গেটওয়ে চার্জ (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="20"
              className="h-9"
              value={feePercent}
              onChange={(e) => setFeePercent(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Two Environment Cards: Sandbox & Live */}
      <div className="grid gap-5 lg:grid-cols-2">
        <CredentialSlotCard
          title="Sandbox Credentials (Test Mode)"
          description="পেমেন্ট টেস্টিংয়ের জন্য বিকাশ স্যান্ডবক্স App Key, Secret, Username এবং Password দিন।"
          tone="sandbox"
          configured={cfg?.sandbox.configured ?? false}
          source={cfg?.sandbox.source ?? "none"}
          hints={{
            appKey: cfg?.sandbox.app_key_hint ?? "",
            appSecret: cfg?.sandbox.app_secret_hint ?? "",
            hasPassword: cfg?.sandbox.has_password ?? false,
          }}
          value={sandbox}
          onChange={setSandbox}
          showSecret={showSecrets.sandbox}
          onToggleShow={() => setShowSecrets((s) => ({ ...s, sandbox: !s.sandbox }))}
          onTest={() => testMu.mutate("sandbox")}
          testing={testMu.isPending && testMu.variables === "sandbox"}
          testOutcome={testResult.sandbox}
          defaultBasePlaceholder={
            checkoutFlow === "tokenized"
              ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta"
              : "https://checkout.sandbox.bka.sh/v1.2.0-beta"
          }
        />

        <CredentialSlotCard
          title="Live Credentials (Production Mode)"
          description="লাইভ কাস্টমার পেমেন্ট গ্রহণের জন্য বিকাশ প্রোডাকশন মার্চেন্ট ক্রেডেনশিয়াল।"
          tone="live"
          configured={cfg?.live.configured ?? false}
          source={cfg?.live.source ?? "none"}
          hints={{
            appKey: cfg?.live.app_key_hint ?? "",
            appSecret: cfg?.live.app_secret_hint ?? "",
            hasPassword: cfg?.live.has_password ?? false,
          }}
          value={live}
          onChange={setLive}
          showSecret={showSecrets.live}
          onToggleShow={() => setShowSecrets((s) => ({ ...s, live: !s.live }))}
          onTest={() => testMu.mutate("live")}
          testing={testMu.isPending && testMu.variables === "live"}
          testOutcome={testResult.live}
          defaultBasePlaceholder={
            checkoutFlow === "tokenized"
              ? "https://tokenized.pay.bka.sh/v1.2.0-beta"
              : "https://checkout.pay.bka.sh/v1.2.0-beta"
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <p className="text-xs text-muted-foreground">
          নিরাপত্তার জন্য পূর্বে সেভ করা Secret/Password ইনপুট বক্সে প্লেইনটেক্সটে দেখানো হয় না — পরিবর্তন করতে চাইলে নতুন মান লিখে Save করুন, অপরিবর্তিত রাখতে চাইলে খালি রাখুন।
        </p>
        <Button
          type="button"
          className="gap-2 bg-[#E2136E] hover:bg-[#c80f60] text-white font-bold"
          disabled={saveMu.isPending}
          onClick={() => saveMu.mutate()}
        >
          {saveMu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          সেটিংস সংরক্ষণ করুন
        </Button>
      </div>
    </div>
  );
}

function CredentialSlotCard({
  title,
  description,
  tone,
  configured,
  source,
  hints,
  value,
  onChange,
  showSecret,
  onToggleShow,
  onTest,
  testing,
  testOutcome,
  defaultBasePlaceholder,
}: {
  title: string;
  description: string;
  tone: "sandbox" | "live";
  configured: boolean;
  source: string;
  hints: { appKey: string; appSecret: string; hasPassword: boolean };
  value: EnvSlotForm;
  onChange: (next: EnvSlotForm) => void;
  showSecret: boolean;
  onToggleShow: () => void;
  onTest: () => void;
  testing: boolean;
  testOutcome: TestOutcome;
  defaultBasePlaceholder: string;
}) {
  const sourceBadge =
    source === "database"
      ? "DB-তে সেভকৃত"
      : source === "env"
        ? "সার্ভার .env থেকে"
        : "সেট করা নেই";

  return (
    <Card
      className={cn(
        "shadow-card",
        tone === "sandbox"
          ? "border-amber-200/80 dark:border-amber-900/40"
          : "border-emerald-200/80 dark:border-emerald-900/40",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              {tone === "sandbox" ? (
                <FlaskConical className="h-4 w-4 text-amber-600" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
              )}
              {title}
            </CardTitle>
            <CardDescription className="text-xs mt-1">{description}</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-[10px]",
              configured
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-slate-300 bg-muted text-muted-foreground",
            )}
          >
            {sourceBadge}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">API Base URL</Label>
          <Input
            className="h-9 font-mono text-xs"
            value={value.base_url}
            onChange={(e) => onChange({ ...value, base_url: e.target.value })}
            placeholder={defaultBasePlaceholder}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              App Key {hints.appKey && <span className="font-mono text-[10px] text-emerald-600">({hints.appKey})</span>}
            </Label>
            <Input
              className="h-9 font-mono text-xs"
              value={value.app_key}
              onChange={(e) => onChange({ ...value, app_key: e.target.value })}
              placeholder={hints.appKey ? "অপরিবর্তিত রাখতে খালি রাখুন" : "bKash App Key"}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              App Secret {hints.appSecret && <span className="font-mono text-[10px] text-emerald-600">({hints.appSecret})</span>}
            </Label>
            <div className="relative">
              <Input
                type={showSecret ? "text" : "password"}
                className="h-9 pr-9 font-mono text-xs"
                value={value.app_secret}
                onChange={(e) => onChange({ ...value, app_secret: e.target.value })}
                placeholder={hints.appSecret ? "অপরিবর্তিত রাখতে খালি রাখুন" : "bKash App Secret"}
              />
              <button
                type="button"
                onClick={onToggleShow}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Toggle visibility"
              >
                {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Username</Label>
            <Input
              className="h-9 font-mono text-xs"
              value={value.username}
              onChange={(e) => onChange({ ...value, username: e.target.value })}
              placeholder="01XXXXXXXXX / sandboxUser"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">
              Password {hints.hasPassword && <span className="text-[10px] text-emerald-600">(সেভ করা আছে)</span>}
            </Label>
            <Input
              type={showSecret ? "text" : "password"}
              className="h-9 font-mono text-xs"
              value={value.password}
              onChange={(e) => onChange({ ...value, password: e.target.value })}
              placeholder={hints.hasPassword ? "অপরিবর্তিত রাখতে খালি রাখুন" : "bKash API Password"}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={testing}
            onClick={onTest}
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Test {tone === "sandbox" ? "Sandbox" : "Live"} Connection
          </Button>

          {source === "database" && (
            <Button
              type="button"
              variant={value.clear_credentials ? "destructive" : "ghost"}
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => onChange({ ...value, clear_credentials: !value.clear_credentials })}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {value.clear_credentials ? "Clear চিহ্নিত (Save করলে মুছবে)" : "DB কী রিসেট"}
            </Button>
          )}
        </div>

        {testOutcome && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
              testOutcome.ok
                ? "border-emerald-300 bg-emerald-50/70 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                : "border-rose-300 bg-rose-50/70 text-rose-900 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
            )}
          >
            {testOutcome.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            )}
            <div className="min-w-0">
              <p className="font-semibold">
                {testOutcome.ok
                  ? `টোকেন অনুমোদন সফল! (Expires in ~${testOutcome.expiresIn ?? 3600}s)`
                  : testOutcome.error || "Connection failed"}
              </p>
              {testOutcome.base && (
                <p className="truncate font-mono text-[10px] opacity-80">{testOutcome.base}</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
