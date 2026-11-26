import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  IdCard,
  Loader2,
  Mail,
  PhoneCall,
  Pill,
  Store,
  Upload,
  X,
} from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useThemeInit } from "@/hooks/use-theme-init";
import { supabase } from "@/integrations/supabase/client";
import { validateAndResizeDocumentImage, type ProcessedAvatar } from "@/lib/image-security";
import { formatFriendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/register")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "নিবন্ধন (ফ্রি ট্রায়াল) — SohojPharma" },
      { name: "description", content: "আপনার ফার্মেসির জন্য ৭ দিনের ফ্রি ট্রায়াল অ্যাকাউন্ট তৈরি করুন।" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  useThemeInit();
  const { t, i18n } = useTranslation();
  const isBn = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("bn");

  const [busy, setBusy] = useState(false);
  const [idCardDoc, setIdCardDoc] = useState<ProcessedAvatar | null>(null);
  const [shopPhotoDoc, setShopPhotoDoc] = useState<ProcessedAvatar | null>(null);
  const [processingDoc, setProcessingDoc] = useState<"id" | "shop" | null>(null);
  const [regNotice, setRegNotice] = useState<{
    pharmacyName: string;
    ownerName: string;
    email: string;
    phone: string;
  } | null>(null);

  const handleDocPick = async (
    kind: "id" | "shop",
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcessingDoc(kind);
    try {
      const processed = await validateAndResizeDocumentImage(file, 1200, 250 * 1024);
      if (kind === "id") setIdCardDoc(processed);
      else setShopPhotoDoc(processed);
    } catch (err) {
      toast.error(formatFriendlyError(err, "ছবি যাচাই করা যায়নি"));
    } finally {
      setProcessingDoc(null);
    }
  };

  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);
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
      return toast.error(isBn ? "মালিকের আইডি কার্ডের ছবি আপলোড করুন" : "Please upload Owner ID Card photo");
    }
    if (!shopPhotoDoc) {
      return toast.error(isBn ? "দোকানের ছবি আপলোড করুন" : "Please upload Shop photo");
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
      formEl.reset();

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
      toast.success(
        isBn
          ? "নিবন্ধন সফল হয়েছে! অ্যাকাউন্ট সক্রিয় করতে SohojPharma কর্তৃপক্ষের সাথে যোগাযোগ করুন।"
          : "Registration successful! Please contact SohojPharma support to activate your account.",
        { duration: 8000 },
      );
    } catch (err) {
      toast.error(formatFriendlyError(err, "নিবন্ধন সম্পন্ন করতে সমস্যা হয়েছে।"));
    } finally {
      setBusy(false);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("just_registered");
      }
    }
  };

  return (
    <div className="grid min-h-screen bg-[#f4f7f5] dark:bg-slate-950 lg:grid-cols-2">
      {/* Desktop Brand Showcase */}
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
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            {isBn ? "৭ দিনের ফ্রি ট্রায়াল শুরু করুন" : "Start your 7-day free trial"}
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-emerald-100/85">
            {t("auth.subline")}
          </p>
          <div className="grid max-w-md grid-cols-3 gap-3 pt-2">
            {(isBn
              ? [
                  { title: "দ্রুত POS", sub: "বারকোড ও বিলিং" },
                  { title: "অফলাইন PWA", sub: "নেট ছাড়াও বিক্রি" },
                  { title: "সিকিউর ক্লাউড", sub: "অটো ব্যাকআপ" },
                ]
              : [
                  { title: "Fast POS", sub: "Barcode & Billing" },
                  { title: "Offline PWA", sub: "Sell Without Net" },
                  { title: "Secure Cloud", sub: "Auto Backup" },
                ]
            ).map((item) => (
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

      {/* Registration Form Column */}
      <div className="flex min-h-screen flex-col bg-[#f4f7f5] dark:bg-slate-950 lg:min-h-0 lg:items-center lg:justify-center lg:p-8">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#052e23] via-[#094735] to-[#0d624a] px-6 pb-16 text-white lg:hidden">
          <div className="h-[env(safe-area-inset-top)]" />
          <div className="relative z-10 flex items-center justify-between pt-4">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-md shadow-sm">
                <Pill className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight leading-none">{t("app.name")}</h1>
                <span className="text-[10px] font-medium text-emerald-100/80">
                  {isBn ? "নতুন ফার্মেসি নিবন্ধন" : "Pharmacy Registration"}
                </span>
              </div>
            </Link>
            <div className="rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-md">
              <LanguageSwitcher />
            </div>
          </div>
        </div>

        <Card className="relative z-20 -mt-10 flex-1 rounded-t-[2rem] border-0 bg-white dark:bg-slate-900 shadow-[0_-8px_30px_rgba(9,71,53,0.12)] lg:mt-0 lg:w-full lg:max-w-[480px] lg:flex-none lg:rounded-3xl lg:border lg:border-slate-200/80 lg:shadow-[0_24px_60px_-15px_rgba(9,71,53,0.16)]">
          <CardContent className="px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 lg:p-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {isBn ? "ফ্রি ট্রায়াল নিবন্ধন" : "Create Pharmacy Account"}
                </h2>
                <p className="text-xs text-slate-500">
                  {isBn ? "আপনার ফার্মেসির তথ্য দিয়ে অ্যাকাউন্ট খুলুন" : "Register your pharmacy for a 7-day free trial"}
                </p>
              </div>
              <div className="hidden lg:block">
                <LanguageSwitcher />
              </div>
            </div>

            {regNotice && (
              <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-emerald-950 dark:text-emerald-100 space-y-3 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-emerald-600 text-white p-1.5 shrink-0 mt-0.5">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-emerald-900 dark:text-emerald-100">
                      {isBn ? "নিবন্ধন সফল হয়েছে!" : "Registration Successful!"}
                    </h3>
                    <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-300">
                      <strong>{regNotice.pharmacyName}</strong>
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/90 dark:bg-black/40 p-3 border border-emerald-500/20 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-semibold">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>{isBn ? "অ্যাকাউন্টটি অনুমোদনের অপেক্ষায় রয়েছে" : "Account Pending Approval"}</span>
                  </div>
                  <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row gap-2 font-medium">
                    <div className="flex items-center gap-1 text-foreground">
                      <PhoneCall className="h-3.5 w-3.5 text-emerald-600" />
                      <span>01951413828</span>
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
                    {isBn ? "বন্ধ করুন" : "Dismiss"}
                  </Button>
                </div>
              </div>
            )}

            <form className="space-y-3" onSubmit={handleSignUp}>
              <div className="space-y-1">
                <Label htmlFor="full_name" className="text-xs font-semibold">{t("auth.fullName")}</Label>
                <Input id="full_name" name="full_name" required className="h-11 rounded-xl bg-slate-50/70" />
              </div>

              <div className="phone-grid-keep grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="phone" className="text-xs font-semibold">
                    {isBn ? "মোবাইল নম্বর" : "Phone Number"}
                  </Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    pattern="^(?:\+?880|0)1[3-9]\d{8}$"
                    title="Bangladesh mobile, e.g. 017XXXXXXXX"
                    className="h-11 rounded-xl bg-slate-50/70"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="district" className="text-xs font-semibold">
                    {isBn ? "জেলা" : "District"}
                  </Label>
                  <Input id="district" name="district" className="h-11 rounded-xl bg-slate-50/70" />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pharmacy_name" className="text-xs font-semibold">{t("auth.pharmacyName")}</Label>
                <Input id="pharmacy_name" name="pharmacy_name" required className="h-11 rounded-xl bg-slate-50/70" />
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-semibold">{t("auth.email")}</Label>
                <Input id="email" name="email" type="email" required className="h-11 rounded-xl bg-slate-50/70" />
              </div>

              <div className="space-y-1">
                <Label htmlFor="address" className="text-xs font-semibold">
                  {isBn ? "ঠিকানা" : "Address"}
                </Label>
                <Input id="address" name="address" className="h-11 rounded-xl bg-slate-50/70" />
              </div>

              <div className="space-y-1">
                <Label htmlFor="trade_license" className="text-xs font-semibold">
                  {isBn ? "ট্রেড লাইসেন্স (ঐচ্ছিক)" : "Trade License (optional)"}
                </Label>
                <Input id="trade_license" name="trade_license" className="h-11 rounded-xl bg-slate-50/70" />
              </div>

              <div className="phone-grid-keep grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">
                    {isBn ? "মালিকের আইডি কার্ড *" : "Owner ID Card *"}
                  </Label>
                  {idCardDoc ? (
                    <div className="relative h-24 overflow-hidden rounded-xl border border-emerald-200 bg-slate-50">
                      <img src={idCardDoc.dataUrl} alt="Owner ID" className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                        ✓ {Math.max(1, Math.round(idCardDoc.finalBytes / 1024))} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => setIdCardDoc(null)}
                        aria-label={isBn ? "আইডি কার্ড ছবি সরান" : "Remove ID card image"}
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
                          <span className="text-[11px] font-semibold text-slate-600">
                            {isBn ? "আইডি কার্ডের ছবি" : "ID Card Photo"}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                            <Upload className="h-2.5 w-2.5" /> {isBn ? "আপলোড" : "Upload"}
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
                  <Label className="text-xs font-semibold">
                    {isBn ? "দোকানের ছবি *" : "Shop Photo *"}
                  </Label>
                  {shopPhotoDoc ? (
                    <div className="relative h-24 overflow-hidden rounded-xl border border-emerald-200 bg-slate-50">
                      <img src={shopPhotoDoc.dataUrl} alt="Shop" className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                        ✓ {Math.max(1, Math.round(shopPhotoDoc.finalBytes / 1024))} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => setShopPhotoDoc(null)}
                        aria-label={isBn ? "দোকানের ছবি সরান" : "Remove shop photo"}
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
                          <span className="text-[11px] font-semibold text-slate-600">
                            {isBn ? "দোকানের ছবি" : "Shop Photo"}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                            <Upload className="h-2.5 w-2.5" /> {isBn ? "আপলোড" : "Upload"}
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
                  <Label htmlFor="password" className="text-xs font-semibold">{t("auth.password")}</Label>
                  <Input id="password" name="password" type="password" required minLength={8} className="h-11 rounded-xl bg-slate-50/70" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password_confirm" className="text-xs font-semibold">
                    {isBn ? "নিশ্চিত করুন" : "Confirm Password"}
                  </Label>
                  <Input id="password_confirm" name="password_confirm" type="password" required minLength={8} className="h-11 rounded-xl bg-slate-50/70" />
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

            <div className="mt-5 text-center text-xs text-slate-500">
              {isBn ? "ইতিমধ্যে অ্যাকাউন্ট আছে? " : "Already have an account? "}
              <Link
                to="/auth"
                search={{ redirect: undefined, blocked: undefined }}
                className="font-bold text-[#0d5c46] hover:underline"
              >
                {t("auth.signIn")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
