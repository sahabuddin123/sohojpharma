import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, LogOut, Save, Store, UserRound } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePharmacyProfile } from "@/hooks/use-pharmacy-profile";
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
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
  const [fullName, setFullName] = useState(meta.full_name ?? "");
  const [userPhone, setUserPhone] = useState(meta.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setFullName(meta.full_name ?? "");
    setUserPhone(meta.phone ?? "");
  }, [meta.full_name, meta.phone]);

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

  async function handleSaveUserProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          phone: userPhone.trim(),
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
    <PhoneShell title="সেটিংস ও প্রোফাইল" back>
      {/* Tabs */}
      <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
        {(
          [
            { id: "store", label: "স্টোর সেটিংস", icon: Store },
            { id: "profile", label: "প্রোফাইল", icon: UserRound },
            { id: "password", label: "পাসওয়ার্ড", icon: KeyRound },
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
                {isSaving ? "সেভ হচ্ছে..." : "স্টোর তথ্য সেভ করুন"}
              </Button>
            </>
          )}
        </form>
      )}

      {/* User Profile */}
      {tab === "profile" && (
        <form onSubmit={handleSaveUserProfile} className="mt-3 space-y-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0d5c46] text-base font-extrabold text-white">
              {(fullName || user?.email || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{fullName || "Store User"}</p>
              <p className="truncate text-xs text-slate-500">{user?.email ?? "—"}</p>
              <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-[#0d5c46]">
                {roleName}
              </span>
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
            {savingProfile ? "সেভ হচ্ছে..." : "প্রোফাইল সেভ করুন"}
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
            {savingPassword ? "আপডেট হচ্ছে..." : "পাসওয়ার্ড পরিবর্তন করুন"}
          </Button>
        </form>
      )}

      {/* Logout Button */}
      <div className="mt-4">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-600 hover:bg-rose-100 active:scale-[0.98] transition"
        >
          {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          {loggingOut ? "লগআউট হচ্ছে..." : "লগআউট করুন"}
        </button>
      </div>
    </PhoneShell>
  );
}
