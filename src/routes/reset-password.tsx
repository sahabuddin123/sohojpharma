import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { Pill, KeyRound, Loader2, CheckCircle2, ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/common/language-switcher";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — SohojPharma" },
      { name: "description", content: "Set a new secure password for your SohojPharma account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if recovery session or token is active
    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setCanReset(true);
        } else {
          // Listen for recovery event
          const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, currentSession) => {
              if (event === "PASSWORD_RECOVERY" || currentSession) {
                setCanReset(true);
              }
            }
          );
          return () => {
            authListener.subscription.unsubscribe();
          };
        }
      } finally {
        setChecking(false);
      }
    }
    checkSession();
  }, []);

  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirm = String(data.get("confirm_password") ?? "");

    if (password.length < 8) {
      return toast.error("পাসওয়ার্ড ন্যূনতম ৮ অক্ষরের হতে হবে।");
    }
    if (password !== confirm) {
      return toast.error("উভয় পাসওয়ার্ড হুবহু এক হতে হবে।");
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setSuccess(true);
      toast.success("পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!");
      setTimeout(() => {
        navigate({ to: "/auth", replace: true });
      }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setBusy(false);
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
          <h2 className="text-3xl font-bold leading-tight">নতুন পাসওয়ার্ড সেট করুন</h2>
          <p className="mt-4 max-w-md text-white/85">
            আপনার অ্যাকাউন্টের নিরাপত্তা নিশ্চিত করতে শক্তিশালী এবং নতুন পাসওয়ার্ড নির্ধারণ করুন।
          </p>
        </div>
        <p className="text-xs text-white/70">© 2026 SohojPharma</p>
      </div>

      <div className="flex min-h-screen flex-col bg-background lg:min-h-0 lg:items-center lg:justify-center lg:p-6">
        <div className="relative bg-brand-gradient px-6 pb-14 text-primary-foreground lg:hidden">
          <div className="h-[env(safe-area-inset-top)]" />
          <div className="flex items-center justify-between pt-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <Pill className="h-6 w-6" />
            </div>
            <LanguageSwitcher />
          </div>
          <h1 className="mt-6 text-2xl font-extrabold leading-tight">{t("app.name")}</h1>
        </div>

        <Card className="-mt-8 flex-1 rounded-t-3xl border-0 shadow-[var(--shadow-elevated)] lg:mt-0 lg:w-full lg:max-w-md lg:flex-none lg:rounded-xl lg:border lg:border-border/60">
          <CardContent className="px-5 pb-8 pt-6 lg:p-8">
            <div className="mb-6 flex items-center justify-between">
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                সাইন ইন-এ ফিরে যান
              </Link>
              <LanguageSwitcher />
            </div>

            {success ? (
              <div className="space-y-4 text-center py-6">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 ring-8 ring-emerald-50">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">পাসওয়ার্ড পরিবর্তন সম্পন্ন!</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    আপনার পাসওয়ার্ড সফলভাবে আপডেট হয়েছে। আপনাকে লগইন পেজে নিয়ে যাওয়া হচ্ছে...
                  </p>
                </div>
                <Button
                  onClick={() => navigate({ to: "/auth", replace: true })}
                  className="w-full h-11 rounded-xl font-semibold"
                >
                  এখনই সাইন ইন করুন
                </Button>
              </div>
            ) : checking ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary mb-2" />
                যাচাই করা হচ্ছে...
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <KeyRound className="h-5 w-5" />
                    নতুন পাসওয়ার্ড লিখুন
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    নিরাপদ ও নতুন একটি পাসওয়ার্ড দিয়ে আপনার অ্যাকাউন্ট সুরক্ষিত রাখুন।
                  </p>
                </div>

                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">নতুন পাসওয়ার্ড</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      placeholder="কমপক্ষে ৮ অক্ষর লিখুন"
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">পাসওয়ার্ড নিশ্চিত করুন</Label>
                    <Input
                      id="confirm_password"
                      name="confirm_password"
                      type="password"
                      required
                      minLength={8}
                      placeholder="পাসওয়ার্ড পুনরায় লিখুন"
                      className="h-11 rounded-xl"
                    />
                  </div>

                  <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      পাসওয়ার্ডের শর্তাবলী:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-80">
                      <li>কমপক্ষে ৮টি অক্ষর হতে হবে</li>
                      <li>বর্ণ এবং সংখ্যার সমন্বয় বাঞ্ছনীয়</li>
                    </ul>
                  </div>

                  <Button
                    type="submit"
                    className="h-11 w-full rounded-xl font-semibold"
                    disabled={busy}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "পাসওয়ার্ড সংরক্ষণ করুন"}
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
