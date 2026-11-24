import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, ArrowRight, LifeBuoy, CreditCard, LogOut, PhoneCall } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/billing/locked")({
  head: () => ({ meta: [{ title: "Subscription Required — SohojPharma" }] }),
  component: LockedPage,
});

function LockedPage() {
  const { signOut, memberships, currentTenantId } = useAuth();
  const current = memberships.find((m) => m.tenant_id === currentTenantId);
  const status = (current?.tenants as any)?.status || "expired";
  const storeName = current?.tenants?.name || "Your Pharmacy";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6">
      <Card className="w-full max-w-lg shadow-xl border-slate-200 bg-white">
        <CardContent className="space-y-6 p-6 sm:p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
            <Lock className="h-8 w-8" />
          </div>

          <div>
            <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-amber-100 text-amber-800">
              {status === "suspended" ? "Store Suspended" : "Subscription Expired"}
            </span>
            <h1 className="mt-3 text-2xl font-black text-slate-900">
              {storeName} — একাউন্ট সাময়িক স্থগিত
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              আপনার স্টোরের সাবস্ক্রিপশন মেয়াদ শেষ হয়েছে অথবা এডমিন প্যানেল থেকে সাময়িক স্থগিত রাখা হয়েছে।
              স্টোর চালু করতে অনুগ্রহ করে সাবস্ক্রিপশন রিনিউ করুন অথবা সরাসরি পেমেন্ট প্রদান করুন।
            </p>
          </div>

          {/* Direct bKash Payment Box */}
          <div className="rounded-2xl border border-pink-200 bg-pink-50/60 p-4 text-left text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-pink-900 text-sm">সরাসরি বিকাশ পেমেন্ট (bKash)</span>
              <span className="font-mono font-black text-pink-700 bg-white px-2.5 py-1 rounded border border-pink-300 text-sm">
                01951413828
              </span>
            </div>
            <p className="text-pink-950 font-medium">
              ফি: <span className="font-bold">১.৫% (প্রতি ১০০০ টাকায় ১৫ টাকা চার্জ)</span>
            </p>
            <p className="text-pink-800">
              টাকা পাঠানোর পর ট্রানজেকশন আইডি দিয়ে রিনিউ ফর্ম সাবমিট করুন বা এডমিনের সাথে যোগাযোগ করুন।
            </p>
          </div>

          <div className="grid gap-3 pt-2">
            <Button asChild size="lg" className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-200">
              <Link to="/billing/plans">
                প্ল্যান রিনিউ করুন (Choose Plan) <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" className="w-full">
                <Link to="/billing">
                  <CreditCard className="mr-2 h-4 w-4 text-slate-500" /> বিলিং হিস্ট্রি
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/contact">
                  <LifeBuoy className="mr-2 h-4 w-4 text-slate-500" /> সাপোর্ট টিকেট
                </Link>
              </Button>
            </div>
          </div>

          <div className="border-t pt-4 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <PhoneCall className="h-3.5 w-3.5 text-slate-400" /> হেল্পলাইন: 01951413828
            </span>
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-semibold"
            >
              <LogOut className="h-3.5 w-3.5" /> লগআউট
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
