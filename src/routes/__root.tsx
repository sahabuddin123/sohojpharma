import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AuthGate } from "@/components/auth/auth-gate";
import { OnboardingGate } from "@/components/auth/onboarding-gate";
import { OfflineIndicator } from "@/components/offline/offline-indicator";
import { PWAUpdater } from "@/components/pwa/pwa-updater";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { startSyncEngine, setSyncTenantId } from "@/lib/offline/sync";
import { warmFullCatalog } from "@/lib/offline/warm-cache";
import i18n from "@/i18n";
import { I18nextProvider } from "react-i18next";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });

    // Auto-reload on stale dynamic import chunks from new code deployments
    const errMsg = String((error as { message?: unknown } | null | undefined)?.message || "");
    const isChunkError =
      errMsg.includes("Failed to fetch dynamically imported module") ||
      errMsg.includes("Importing a module script failed") ||
      errMsg.includes("error loading dynamically imported module") ||
      errMsg.includes("loading chunk") ||
      errMsg.includes("is not a valid JavaScript MIME type");

    if (isChunkError && typeof window !== "undefined" && navigator.onLine !== false) {
      const lastReload = sessionStorage.getItem("chunk_reload_ts");
      const now = Date.now();
      // Allow one auto-reload per 10 seconds to avoid infinite loops
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem("chunk_reload_ts", String(now));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7f5] px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-7 sm:p-8 text-center shadow-[0_20px_50px_-15px_rgba(15,23,42,0.1)] dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70 dark:bg-amber-950/40 dark:ring-amber-900">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          পেজটি লোড করা যায়নি
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          সাময়িক সমস্যা বা নতুন আপডেটের কারণে পেজটি লোড হয়নি। অনুগ্রহ করে রিফ্রেশ করুন অথবা হোম পেজে ফিরে যান।
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                router.invalidate();
                reset();
              }
            }}
            className="inline-flex h-11 w-full sm:w-auto flex-1 items-center justify-center gap-2 rounded-xl bg-[#0d5c46] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#094735] active:scale-[0.99]"
          >
            আবার চেষ্টা করুন
          </button>
          <a
            href="/"
            className="inline-flex h-11 w-full sm:w-auto flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            হোমে ফিরে যান
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "SohojPharma — Pharmacy ERP" },
      { name: "description", content: "Multi-tenant pharmacy management SaaS — inventory, POS, purchases, customers and reports." },
      { name: "theme-color", content: "#0DB39E" },
      { name: "author", content: "SohojPharma" },
      { property: "og:title", content: "SohojPharma — Pharmacy ERP" },
      { property: "og:description", content: "Multi-tenant pharmacy management SaaS — inventory, POS, purchases, customers and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "SohojPharma — Pharmacy ERP" },
      { name: "twitter:description", content: "Multi-tenant pharmacy management SaaS — inventory, POS, purchases, customers and reports." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dccf1b2b-103b-4930-b7f9-37e1367a16c3/id-preview-0af3335e--5a4b5c0b-d08a-4ffd-bdc7-a1a7b538b17e.lovable.app-1781766244521.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dccf1b2b-103b-4930-b7f9-37e1367a16c3/id-preview-0af3335e--5a4b5c0b-d08a-4ffd-bdc7-a1a7b538b17e.lovable.app-1781766244521.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600;700&display=swap" },

    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    void import("@/lib/observability/capture").then((m) => m.installGlobalErrorHandlers());
    void import("@/lib/observability/sentry").then((m) => m.initSentry());

    const handlePreloadError = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const lastReload = sessionStorage.getItem("chunk_reload_ts");
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 10000) {
        sessionStorage.setItem("chunk_reload_ts", String(now));
        window.location.reload();
      }
    };
    window.addEventListener("vite:preloadError", handlePreloadError);
    return () => window.removeEventListener("vite:preloadError", handlePreloadError);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <AuthGate>
            <OnboardingGate>
              <Outlet />
              <GlobalOfflineManager />
              <RootOfflineBadge />
              <PWAUpdater />
              <Toaster richColors position="top-right" />
            </OnboardingGate>
          </AuthGate>
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

function GlobalOfflineManager() {
  const { currentTenantId, session } = useAuth();
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (!session?.user) return;
    setSyncTenantId(currentTenantId);
    startSyncEngine(currentTenantId);
  }, [session?.user, currentTenantId]);

  useEffect(() => {
    if (!session?.user || !currentTenantId) return;
    const warm = () => {
      if (typeof navigator === "undefined" || navigator.onLine) {
        void warmFullCatalog(currentTenantId);
      }
    };
    // Slight delay after initial route paint so first render stays snappy
    const timer = setTimeout(warm, 800);
    window.addEventListener("online", warm);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", warm);
    };
  }, [session?.user, currentTenantId]);

  useEffect(() => {
    const onSynced = (e: Event) => {
      const detail = (e as CustomEvent<{ processed?: number }>).detail;
      const n = detail?.processed ?? 0;
      if (n > 0) {
        toast.success(`${n}টি অফলাইন এন্ট্রি ব্যাকগ্রাউন্ডে সার্ভারে সিঙ্ক হয়েছে ✓`);
        void queryClient.invalidateQueries({
          predicate: (q) => {
            const k = String(q.queryKey[0] ?? "");
            return (
              k.startsWith("m-") ||
              k.includes("pos-") ||
              k.includes("sales") ||
              k.includes("purchase") ||
              k.includes("customers") ||
              k.includes("products") ||
              k.includes("suppliers")
            );
          },
        });
        if (currentTenantId) {
          void warmFullCatalog(currentTenantId, true);
        }
      }
    };
    window.addEventListener("sohoj:offline-synced", onSynced);
    return () => window.removeEventListener("sohoj:offline-synced", onSynced);
  }, [queryClient, currentTenantId]);

  return null;
}

function RootOfflineBadge() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/m" || pathname.startsWith("/m/")) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <OfflineIndicator />
    </div>
  );
}
