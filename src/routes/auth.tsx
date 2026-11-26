import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { RouteErrorPanel } from "@/components/route-error";
import {
  Pill,
  Loader2,
  ShieldAlert,
  Clock,
  ArrowLeft,
  KeyRound,
  Mail,
  CheckCircle2,
  PhoneCall,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  IdCard,
  Store,
  Upload,
  X,
} from "lucide-react";
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
import { validateAndResizeDocumentImage, type ProcessedAvatar } from "@/lib/image-security";
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
  const [showPassword, setShowPassword] = useState(false);
  const [idCardDoc, setIdCardDoc] = useState<ProcessedAvatar | null>(null);
  const [shopPhotoDoc, setShopPhotoDoc] = useState<ProcessedAvatar | null>(null);
  const [processingDoc, setProcessingDoc] = useState<"id" | "shop" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  // Post-registration notice state
  const [regNotice, setRegNotice] = useState<null | {
    pharmacyName: string;
    ownerName: string;
    email: string;
    phone: string;
  }>(null);
  const [pendingNoticeOpen, setPendingNoticeOpen] = useState(false);

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
          toast.error("সার্ভারে সংযোগ করা সম্ভব হয়নি। আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।", { duration: 6000 });
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

      // 4. Check store status before redirecting to dashboard
      const { data: userRes } = await supabase.auth.getUser();
      const authUser = userRes?.user;
      if (authUser) {
        const { data: isAdmin } = await supabase.rpc("is_app_admin", { _user_id: authUser.id });
        if (!isAdmin) {
          const { data: memberships } = await supabase
            .from("tenant_members")
            .select("tenant_id, tenants(id, name, status)")
            .eq("user_id", authUser.id);

          const tenantsList = (memberships ?? []).map((m: any) => m.tenants).filter(Boolean);
          const anyActive = tenantsList.some((t: any) => t.status === "active");

          if (!anyActive) {
            const firstStatus = tenantsList[0]?.status ?? "pending";
            await supabase.auth.signOut();
            if (typeof window !== "undefined") {
              localStorage.removeItem("pc_tenant");
            }
            if (firstStatus === "pending") {
              setPendingNoticeOpen(true);
              toast.error("আপনার ফার্মেসি অ্যাকাউন্টটি এখনও অনুমোদিত হয়নি। ট্রায়াল সক্রিয় করতে SohojPharma কর্তৃপক্ষের সাথে যোগাযোগ করুন।", { duration: 7000 });
            } else if (firstStatus === "rejected") {
              toast.error("আপনার অ্যাকাউন্টটি বাতিল করা হয়েছে। কর্তৃপক্ষের সাথে যোগাযোগ করুন।");
            } else {
              toast.error(`অ্যাকাউন্ট স্ট্যাটাস: ${firstStatus}। কর্তৃপক্ষের সাথে যোগাযোগ করুন।`);
            }
            setBusy(false);
            return;
          }
        }
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
        toast.error("সার্ভারে সংযোগ করা সম্ভব হয়নি। আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDocPick = async (
    kind: "id" | "shop",
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcessingDoc(kind);
    try {
      const processed = await validateAndResizeDocumentImage(file, 1200);
      if (kind === "id") setIdCardDoc(processed);
      else setShopPhotoDoc(processed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ছবি যাচাই করা যায়নি");
    } finally {
      setProcessingDoc(null);
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
    if (!idCardDoc) {
      return toast.error("মালিকের এনআইডি / আইডি কার্ডের ছবি আপলোড করুন");
    }
    if (!shopPhotoDoc) {
      return toast.error("দোকানের ছবি আপলোড করুন");
    }
    setBusy(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("just_registered", "true");
    }
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
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("just_registered");
        }
        const msg = /duplicate|unique|already/i.test(error.message)
          ? t("toast.phoneEmailTaken")
          : error.message;
        return toast.error(msg);
      }
      if (!signUpData.session) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("just_registered");
        }
        toast.success(t("Account created"), {
          description: t("We sent a verification link to your email. Please verify your email to activate your account, then sign in."),
        });
        return;
      }
      const { data: newTenantId, error: regErr } = await supabase.rpc("register_pharmacy_store", {
        _pharmacy_name: pharmacyName,
        _owner_name: ownerName,
        _mobile: phone,
        _email: email,
        _address: address,
        _district: district,
        _trade_license: tradeLicense,
      });
      if (regErr) {
        await supabase.auth.signOut();
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("just_registered");
          localStorage.removeItem("pc_tenant");
        }
        const m = regErr.message;
        if (/duplicate_email/.test(m)) return toast.error("This email is already registered.");
        if (/duplicate_mobile/.test(m)) return toast.error("This mobile number is already registered.");
        if (/duplicate_pharmacy_name/.test(m)) return toast.error("A pharmacy with this name already exists.");
        return toast.error(m);
      }

      // Upload Owner ID Card & Shop Image to storage while signup session is active
      if (newTenantId) {
        const ts = Date.now();
        const uploadAndSign = async (suffix: string, blob: Blob) => {
          const path = `${newTenantId}/${suffix}-${ts}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("branding")
            .upload(path, blob, { upsert: false, contentType: "image/jpeg" });
          if (upErr) return null;
          const { data: signed } = await supabase.storage
            .from("branding")
            .createSignedUrl(path, 60 * 60 * 24 * 365);
          return signed?.signedUrl ?? null;
        };

        const [idUrl, shopUrl] = await Promise.all([
          uploadAndSign("kyc-owner-id", idCardDoc.blob),
          uploadAndSign("kyc-shop-photo", shopPhotoDoc.blob),
        ]);

        if (idUrl || shopUrl) {
          await supabase.auth.updateUser({
            data: {
              ...(idUrl ? { owner_id_card_url: idUrl } : {}),
              ...(shopUrl ? { shop_image_url: shopUrl } : {}),
            },
          }).catch(() => {});
          if (shopUrl) {
            await supabase
              .from("tenants")
              .update({ logo_url: shopUrl })
              .eq("id", newTenantId as string)
              .catch(() => {});
          }
        }
      }

      setIdCardDoc(null);
      setShopPhotoDoc(null);

      // Explicitly sign out: store is pending approval so user must NOT enter dashboard yet
      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        localStorage.removeItem("pc_tenant");
        sessionStorage.removeItem("just_registered");
      }

      setRegNotice({
        pharmacyName,
        ownerName,
        email,
        phone,
      });
      setActiveTab("signin");
      toast.success("নিবন্ধন সফল হয়েছে! অ্যাকাউন্ট সক্রিয় করতে SohojPharma কর্তৃপক্ষের সাথে যোগাযোগ করুন।", {
        duration: 8000,
      });
    } finally {
      setBusy(false);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("just_registered");
      }
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
    <div className="grid min-h-screen bg-[#f4f7f5] dark:bg-slate-950 lg:grid-cols-2">
      {/* Desktop Premium Brand Showcase */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#052e23] via-[#094735] to-[#0d624a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />

        <Link to="/" className="relative z-10 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-md shadow-lg">
            <Pill className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-xl font-extrabold tracking-tight">{t("app.name")}</span>
            <p className="text-[11px] font-medium text-emerald-100/80">Pharmacy ERP & POS</p>
          </div>
        </Link>

        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-white/20 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
            স্মার্ট ফার্মেসি ম্যানেজমেন্ট প্ল্যাটফর্ম
          </div>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">{t("auth.tagline")}</h2>
          <p className="max-w-md text-sm leading-relaxed text-emerald-100/85">{t("auth.subline")}</p>

          <div className="grid max-w-md grid-cols-3 gap-3 pt-2">
            {[
              { title: "দ্রুত POS", sub: "বারকোড ও বিলিং" },
              { title: "অফলাইন PWA", sub: "নেট ছাড়াও বিক্রি" },
              { title: "সিকিউর ক্লাউড", sub: "অটো ব্যাকআপ" },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur-md"
              >
                <p className="text-xs font-bold text-white">{item.title}</p>
                <p className="mt-0.5 text-[10px] text-emerald-100/75">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-emerald-100/65">© 2026 SohojPharma • All rights reserved</p>
      </div>

      {/* Right / Mobile Auth Column */}
      <div className="flex min-h-screen flex-col bg-[#f4f7f5] dark:bg-slate-950 lg:min-h-0 lg:items-center lg:justify-center lg:p-8">
        {/* Premium Mobile Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#052e23] via-[#094735] to-[#0d624a] px-6 pb-16 text-white lg:hidden">
          <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-emerald-400/20 blur-2xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-teal-300/15 blur-2xl" />
          <div className="h-[env(safe-area-inset-top)]" />

          <div className="relative z-10 flex items-center justify-between pt-4">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-md shadow-sm">
                <Pill className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight leading-none">{t("app.name")}</h1>
                <span className="text-[10px] font-medium text-emerald-100/80">স্মার্ট ফার্মেসি পোর্টাল</span>
              </div>
            </Link>
            <div className="rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-md">
              <LanguageSwitcher />
            </div>
          </div>

          <p className="relative z-10 mt-4 text-xs leading-relaxed text-emerald-100/90">
            {t("auth.subline")}
          </p>
        </div>

        <Card className="relative z-20 -mt-10 flex-1 rounded-t-[2rem] border-0 bg-white dark:bg-slate-900 shadow-[0_-8px_30px_rgba(9,71,53,0.12)] lg:mt-0 lg:w-full lg:max-w-[440px] lg:flex-none lg:rounded-3xl lg:border lg:border-slate-200/80 lg:shadow-[0_24px_60px_-15px_rgba(9,71,53,0.16)]">
          <CardContent className="px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 lg:p-8">
            <div className="mb-5 hidden items-center justify-between lg:flex">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  স্বাগতম!
                </h2>
                <p className="text-xs text-slate-500">আপনার ফার্মেসি অ্যাকাউন্টে প্রবেশ করুন</p>
              </div>
              <LanguageSwitcher />
            </div>

            {/* Post-Registration Success Card */}
            {regNotice && (
              <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-950 dark:text-emerald-100 space-y-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-emerald-600 text-white p-1.5 shrink-0 mt-0.5">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-emerald-900 dark:text-emerald-100">
                      নিবন্ধন সফল হয়েছে!
                    </h3>
                    <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                      আপনার ফার্মেসি <strong>{regNotice.pharmacyName}</strong> এর নিবন্ধন সফলভাবে সম্পন্ন হয়েছে।
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/90 dark:bg-black/40 p-3 border border-emerald-500/20 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-semibold">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>অ্যাকাউন্টটি বর্তমানে অনুমোদনের অপেক্ষায় রয়েছে (Pending Approval)</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    আপনার ৭ দিনের ফ্রি ট্রায়াল দ্রুত সক্রিয় করতে SohojPharma কর্তৃপক্ষের সাথে যোগাযোগ করুন অথবা আপনার ইমেইল চেক করুন।
                  </p>
                  <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row gap-2 font-medium">
                    <div className="flex items-center gap-1 text-foreground">
                      <PhoneCall className="h-3.5 w-3.5 text-emerald-600" />
                      <span>কর্তৃপক্ষ হেল্পলাইন: <strong className="font-mono text-sm text-pink-700 dark:text-pink-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">01951413828</strong></span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 text-emerald-600" />
                      <span>support@sohojpharma.cloud</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRegNotice(null)}
                    className="text-xs h-7 border-emerald-600 text-emerald-700 hover:bg-emerald-500/10"
                  >
                    বিজ্ঞপ্তি বন্ধ করুন
                  </Button>
                </div>
              </div>
            )}

            <BlockedBanner
              pendingNoticeOpen={pendingNoticeOpen}
              onDismiss={() => setPendingNoticeOpen(false)}
            />

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
                <TabsList className="phone-grid-keep grid h-12 w-full grid-cols-2 rounded-2xl bg-slate-100 p-1.5 dark:bg-slate-800">
                  <TabsTrigger
                    value="signin"
                    className="rounded-xl text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-[#0d5c46] data-[state=active]:shadow-sm"
                  >
                    {t("auth.signIn")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    className="rounded-xl text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-[#0d5c46] data-[state=active]:shadow-sm"
                  >
                    {t("auth.signUp")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-5">
                  <form className="space-y-4" onSubmit={handleSignIn}>
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {t("auth.email")}
                      </Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          required
                          placeholder="you@pharmacy.com"
                          className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pl-10 text-sm transition focus:bg-white focus:border-[#0d5c46] focus:ring-2 focus:ring-[#0d5c46]/15"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {t("auth.password")}
                        </Label>
                        <div className="flex items-center gap-2">
                          {remainingAttempts !== null && remainingAttempts < 5 && cooldown === 0 && (
                            <span className="text-[11px] font-semibold text-amber-600">
                              অবশিষ্ট: {remainingAttempts}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setForgotSuccess(false);
                              setActiveTab("forgot");
                            }}
                            className="text-xs font-bold text-[#0d5c46] hover:underline"
                          >
                            {t("auth.forgot")}
                          </button>
                        </div>
                      </div>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          required
                          placeholder="••••••••"
                          className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pl-10 pr-10 text-sm transition focus:bg-white focus:border-[#0d5c46] focus:ring-2 focus:ring-[#0d5c46]/15"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
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
                      className="h-12 w-full rounded-xl bg-gradient-to-r from-[#094735] via-[#0d5c46] to-[#117257] text-sm font-bold text-white shadow-[0_10px_24px_-6px_rgba(13,92,70,0.45)] transition hover:brightness-105 active:scale-[0.99]"
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

                <TabsContent value="signup" className="mt-5">
                  <form className="space-y-3" onSubmit={handleSignUp}>
                    <div className="space-y-1">
                      <Label htmlFor="full_name" className="text-xs font-semibold">{t("auth.fullName")}</Label>
                      <Input id="full_name" name="full_name" required placeholder="Dr. Rahim Khan" className="h-11 rounded-xl bg-slate-50/70" />
                    </div>
                    <div className="phone-grid-keep grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label htmlFor="phone" className="text-xs font-semibold">মোবাইল নম্বর</Label>
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
                          className="h-11 rounded-xl bg-slate-50/70"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="district" className="text-xs font-semibold">জেলা</Label>
                        <Input id="district" name="district" placeholder="Dhaka" className="h-11 rounded-xl bg-slate-50/70" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pharmacy_name" className="text-xs font-semibold">{t("auth.pharmacyName")}</Label>
                      <Input id="pharmacy_name" name="pharmacy_name" required placeholder="MedPlus Dhanmondi" className="h-11 rounded-xl bg-slate-50/70" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="email2" className="text-xs font-semibold">{t("auth.email")}</Label>
                      <Input id="email2" name="email" type="email" required placeholder="owner@pharmacy.com" className="h-11 rounded-xl bg-slate-50/70" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="address" className="text-xs font-semibold">ঠিকানা</Label>
                      <Input id="address" name="address" placeholder="Street, area" className="h-11 rounded-xl bg-slate-50/70" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="trade_license" className="text-xs font-semibold">ট্রেড লাইসেন্স (ঐচ্ছিক)</Label>
                      <Input id="trade_license" name="trade_license" placeholder="TRAD/DSCC/000000" className="h-11 rounded-xl bg-slate-50/70" />
                    </div>

                    {/* Owner ID Card & Shop Image */}
                    <div className="phone-grid-keep grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">মালিকের আইডি কার্ড *</Label>
                        {idCardDoc ? (
                          <div className="relative h-24 overflow-hidden rounded-xl border border-emerald-200 bg-slate-50">
                            <img src={idCardDoc.dataUrl} alt="Owner ID" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setIdCardDoc(null)}
                              aria-label="আইডি কার্ড ছবি সরান"
                              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/65 text-white hover:bg-black"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-2 text-center transition hover:border-[#0d5c46] hover:bg-emerald-50/40">
                            {processingDoc === "id" ? (
                              <Loader2 className="h-5 w-5 animate-spin text-[#0d5c46]" />
                            ) : (
                              <>
                                <IdCard className="h-5 w-5 text-[#0d5c46]" />
                                <span className="text-[11px] font-semibold text-slate-600">আইডি কার্ডের ছবি</span>
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                                  <Upload className="h-2.5 w-2.5" /> আপলোড
                                </span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => handleDocPick("id", e)}
                            />
                          </label>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">দোকানের ছবি *</Label>
                        {shopPhotoDoc ? (
                          <div className="relative h-24 overflow-hidden rounded-xl border border-emerald-200 bg-slate-50">
                            <img src={shopPhotoDoc.dataUrl} alt="Shop" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setShopPhotoDoc(null)}
                              aria-label="দোকানের ছবি সরান"
                              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/65 text-white hover:bg-black"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-2 text-center transition hover:border-[#0d5c46] hover:bg-emerald-50/40">
                            {processingDoc === "shop" ? (
                              <Loader2 className="h-5 w-5 animate-spin text-[#0d5c46]" />
                            ) : (
                              <>
                                <Store className="h-5 w-5 text-[#0d5c46]" />
                                <span className="text-[11px] font-semibold text-slate-600">দোকানের ছবি</span>
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                                  <Upload className="h-2.5 w-2.5" /> আপলোড
                                </span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => handleDocPick("shop", e)}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="phone-grid-keep grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <Label htmlFor="password2" className="text-xs font-semibold">{t("auth.password")}</Label>
                        <Input id="password2" name="password" type="password" required minLength={8} placeholder="৮+ অক্ষর" className="h-11 rounded-xl bg-slate-50/70" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="password_confirm" className="text-xs font-semibold">নিশ্চিত করুন</Label>
                        <Input id="password_confirm" name="password_confirm" type="password" required minLength={8} placeholder="পুনরায়" className="h-11 rounded-xl bg-slate-50/70" />
                      </div>
                    </div>
                    <Button
                      type="submit"
                      className="h-12 w-full rounded-xl bg-gradient-to-r from-[#094735] via-[#0d5c46] to-[#117257] text-sm font-bold text-white shadow-[0_10px_24px_-6px_rgba(13,92,70,0.45)] transition hover:brightness-105"
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.signUp")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}

            <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-4 text-[11px] font-medium text-slate-400 dark:border-slate-800">
              <ShieldCheck className="h-3.5 w-3.5 text-[#0d5c46]" />
              <span>নিরাপদ ও এনক্রিপ্টেড ফার্মেসি পোর্টাল • SohojPharma</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BlockedBanner({
  pendingNoticeOpen,
  onDismiss,
}: {
  pendingNoticeOpen?: boolean;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("blocked");
  if (!reason && !pendingNoticeOpen) return null;
  const effectiveReason = reason || "pending";
  const isPending = effectiveReason === "pending";

  return (
    <div
      className={`mb-4 rounded-xl border p-4 text-sm space-y-2 ${
        isPending
          ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
          : "border-destructive/40 bg-destructive/10 text-destructive"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Clock className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
        <div className="flex-1">
          <p className="font-bold text-sm">
            {isPending
              ? "ফার্মেসি অ্যাকাউন্টটি অনুমোদনের অপেক্ষায় রয়েছে"
              : t(`saas.approval.blocked.${effectiveReason}`)}
          </p>
          <p className="text-xs font-normal mt-1 opacity-90 leading-relaxed">
            {isPending
              ? "আপনার ৭ দিনের ফ্রি ট্রায়াল অ্যাকাউন্ট সক্রিয় করতে অনুগ্রহ করে SohojPharma কর্তৃপক্ষের সাথে যোগাযোগ করুন অথবা আপনার ইমেইল ইনবক্স চেক করুন।"
              : null}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      <div className="text-xs pt-2 border-t border-amber-500/20 flex flex-col sm:flex-row gap-2 font-medium">
        <div className="flex items-center gap-1">
          <PhoneCall className="h-3.5 w-3.5 text-amber-600" />
          <span>
            কর্তৃপক্ষ হেল্পলাইন:{" "}
            <strong className="font-mono text-sm text-pink-700 dark:text-pink-400 bg-white/80 dark:bg-black/40 px-1.5 py-0.5 rounded">
              01951413828
            </strong>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Mail className="h-3.5 w-3.5 text-amber-600" />
          <span>support@sohojpharma.cloud</span>
        </div>
      </div>

      {(effectiveReason === "expired" || effectiveReason === "suspended") && (
        <div className="text-xs pt-1 border-t border-amber-500/20 text-amber-800 dark:text-amber-300">
          রিনিউয়াল বা একাউন্ট সক্রিয় করতে সরাসরি বিকাশ করুন:{" "}
          <strong className="font-mono text-sm font-bold text-pink-700 bg-white/70 px-1.5 py-0.5 rounded">
            01951413828
          </strong>
          <span className="ml-1 opacity-85">(চার্জ ১.৫% / ১৫ টাকা প্রতি হাজারে)</span>
        </div>
      )}
    </div>
  );
}
