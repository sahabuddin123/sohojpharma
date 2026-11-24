import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/hooks/use-auth";
import { AuthGate } from "@/components/auth/auth-gate";
import { OnboardingGate } from "@/components/auth/onboarding-gate";
import { OfflineIndicator } from "@/components/offline/offline-indicator";
import { PWAUpdater } from "@/components/pwa/pwa-updater";
import { Toaster } from "@/components/ui/sonner";
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
    const errMsg = String(error?.message || "");
    const isChunkError =
      errMsg.includes("Failed to fetch dynamically imported module") ||
      errMsg.includes("Importing a module script failed") ||
      errMsg.includes("error loading dynamically imported module") ||
      errMsg.includes("loading chunk") ||
      errMsg.includes("is not a valid JavaScript MIME type");

    if (isChunkError && typeof window !== "undefined") {
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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
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
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <AuthGate>
            <OnboardingGate>
              <Outlet />
              <div className="fixed bottom-4 right-4 z-50">
                <OfflineIndicator />
              </div>
              <PWAUpdater />
              <Toaster richColors position="top-right" />
            </OnboardingGate>
          </AuthGate>
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
