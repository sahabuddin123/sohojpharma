import { useEffect } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";

const RELOAD_KEY = "sohoj_chunk_reload_at";

function isStaleChunkError(msg: string): boolean {
  return /failed to fetch dynamically imported module|importing a module script failed|loading chunk|err_module_not_found|dynamically imported module/i.test(
    msg,
  );
}

function getFriendlyMessage(raw: string): { title: string; body: string; isStale: boolean } {
  if (isStaleChunkError(raw)) {
    return {
      title: "নতুন আপডেট পাওয়া গেছে",
      body: "অ্যাপটির নতুন ভার্সন আপডেট হয়েছে। অনুগ্রহ করে পেজটি একবার রিফ্রেশ করুন।",
      isStale: true,
    };
  }
  if (/network|fetch|offline|internet/i.test(raw)) {
    return {
      title: "ইন্টারনেট সংযোগ সমস্যা",
      body: "সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না। অনুগ্রহ করে ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।",
      isStale: false,
    };
  }
  if (raw.trimStart().startsWith("<") || /<!doctype\s+html/i.test(raw)) {
    return {
      title: "পেজটি রিলোড প্রয়োজন",
      body: "অস্থায়ী সমস্যার কারণে অনুরোধটি সম্পন্ন হয়নি। অনুগ্রহ করে পেজটি রিফ্রেশ করুন।",
      isStale: true,
    };
  }
  return {
    title: "সাময়িক সমস্যা হয়েছে",
    body: "অনুগ্রহ করে পেজটি রিফ্রেশ করুন অথবা একটু পর আবার চেষ্টা করুন।",
    isStale: false,
  };
}

export function RouteErrorPanel({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const raw = error instanceof Error ? error.message : "";
  const { title, body, isStale } = getFriendlyMessage(raw);

  // Automatically reload once when a new deploy invalidates old JS chunk hashes
  useEffect(() => {
    if (!isStale || typeof window === "undefined") return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
      if (Date.now() - last > 15_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // ignore storage errors
    }
  }, [isStale]);

  return (
    <div className="mx-auto my-8 max-w-md px-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="mt-3 text-base font-extrabold text-slate-900">{title}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{body}</p>
        <div className="mt-5 flex items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (isStale && typeof window !== "undefined") {
                window.location.reload();
              } else {
                reset();
                router.invalidate();
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0d5c46] px-4 py-2 text-xs font-bold text-white hover:bg-[#094735]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            রিফ্রেশ করুন
          </button>
          <button
            type="button"
            onClick={() => router.history.back()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            পেছনে যান
          </button>
        </div>
      </div>
    </div>
  );
}

export function RouteNotFoundPanel({ label = "তথ্য" }: { label?: string }) {
  const router = useRouter();
  return (
    <div className="mx-auto my-8 max-w-md px-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-base font-extrabold text-slate-900">{label} পাওয়া যায়নি</h2>
        <p className="mt-1.5 text-xs text-slate-600">
          তথ্যটি মুছে ফেলা হয়ে থাকতে পারে অথবা আপনার দেখার অনুমতি নেই।
        </p>
        <button
          type="button"
          onClick={() => router.history.back()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          পেছনে যান
        </button>
      </div>
    </div>
  );
}
