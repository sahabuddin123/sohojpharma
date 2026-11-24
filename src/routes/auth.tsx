import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { RouteErrorPanel } from "@/components/route-error";
import { Pill, Loader2, ShieldAlert, Clock } from "lucide-react";
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
import { lovable } from "@/integrations/lovable";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { useServerFn } from "@tanstack/react-start";
import { seedDemoAccounts } from "@/lib/api/demo-seed.functions";
import { checkLoginRateLimitFn, recordLoginAttemptFn } from "@/lib/api/auth-security.server";

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
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

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

    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const password = String(data.get("password") ?? "");

    if (!email || !password) {
      return toast.error("ইমেইল ও পাসওয়ার্ড প্রদান করুন");
    }

    setBusy(true);

    try {
      // 1. Check server-side rate limits (IP and email)
      const limitCheck = await checkRateLimit({ data: { email } });
      if (!limitCheck.allowed) {
        setCooldown(limitCheck.retryAfterSeconds || 60);
        setRemainingAttempts(0);
        toast.error(limitCheck.message || "অতিরিক্ত ব্যর্থ চেষ্টার কারণে সাময়িকভাবে লগইন বন্ধ রয়েছে।");
        setBusy(false);
        return;
      }

      // 2. Perform authentication via Supabase
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Record failure
        const failRecord = await recordAttempt({ data: { email, success: false } });
        if (!failRecord.allowed) {
          setCooldown(failRecord.retryAfterSeconds || 60);
          setRemainingAttempts(0);
          toast.error(`অ্যাকাউন্ট সাময়িকভাবে লক করা হয়েছে। ${failRecord.retryAfterSeconds || 60} সেকেন্ড পর আবার চেষ্টা করুন।`);
        } else {
          setRemainingAttempts(failRecord.remainingAttempts);
          toast.error(`${error.message} (অবশিষ্ট চেষ্টা: ${failRecord.remainingAttempts})`);
        }
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
      toast.error(err instanceof Error ? err.message : "Authentication error");
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

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + redirectTo,
    });
    if (result.error) {
      setBusy(false);
      toast.error(result.error.message ?? t("toast.googleSignInFailed"));
      return;
    }
    if (result.redirected) return;
    navigate({ to: redirectTo, replace: true });
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

            <Tabs defaultValue="signin">
              <TabsList className="grid h-12 w-full grid-cols-2 rounded-full bg-muted p-1">
                <TabsTrigger value="signin" className="rounded-full text-sm font-semibold">{t("auth.signIn")}</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-full text-sm font-semibold">{t("auth.signUp")}</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form className="space-y-5" onSubmit={handleSignIn}>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input id="email" name="email" type="email" required placeholder="you@pharmacy.com" className="h-12 rounded-xl text-base" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">{t("auth.password")}</Label>
                      {remainingAttempts !== null && remainingAttempts < 5 && cooldown === 0 && (
                        <span className="text-xs text-amber-600 font-medium">
                          অবশিষ্ট চেষ্টা: {remainingAttempts}
                        </span>
                      )}
                    </div>
                    <Input id="password" name="password" type="password" required placeholder="••••••••" className="h-12 rounded-xl text-base" />
                  </div>
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

                {/* Only display demo credentials in development mode */}
                {import.meta.env.DEV && <DemoCredentials />}
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
            
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DemoCredentials() {
  const seed = useServerFn(seedDemoAccounts);
  const [busy, setBusy] = useState(false);
  const accounts = [
    { role: "Super Admin", email: "superadmin@gmail.com", password: "123456" },
    { role: "Admin (MedPlus Dhanmondi)", email: "admin@gmail.com", password: "123456" },
  ];
  const fill = (email: string, password: string) => {
    const e = document.getElementById("email") as HTMLInputElement | null;
    const p = document.getElementById("password") as HTMLInputElement | null;
    if (e) e.value = email;
    if (p) p.value = password;
  };
  const onSeed = async () => {
    setBusy(true);
    try {
      const res = await seed();
      toast.success(
        res.results.map((r) => `${r.email}: ${r.status}`).join(" • "),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seeding failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-muted-foreground">Demo accounts (dev only)</span>
        <Button type="button" size="sm" variant="ghost" onClick={onSeed} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Seed"}
        </Button>
      </div>
      <ul className="space-y-1">
        {accounts.map((a) => (
          <li key={a.email} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground">{a.role}:</span> {a.email} / {a.password}
            </span>
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => fill(a.email, a.password)}
            >
              use
            </button>
          </li>
        ))}
      </ul>
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


function GoogleBlock({
  onClick, disabled, label, or,
}: { onClick: () => void; disabled: boolean; label: string; or: string }) {
  return (
    <div className="mt-6">
      <div className="relative my-4 text-center text-xs text-muted-foreground">
        <span className="relative z-10 bg-card px-2">{or}</span>
        <div className="absolute inset-x-0 top-1/2 -z-0 border-t border-border" />
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={onClick} disabled={disabled}>
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        {label}
      </Button>
    </div>
  );
}
