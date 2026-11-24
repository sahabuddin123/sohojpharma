import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { RouteErrorPanel } from "@/components/route-error";
import { Pill, Loader2, ShieldAlert, Clock, ArrowLeft, KeyRound, Mail } from "lucide-react";
import { useState, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useThemeInit } from "@/hooks/use-theme-init";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { useServerFn } from "@tanstack/react-start";
import { checkLoginRateLimitFn, recordLoginAttemptFn } from "@/lib/api/auth-security.server";
import { ManualCaptcha } from "@/components/auth/manual-captcha";

// Security: Prevent open redirect vulnerabilities by strictly allowing only safe relative paths
function sanitizeRedirect(url?: string): string {
  if (!url) return "/dashboard";
  const trimmed = url.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
    trimmed.includes("\\")
  ) {
    return "/dashboard";
  }
  return trimmed;
}

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({
    redirect: z.string().optional(),
    blocked: z.string().optional(),
  }),
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Sign in — SohojPharma" },
      { name: "description", content: "Sign in to your SohojPharma pharmacy account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  useThemeInit();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTo = sanitizeRedirect(search.redirect);

  const [activeTab, setActiveTab] = useState<"signin" | "signup" | "forgot">("signin");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Manual CAPTCHA state
  const [captchaValue, setCaptchaValue] = useState("");
  const [expectedCaptcha, setExpectedCaptcha] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const [captchaErrorMessage, setCaptchaErrorMessage] = useState("");

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const checkRateLimit = useServerFn(checkLoginRateLimitFn);
  const recordAttempt = useServerFn(recordLoginAttemptFn);

  // Live countdown timer when locked out
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (cooldown > 0) {
      toast.error(`দয়া করে ${cooldown} সেকেন্ড অপেক্ষা করুন।`);
      return;
    }

    // 1. Validate Manual Security CAPTCHA
    if (!captchaValue.trim()) {
      setCaptchaError(true);
      setCaptchaErrorMessage("ক্যাপচার ঘরে সঠিক যোগ/বিয়োগফল লিখুন (যেমন: ৫ + ৯ = ১৪)");
      toast.error("অনুগ্রহ করে সিকিউরিটি ক্যাপচা সমাধান করুন।");
      return;
    }
    if (captchaValue.trim() !== expectedCaptcha.trim()) {
      setCaptchaError(true);
      setCaptchaErrorMessage("ক্যাপচার উত্তর ভুল হয়েছে! সঠিক যোগ/বিয়োগফল লিখুন।");
      toast.error("ক্যাপচা উত্তর সঠিক নয়! আবার চেষ্টা করুন।");
      setCaptchaValue("");
      return;
    }
    setCaptchaError(false);
    setCaptchaErrorMessage("");

    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const password = String(data.get("password") ?? "");

    if (!email || !password) {
      return toast.error("ইমেইল ও পাসওয়ার্ড প্রদান করুন");
    }

    setBusy(true);

    try {
      // 2. Check server-side rate limits (IP and email)
      const limitCheck = await checkRateLimit({ data: { email } });
      if (!limitCheck.allowed) {
        setCooldown(limitCheck.retryAfterSeconds || 60);
        setRemainingAttempts(0);
        toast.error(limitCheck.message || "অতিরিক্ত ব্যর্থ চেষ্টার কারণে সাময়িকভাবে লগইন বন্ধ রয়েছে।");
        setBusy(false);
        return;
      }

      // 3. Perform authentication via Supabase
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const isNetworkErr =
          error.message?.includes("Failed to fetch") ||
          error.message?.includes("NetworkError") ||
          (error as any).status === 0 ||
          (error as any).name === "AuthRetryableFetchError";

        if (isNetworkErr) {
          toast.error("ডাটাবেজ বা সার্ভারে সংযোগ করা সম্ভব হয়নি। Docker Desktop চালু আছে কিনা নিশ্চিত করুন।", { duration: 6000 });
          setBusy(false);
          return;
        }

        // Record failure only for auth errors, not network drops
        const failRecord = await recordAttempt({ data: { email, success: false } });
        const isInvalidCreds = error.message?.includes("Invalid login credentials");

        if (!failRecord.allowed) {
          setCooldown(failRecord.retryAfterSeconds || 60);
          setRemainingAttempts(0);
          toast.error(`অ্যাকাউন্ট সাময়িকভাবে লক করা হয়েছে। ${failRecord.retryAfterSeconds || 60} সেকেন্ড পর আবার চেষ্টা করুন।`);
        } else if (isInvalidCreds) {
          setRemainingAttempts(failRecord.remainingAttempts);
          toast.error(`ভুল ইমেইল বা পাসওয়ার্ড প্রদান করা হয়েছে। (অবশিষ্ট চেষ্টা: ${failRecord.remainingAttempts})`);
        } else {
          setRemainingAttempts(failRecord.remainingAttempts);
          toast.error(`${error.message} (অবশিষ্ট চেষ্টা: ${failRecord.remainingAttempts})`);
        }
        // Reset captcha on failure for security
        setCaptchaValue("");
        setBusy(false);
        return;
      }

      // Record success & clear failed attempts
      await recordAttempt({ data: { email, success: true } });
      setRemainingAttempts(5);
      setCooldown(0);
      toast.success(t("toast.welcomeBack"));
      navigate({ to: redirectTo, replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication error";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("CONNECTION_REFUSED")) {
        toast.error("ডাটাবেজ সার্ভারে সংযোগ করা সম্ভব হয়নি। লোকাল Docker Desktop চালু আছে কিনা নিশ্চিত করুন।");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const phoneRaw = String(data.get("phone") ?? "").trim();
    const phone = phoneRaw.replace(/[\s-]/g, "");
    const password = String(data.get("password"));
    const confirm = String(data.get("password_confirm"));
    const email = String(data.get("email")).trim().toLowerCase();
    const pharmacyName = String(data.get("pharmacy_name")).trim();
    const ownerName = String(data.get("full_name")).trim();
    const address = String(data.get("address") ?? "").trim() || undefined;
    const district = String(data.get("district") ?? "").trim() || undefined;
    const tradeLicense = String(data.get("trade_license") ?? "").trim() || undefined;
    if (!/^(?:\+?880|0)1[3-9]\d{8}$/.test(phone)) {
      return toast.error(t("toast.invalidBdPhone"));
    }
    if (password !== confirm) {
      return toast.error(t("toast.passwordsMismatch"));
    }
    setBusy(true);
    try {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?blocked=pending`,
          data: { full_name: ownerName, pharmacy_name: pharmacyName, phone },
        },
      });
      if (error) {
        const msg = /duplicate|unique|already/i.test(error.message)
          ? t("toast.phoneEmailTaken")
          : error.message;
        return toast.error(msg);
      }
      if (!signUpData.session) {
        toast.success(t("Account created"), {
          description: t("We sent a verification link to your email. Please verify your email to activate your account, then sign in."),
        });
        return;
      }
      const { error: regErr } = await supabase.rpc("register_pharmacy_store", {
        _pharmacy_name: pharmacyName,
        _owner_name: ownerName,
        _mobile: phone,
        _email: email,
        _address: address,
        _district: district,
        _trade_license: tradeLicense,
      });
      if (regErr) {
        const m = regErr.message;
        if (/duplicate_email/.test(m)) return toast.error("This email is already registered.");
        if (/duplicate_mobile/.test(m)) return toast.error("This mobile number is already registered.");
        if (/duplicate_pharmacy_name/.test(m)) return toast.error("A pharmacy with this name already exists.");
        return toast.error(m);
      }
      toast.success("Store registered. Awaiting SaaS Admin approval.");
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim().toLowerCase();

    if (!email) {
      return toast.error("ইমেইল ঠিকানা প্রদান করুন");
    }

    setForgotBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setForgotEmail(email);
      setForgotSuccess(true);
      toast.success("পাসওয়ার্ড রিসেট লিংক সফলভাবে পাঠানো হয়েছে!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "পাসওয়ার্ড রিসেট লিংক পাঠানো সম্ভব হয়নি");
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-brand-gradient p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <Pill className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">{t("app.name")}</span>
        </Link>
        <div>
          <h2 className="text-3xl font-bold leading-tight">{t("auth.tagline")}</h2>
          <p className="mt-4 max-w-md text-white/85">{t("auth.subline")}</p>
        </div>
        <p className="text-xs text-white/70">© 2026 SohojPharma</p>
      </div>

      <div className="flex min-h-screen flex-col bg-background lg:min-h-0 lg:items-center lg:justify-center lg:p-6">
        {/* App-style mobile hero */}
        <div className="relative bg-brand-gradient px-6 pb-14 text-primary-foreground lg:hidden">
          <div className="h-[env(safe-area-inset-top)]" />
          <div className="flex items-center justify-between pt-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <Pill className="h-6 w-6" />
            </div>
            <LanguageSwitcher />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold leading-tight">{t("app.name")}</h1>
          <p className="mt-1 text-sm text-primary-foreground/85">{t("auth.subline")}</p>
        </div>

        <Card className="-mt-8 flex-1 rounded-t-3xl border-0 shadow-[var(--shadow-elevated)] lg:mt-0 lg:w-full lg:max-w-md lg:flex-none lg:rounded-xl lg:border lg:border-border/60">
          <CardContent className="px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 lg:p-8">
            <div className="mb-4 hidden items-center justify-between lg:flex">
              <div className="ml-auto"><LanguageSwitcher /></div>
            </div>

            <BlockedBanner />

            {/* Security Alert Banner when temporarily locked out */}
            {cooldown > 0 && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">অ্যাকাউন্ট সাময়িকভাবে লক রয়েছে</p>
                  <p className="text-xs mt-0.5 opacity-90 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> অনুগ্রহ করে <strong className="font-mono text-sm">{cooldown}</strong> সেকেন্ড পর আবার চেষ্টা করুন।
                  </p>
                </div>
              </div>
            )}

            {/* Forgot Password View */}
            {activeTab === "forgot" ? (
              <div className="space-y-5">
                <div className="mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("signin");
                      setForgotSuccess(false);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("auth.signIn")} এ ফিরে যান
                  </button>
                </div>

                {forgotSuccess ? (
                  <div className="space-y-4 py-4 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
                      <Mail className="h-7 w-7" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-foreground">রিসেট লিংক পাঠানো হয়েছে!</h3>
                      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                        আমরা <strong className="font-semibold text-foreground">{forgotEmail}</strong> ঠিকানায় পাসওয়ার্ড রিসেট লিংক পাঠিয়েছি। আপনার ইনবক্স অথবা স্প্যাম ফোল্ডার চেক করুন।
                      </p>
                    </div>
                    <div className="pt-2 flex flex-col gap-2">
                      <Button
                        type="button"
                        onClick={() => {
                          setActiveTab("signin");
                          setForgotSuccess(false);
                        }}
                        className="h-11 rounded-xl font-semibold"
                      >
                        সাইন ইন পেজে যান
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setForgotSuccess(false)}
                        className="text-xs text-muted-foreground"
                      >
                        অন্য ইমেইল দিয়ে আবার চেষ্টা করুন
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <div className="flex items-center gap-2 text-primary font-bold text-lg">
                        <KeyRound className="h-5 w-5" />
                        পাসওয়ার্ড ভুলে গেছেন?
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        আপনার অ্যাকাউন্টের নিবন্ধিত ইমেইল ঠিকানা দিন। আমরা আপনাকে পাসওয়ার্ড পরিবর্তনের নিরাপদ লিংক পাঠিয়ে দিব।
                      </p>
                    </div>

                    <form className="space-y-4" onSubmit={handleForgotPassword}>
                      <div className="space-y-2">
                        <Label htmlFor="forgot-email">{t("auth.email")}</Label>
                        <Input
                          id="forgot-email"
                          name="email"
                          type="email"
                          required
                          defaultValue={forgotEmail}
                          placeholder="you@pharmacy.com"
                          className="h-12 rounded-xl text-base"
                        />
                      </div>

                      <Button
                        type="submit"
                        className="h-12 w-full rounded-xl text-base font-semibold active:scale-[0.99]"
                        disabled={forgotBusy}
                      >
                        {forgotBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "রিসেট লিংক পাঠান"
                        )}
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              /* Sign In / Sign Up Tabs */
              <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as "signin" | "signup")}
              >
                <TabsList className="grid h-12 w-full grid-cols-2 rounded-full bg-muted p-1">
                  <TabsTrigger value="signin" className="rounded-full text-sm font-semibold">{t("auth.signIn")}</TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-full text-sm font-semibold">{t("auth.signUp")}</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-6">
                  <form className="space-y-4" onSubmit={handleSignIn}>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t("auth.email")}</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        required
                        placeholder="you@pharmacy.com"
                        className="h-12 rounded-xl text-base"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">{t("auth.password")}</Label>
                        <div className="flex items-center gap-2">
                          {remainingAttempts !== null && remainingAttempts < 5 && cooldown === 0 && (
                            <span className="text-xs text-amber-600 font-medium">
                              অবশিষ্ট: {remainingAttempts}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setForgotSuccess(false);
                              setActiveTab("forgot");
                            }}
                            className="text-xs font-semibold text-primary hover:underline hover:text-primary/90"
                          >
                            {t("auth.forgot")}
                          </button>
                        </div>
                      </div>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        placeholder="••••••••"
                        className="h-12 rounded-xl text-base"
                      />
                    </div>

                    {/* Manual Security CAPTCHA Challenge */}
                    <ManualCaptcha
                      value={captchaValue}
                      onChange={(val) => {
                        setCaptchaValue(val);
                        if (captchaError) {
                          setCaptchaError(false);
                          setCaptchaErrorMessage("");
                        }
                      }}
                      onExpectedChange={setExpectedCaptcha}
                      error={captchaError}
                      errorMessage={captchaErrorMessage}
                    />

                    <Button
                      type="submit"
                      className="h-12 w-full rounded-xl text-base font-semibold active:scale-[0.99]"
                      disabled={busy || cooldown > 0}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : cooldown > 0 ? (
                        `লক করা হয়েছে (${cooldown}s)`
                      ) : (
                        t("auth.signIn")
                      )}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-6">
                  <form className="space-y-4" onSubmit={handleSignUp}>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">{t("auth.fullName")}</Label>
                      <Input id="full_name" name="full_name" required placeholder="Dr. Rahim Khan" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone number</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        required
                        inputMode="tel"
                        autoComplete="tel"
                        pattern="^(?:\+?880|0)1[3-9]\d{8}$"
                        placeholder="017XXXXXXXX"
                        title="Bangladesh mobile, e.g. 017XXXXXXXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pharmacy_name">{t("auth.pharmacyName")}</Label>
                      <Input id="pharmacy_name" name="pharmacy_name" required placeholder="MedPlus Dhanmondi" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email2">{t("auth.email")}</Label>
                      <Input id="email2" name="email" type="email" required placeholder="owner@pharmacy.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input id="address" name="address" placeholder="Street, area" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="district">District</Label>
                      <Input id="district" name="district" placeholder="Dhaka" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trade_license">Trade License (optional)</Label>
                      <Input id="trade_license" name="trade_license" placeholder="TRAD/DSCC/000000" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password2">{t("auth.password")}</Label>
                      <Input id="password2" name="password" type="password" required minLength={8} placeholder="ন্যূনতম ৮ অক্ষর" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password_confirm">Confirm password</Label>
                      <Input id="password_confirm" name="password_confirm" type="password" required minLength={8} placeholder="পাসওয়ার্ড পুনরায় লিখুন" />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.signUp")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BlockedBanner() {
  const { t } = useTranslation();
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("blocked");
  if (!reason) return null;
  const key = ["pending", "rejected", "suspended", "expired"].includes(reason)
    ? `saas.approval.blocked.${reason}`
    : "saas.approval.blocked.pending";
  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-sm text-amber-900 dark:text-amber-200 space-y-1.5">
      <p className="font-semibold">{t(key)}</p>
      {(reason === "expired" || reason === "suspended") && (
        <div className="text-xs pt-1 border-t border-amber-500/20 text-amber-800 dark:text-amber-300">
          রিনিউয়াল বা একাউন্ট সক্রিয় করতে যোগাযোগ করুন অথবা সরাসরি বিকাশ করুন:{" "}
          <strong className="font-mono text-sm font-bold text-pink-700 bg-white/70 px-1.5 py-0.5 rounded">01951413828</strong>
          <span className="ml-1 opacity-85">(চার্জ ১.৫% / ১৫ টাকা প্রতি হাজারে)</span>
        </div>
      )}
    </div>
  );
}
