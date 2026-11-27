import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  KeyRound,
  Languages,
  Loader2,
  LogOut,
  Moon,
  Save,
  Store,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePharmacyProfile } from "@/hooks/use-pharmacy-profile";
import { validateAndResizeAvatar } from "@/lib/image-security";
import { setAppLanguage } from "@/i18n";
import { useUIStore, type Language, type Theme } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/settings")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "সেটিংস ও প্রোফাইল — SohojPharma" },
      { name: "description", content: "স্টোর সেটিংস, ইউজার প্রোফাইল, পাসওয়ার্ড পরিবর্তন ও লগআউট।" },
    ],
  }),
  component: MobileSettings,
});

type Tab = "store" | "profile" | "password";

function MobileSettings() {
  const navigate = useNavigate();
  const { currentTenantId, user, memberships, signOut } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { profile, isLoading, saveAsync, isSaving } = usePharmacyProfile(tenantId || undefined);

  const [tab, setTab] = useState<Tab>("store");

  // Store settings form
  const [storeForm, setStoreForm] = useState({
    name: "",
    owner_name: "",
    mobile: "",
    phone: "",
    email: "",
    address_line: "",
    area: "",
    district: "",
    drug_license_no: "",
    trade_license_no: "",
  });

  useEffect(() => {
    if (!profile) return;
    setStoreForm({
      name: profile.name ?? "",
      owner_name: profile.owner_name ?? "",
      mobile: profile.mobile ?? "",
      phone: profile.phone ?? "",
      email: profile.email ?? "",
      address_line: profile.address_line ?? "",
      area: profile.area ?? "",
      district: profile.district ?? "",
      drug_license_no: profile.drug_license_no ?? "",
      trade_license_no: profile.trade_license_no ?? "",
    });
  }, [profile]);

  // User profile form
  const meta = (user?.user_metadata ?? {}) as {
    full_name?: string;
    phone?: string;
    avatar_url?: string;
  };
  const [fullName, setFullName] = useState(meta.full_name ?? "");
  const [userPhone, setUserPhone] = useState(meta.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(meta.avatar_url ?? "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarScanNote, setAvatarScanNote] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { t, i18n } = useTranslation();
  const { theme, setTheme, language } = useUIStore();
  const activeLanguage: Language =
    ((i18n.resolvedLanguage ?? i18n.language ?? language) === "en" ? "en" : "bn");

  useEffect(() => {
    setFullName(meta.full_name ?? "");
    setUserPhone(meta.phone ?? "");
    setAvatarUrl(meta.avatar_url ?? "");
  }, [meta.full_name, meta.phone, meta.avatar_url]);

  // Password change form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const roleName =
    memberships.find((m) => m.tenant_id === currentTenantId)?.role ?? "owner";

  async function handleSaveStore(e: React.FormEvent) {
    e.preventDefault();
    if (!storeForm.name.trim()) {
      toast.error("ফার্মেসির নাম দিন");
      return;
    }
    try {
      await saveAsync({
        name: storeForm.name.trim(),
        business_type: profile?.business_type ?? null,
        trade_license_no: storeForm.trade_license_no.trim() || null,
        drug_license_no: storeForm.drug_license_no.trim() || null,
        bin: profile?.bin ?? null,
        tin: profile?.tin ?? null,
        phone: storeForm.phone.trim() || null,
        mobile: storeForm.mobile.trim() || null,
        email: storeForm.email.trim() || null,
        website: profile?.website ?? null,
        address_line: storeForm.address_line.trim() || null,
        area: storeForm.area.trim() || null,
        district: storeForm.district.trim() || null,
        division: profile?.division ?? null,
        postal_code: profile?.postal_code ?? null,
        country: profile?.country ?? "Bangladesh",
        owner_name: storeForm.owner_name.trim() || null,
        manager_name: profile?.manager_name ?? null,
        opening_date: profile?.opening_date ?? null,
        logo_url: profile?.logo_url ?? null,
        receipt_logo_url: profile?.receipt_logo_url ?? null,
      });
    } catch {
      // handled by hook toast
    }
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingAvatar(true);
    setAvatarScanNote(null);
    try {
      // 1. Security scan (MIME, extension, magic bytes, script/polyglot scan) + 256x256 resize
      const processed = await validateAndResizeAvatar(file);

      let nextUrl = "";
      if (user?.id) {
        const folder = tenantId || user.id;
        const path = `${folder}/avatar-${user.id}-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("branding")
          .upload(path, processed.blob, { upsert: false, contentType: "image/jpeg" });
        if (upErr) {
          throw new Error(`স্টোরেজ আপলোড ব্যর্থ: ${upErr.message}`);
        }
        const { data: signed, error: signErr } = await supabase.storage
          .from("branding")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (signErr || !signed?.signedUrl) {
          throw new Error(signErr?.message ?? "ছবির লিংক তৈরি করা যায়নি");
        }
        nextUrl = signed.signedUrl;
      } else {
        throw new Error("ইউজার সেশন পাওয়া যায়নি");
      }

      const { error: authErr } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          phone: userPhone.trim(),
          avatar_url: nextUrl,
        },
      });
      if (authErr) throw authErr;

      setAvatarUrl(nextUrl);
      const kb = Math.max(1, Math.round(processed.finalBytes / 1024));
      setAvatarScanNote(`নিরাপত্তা যাচাই সম্পন্ন • ২৫৬×২৫৬ (${kb} KB)`);
      toast.success("প্রোফাইল ছবি নিরাপদভাবে আপলোড হয়েছে!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ছবি আপলোড করা যায়নি");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    setUploadingAvatar(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          phone: userPhone.trim(),
          avatar_url: null,
        },
      });
      if (error) throw error;
      setAvatarUrl("");
      setAvatarScanNote(null);
      toast.success("প্রোফাইল ছবি সরানো হয়েছে");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ছবি সরানো যায়নি");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function handleSelectTheme(next: Theme) {
    setTheme(next);
    toast.success(next === "dark" ? t("m.settings.themeDarkToast") : t("m.settings.themeLightToast"));
  }

  async function handleSelectLanguage(next: Language) {
    await setAppLanguage(next);
    useUIStore.setState({ language: next });
    toast.success(next === "bn" ? t("m.settings.langToastBn") : t("m.settings.langToastEn"));
  }

  async function handleSaveUserProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          phone: userPhone.trim(),
          avatar_url: avatarUrl || null,
        },
      });
      if (error) throw error;
      toast.success("ইউজার প্রোফাইল আপডেট হয়েছে!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "প্রোফাইল আপডেট করা যায়নি");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("দুটি পাসওয়ার্ড মেলেনি");
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "পাসওয়ার্ড পরিবর্তন করা যায়নি");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await signOut();
      navigate({ to: "/login" as never });
    } catch {
      toast.error("লগআউট করতে সমস্যা হয়েছে");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <PhoneShell title={t("m.settings.title")} back>
      {/* Tabs */}
      <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
        {(
          [
            { id: "store", label: t("m.settings.tabStore"), icon: Store },
            { id: "profile", label: t("m.settings.tabProfile"), icon: UserRound },
            { id: "password", label: t("m.settings.tabPassword"), icon: KeyRound },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex items-center justify-center gap-1 rounded-full py-2 text-[11px] font-semibold transition",
                tab === item.id
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Store Settings */}
      {tab === "store" && (
        <form onSubmit={handleSaveStore} className="mt-3 space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> লোড হচ্ছে...
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">ফার্মেসির নাম *</Label>
                <Input
                  value={storeForm.name}
                  onChange={(e) => setStoreForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="যেমন: Friends Pharma"
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">মালিকের নাম</Label>
                <Input
                  value={storeForm.owner_name}
                  onChange={(e) => setStoreForm((f) => ({ ...f, owner_name: e.target.value }))}
                  placeholder="মালিকের পূর্ণ নাম"
                  className="h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">মোবাইল</Label>
                  <Input
                    value={storeForm.mobile}
                    onChange={(e) => setStoreForm((f) => ({ ...f, mobile: e.target.value }))}
                    placeholder="017..."
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ফোন</Label>
                  <Input
                    value={storeForm.phone}
                    onChange={(e) => setStoreForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="02..."
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ইমেইল</Label>
                <Input
                  type="email"
                  value={storeForm.email}
                  onChange={(e) => setStoreForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="shop@email.com"
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ঠিকানা</Label>
                <Input
                  value={storeForm.address_line}
                  onChange={(e) => setStoreForm((f) => ({ ...f, address_line: e.target.value }))}
                  placeholder="বাড়ি/রোড/বাজার..."
                  className="h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">এলাকা / থানা</Label>
                  <Input
                    value={storeForm.area}
                    onChange={(e) => setStoreForm((f) => ({ ...f, area: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">জেলা</Label>
                  <Input
                    value={storeForm.district}
                    onChange={(e) => setStoreForm((f) => ({ ...f, district: e.target.value }))}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">ড্রাগ লাইসেন্স নং</Label>
                  <Input
                    value={storeForm.drug_license_no}
                    onChange={(e) => setStoreForm((f) => ({ ...f, drug_license_no: e.target.value }))}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ট্রেড লাইসেন্স নং</Label>
                  <Input
                    value={storeForm.trade_license_no}
                    onChange={(e) => setStoreForm((f) => ({ ...f, trade_license_no: e.target.value }))}
                    className="h-10"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={isSaving}
                className="w-full h-11 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white font-bold gap-1.5"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? t("m.settings.saving") : t("m.settings.saveStore")}
              </Button>
            </>
          )}
        </form>
      )}

      {/* User Profile */}
      {tab === "profile" && (
        <form onSubmit={handleSaveUserProfile} className="mt-3 space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="relative shrink-0">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-[#0d5c46] text-lg font-extrabold text-white ring-2 ring-emerald-200">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName || "Avatar"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (fullName || user?.email || "U").slice(0, 2).toUpperCase()
                )}
              </div>
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
                aria-label="প্রোফাইল ছবি আপলোড করুন"
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-[#0d5c46] text-white ring-2 ring-white shadow-sm hover:bg-[#094735] active:scale-95 transition"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{fullName || "Store User"}</p>
              <p className="truncate text-xs text-slate-500">{user?.email ?? "—"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-[#0d5c46]">
                  {roleName}
                </span>
                {avatarUrl && (
                  <button
                    type="button"
                    disabled={uploadingAvatar}
                    onClick={handleRemoveAvatar}
                    className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600 hover:bg-rose-100"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                    ছবি সরান
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">ইমেইল (লগইন আইডি)</Label>
            <Input value={user?.email ?? ""} disabled className="h-10 bg-slate-50 text-slate-500" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">পূর্ণ নাম</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="আপনার নাম লিখুন"
              className="h-10"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">মোবাইল নম্বর</Label>
            <Input
              value={userPhone}
              onChange={(e) => setUserPhone(e.target.value)}
              placeholder="017..."
              className="h-10"
            />
          </div>
          <Button
            type="submit"
            disabled={savingProfile}
            className="w-full h-11 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white font-bold gap-1.5"
          >
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingProfile ? t("m.settings.saving") : t("m.settings.saveProfile")}
          </Button>
        </form>
      )}

      {/* Password Change */}
      {tab === "password" && (
        <form onSubmit={handleChangePassword} className="mt-3 space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="space-y-1">
            <Label className="text-xs">নতুন পাসওয়ার্ড *</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="কমপক্ষে ৬ অক্ষর"
              className="h-10"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">পাসওয়ার্ড নিশ্চিত করুন *</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="আবার নতুন পাসওয়ার্ড দিন"
              className="h-10"
            />
          </div>
          <Button
            type="submit"
            disabled={savingPassword}
            className="w-full h-11 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white font-bold gap-1.5"
          >
            {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {savingPassword ? t("m.settings.updating") : t("m.settings.changePassword")}
          </Button>
        </form>
      )}

      {/* Theme & Language Preferences */}
      <div className="mt-3 space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900">{t("m.settings.appTheme")}</p>
            <p className="text-[11px] text-slate-500">{t("m.settings.appThemeDesc")}</p>
          </div>
          <div className="phone-grid-keep grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => handleSelectTheme("light")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                theme === "light"
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              {t("m.settings.light")}
            </button>
            <button
              type="button"
              onClick={() => handleSelectTheme("dark")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                theme === "dark"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              <Moon className="h-3.5 w-3.5" />
              {t("m.settings.dark")}
            </button>
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1 text-xs font-bold text-slate-900">
              <Languages className="h-3.5 w-3.5 text-[#0d5c46]" />
              {t("m.settings.languageTitle")}
            </p>
            <p className="text-[11px] text-slate-500">{t("m.settings.languageDesc")}</p>
          </div>
          <div className="phone-grid-keep grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => void handleSelectLanguage("bn")}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                activeLanguage === "bn"
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {t("m.settings.langBn")}
            </button>
            <button
              type="button"
              onClick={() => void handleSelectLanguage("en")}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition",
                activeLanguage === "en"
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {t("m.settings.langEn")}
            </button>
          </div>
        </div>
      </div>

      {/* Logout Button */}
      <div className="mt-4">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-600 hover:bg-rose-100 active:scale-[0.98] transition"
        >
          {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {loggingOut ? t("m.settings.loggingOut") : t("m.settings.logout")}
        </button>
      </div>
    </PhoneShell>
  );
}
