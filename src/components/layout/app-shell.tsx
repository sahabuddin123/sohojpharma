import { useEffect, useState, type ReactNode } from "react";
import { SidebarNav } from "./sidebar-nav";
import { Topbar } from "./topbar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SubscriptionBanner } from "@/components/billing/subscription-banner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useThemeInit } from "@/hooks/use-theme-init";
import { useBrandingApply } from "@/hooks/use-branding-apply";
import { useTenantLocale } from "@/hooks/use-tenant-locale";
import { useApplySystemPreferences } from "@/hooks/use-system-preferences";
import { useAuth } from "@/hooks/use-auth";
import { useMobilePwaRedirect } from "@/hooks/use-mobile-pwa-redirect";
import { cn } from "@/lib/utils";


interface AppShellProps {
  variant: "admin" | "store";
  title?: string;
  children: ReactNode;
}

const STORAGE_KEY = "pc.sidebar.collapsed";

export function AppShell({ variant, title, children }: AppShellProps) {
  const { currentTenantId } = useAuth();
  useThemeInit();
  useBrandingApply();
  useTenantLocale();
  useApplySystemPreferences(currentTenantId ?? undefined);
  useMobilePwaRedirect(variant === "store");
  const [mobileOpen, setMobileOpen] = useState(false);

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* noop */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-[#f5f7f6] dark:bg-slate-950">
      {/* Desktop sidebar */}
      <div
        className={cn(
          "hidden shrink-0 transition-[width] duration-200 ease-out lg:block",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <div className="fixed inset-y-0 left-0 hidden lg:block">
          <SidebarNav variant={variant} collapsed={collapsed} />
        </div>
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SidebarNav variant={variant} collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          onCollapseToggle={toggleCollapsed}
          collapsed={collapsed}
          title={title}
        />
        <main className="flex-1 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:pt-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">
            <SubscriptionBanner />
            {children}
          </div>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
