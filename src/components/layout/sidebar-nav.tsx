import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Building2,
  BarChart3,
  Settings,
  Pill,
  Receipt,
  ShieldCheck,
  Store,
  CreditCard,
  Megaphone,
  LifeBuoy,
  UserCog,
  Layers,
  Wallet,
  Code2,
  Smartphone,
  ScanLine,
  Activity,
  type LucideIcon,
  Globe2,
  Newspaper,
  Printer,
  Download,
  HandCoins,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PwaInstallButton } from "@/components/pwa/pwa-install-button";

type NavItem = { to: string; k: string; icon: LucideIcon; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const adminGroups: NavGroup[] = [
  {
    label: "nav.main",
    items: [
      { to: "/admin", k: "nav.dashboard", icon: LayoutDashboard, exact: true },
      { to: "/admin/stores", k: "nav.stores", icon: Building2 },
      { to: "/admin/reports", k: "nav.reports", icon: BarChart3 },
    ],
  },
  {
    label: "nav.commerce",
    items: [
      { to: "/admin/subscriptions", k: "nav.subscriptions", icon: Layers },
      { to: "/admin/plans", k: "nav.plans", icon: Layers },
      { to: "/admin/payments", k: "nav.payments", icon: CreditCard },
      { to: "/admin/sms", k: "saas.sms.menu", icon: Megaphone },
      { to: "/admin/advertisements", k: "nav.advertisements", icon: Megaphone },
      { to: "/admin/landing-cms", k: "nav.landingCms", icon: Globe2 },
      { to: "/admin/blog", k: "nav.blog", icon: Newspaper },
    ],
  },
  {
    label: "nav.system",
    items: [
      { to: "/admin/global-catalog", k: "nav.globalCatalog", icon: Layers },
      { to: "/admin/global-analytics", k: "nav.globalAnalytics", icon: BarChart3 },
      { to: "/admin/global-adoption", k: "nav.globalAdoption", icon: BarChart3 },
      { to: "/admin/clinical", k: "nav.clinical", icon: Activity },
      { to: "/admin/clinical-dashboard", k: "nav.clinicalDashboard", icon: Activity },
      { to: "/admin/support", k: "nav.support", icon: LifeBuoy },
      { to: "/admin/roles", k: "nav.roles", icon: ShieldCheck },
      { to: "/admin/printing", k: "nav.printingSettings", icon: Printer },
      { to: "/admin/database-backup", k: "nav.databaseBackup", icon: Layers },
      { to: "/admin/settings", k: "nav.settings", icon: Settings },
      { to: "/admin/profile", k: "nav.adminProfile", icon: UserCog },
    ],
  },
];

const storeGroups: NavGroup[] = [
  {
    label: "nav.main",
    items: [
      { to: "/store", k: "nav.dashboard", icon: LayoutDashboard, exact: true },
      { to: "/inventory", k: "nav.inventory", icon: Layers },
      { to: "/inventory/batch-control", k: "nav.batchControl", icon: Layers },
    ],
  },
  {
    label: "nav.products",
    items: [
      { to: "/products", k: "nav.productList", icon: Package, exact: true },
      { to: "/products/companies", k: "nav.companies", icon: Building2 },
      { to: "/products/generics", k: "nav.generics", icon: Pill },
      { to: "/products/requisitions", k: "nav.requisitions", icon: ShoppingCart },
      { to: "/products/requisition-records", k: "nav.requisitionRecords", icon: Layers },
      { to: "/products/expired", k: "nav.expired", icon: ShieldCheck },
      { to: "/products/barcodes", k: "nav.barcodes", icon: ScanLine },
      { to: "/products/barcodes-2", k: "nav.barcodes2", icon: ScanLine },
      { to: "/products/global-browse", k: "nav.globalBrowse", icon: Globe2 },
      { to: "/masters", k: "nav.masterData", icon: Layers },
    ],
  },
  {
    label: "nav.operations",
    items: [
      { to: "/sales", k: "nav.sales", icon: ShoppingCart },
      { to: "/invoices", k: "nav.invoices", icon: Receipt },
      { to: "/prescriptions", k: "nav.prescriptions", icon: ScanLine },
      { to: "/purchases", k: "nav.purchases", icon: Truck },
      { to: "/purchasing/requisition", k: "nav.purchaseRequisition", icon: ShoppingCart },
      { to: "/purchasing/requisition-list", k: "nav.purchaseRequisitionList", icon: Receipt },
      { to: "/customers", k: "nav.customers", icon: Users },
      { to: "/suppliers", k: "nav.suppliers", icon: Building2 },
    ],
  },
  {
    label: "nav.finance",
    items: [
      { to: "/dues", k: "nav.dues", icon: CreditCard },
      { to: "/dena-paona", k: "nav.denaPaona", icon: HandCoins },
      { to: "/accounts", k: "nav.accounts", icon: Wallet },
      { to: "/reports", k: "nav.reports", icon: BarChart3 },
      { to: "/billing", k: "billing.menu", icon: CreditCard },
    ],
  },
  {
    label: "nav.system",
    items: [
      { to: "/staff", k: "nav.staff", icon: Users },
      { to: "/ops", k: "nav.operations", icon: ShieldCheck },
      { to: "/mobile", k: "nav.mobile", icon: Smartphone },
      { to: "/developer", k: "nav.developer", icon: Code2 },
      { to: "/settings", k: "nav.settings", icon: Settings },
    ],
  },
];

interface SidebarNavProps {
  variant: "admin" | "store";
  collapsed?: boolean;
}

export function SidebarNav({ variant, collapsed = false }: SidebarNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useTranslation();
  const { isAppAdmin } = useAuth();
  const groups = variant === "admin" ? adminGroups : storeGroups;

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        className={cn(
          "flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar shadow-sm transition-[width] duration-200 ease-out",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border",
            collapsed ? "justify-center px-2" : "gap-3 px-5",
          )}
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
            <Pill className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-sidebar-foreground">{t("app.name")}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {variant === "admin" ? t("app.portalAdmin") : t("app.portalStore")}
              </p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t(group.label, { defaultValue: group.label })}
                </p>
              )}
              {group.items.map(({ to, k, icon: Icon, exact }) => {
                const active = exact
                  ? pathname === to
                  : pathname === to || pathname.startsWith(to + "/");
                const link = (
                  <Link
                    key={to}
                    to={to as never}
                    className={cn(
                      "group relative flex items-center rounded-xl text-sm font-medium outline-none transition-all",
                      "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {/* Left accent indicator */}
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity",
                        active ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    {!collapsed && <span className="truncate">{t(k)}</span>}
                  </Link>
                );

                return collapsed ? (
                  <Tooltip key={to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {t(k)}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          ))}
        </nav>

        {/* PWA install / update — store only */}
        {variant === "store" && (
          <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => window.open("/m", "_blank")}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    aria-label={t("nav.openMobileApp")}
                  >
                    <Download className="h-[18px] w-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {t("nav.openMobileApp")}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="space-y-2">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t("nav.mobileApp")}
                </p>
                <PwaInstallButton className="[&_button]:w-full [&_button]:justify-center" />
              </div>
            )}
          </div>
        )}

        {/* Footer portal switch — hidden for SaaS admins to enforce isolation */}
        {!isAppAdmin && (
          <div className="border-t border-sidebar-border p-3">
            <Link
              to={variant === "admin" ? "/store" : "/admin"}
              className={cn(
                "flex items-center rounded-xl bg-primary-soft text-sm font-medium text-primary transition-colors hover:bg-accent",
                collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2",
              )}
            >
              {variant === "admin" ? (
                <Store className="h-4 w-4 shrink-0" />
              ) : (
                <ShieldCheck className="h-4 w-4 shrink-0" />
              )}
              {!collapsed && (
                <span className="truncate">
                  {variant === "admin" ? t("nav.switchToStore") : t("nav.switchToAdmin")}
                </span>
              )}
            </Link>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
