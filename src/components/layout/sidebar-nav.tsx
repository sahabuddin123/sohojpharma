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
  Undo2,
  RotateCcw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useUIStore } from "@/stores/ui-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PwaInstallButton } from "@/components/pwa/pwa-install-button";

const FA_ICON_MAP: Record<string, string> = {
  "/store": "fa-table-cells-large",
  "/inventory": "fa-boxes-stacked",
  "/inventory/batch-control": "fa-layer-group",
  "/products": "fa-pills",
  "/products/companies": "fa-building",
  "/products/generics": "fa-capsules",
  "/products/expired": "fa-calendar-xmark",
  "/products/barcodes-2": "fa-barcode",
  "/products/global-browse": "fa-globe",
  "/masters": "fa-database",
  "/sales": "fa-cash-register",
  "/sales/returns": "fa-rotate-left",
  "/invoices": "fa-file-invoice",
  "/prescriptions": "fa-file-prescription",
  "/purchases": "fa-truck-medical",
  "/purchases/returns": "fa-arrow-rotate-left",
  "/purchasing/requisition-list": "fa-clipboard-list",
  "/customers": "fa-users",
  "/suppliers": "fa-truck-field",
  "/dues": "fa-credit-card",
  "/dena-paona": "fa-hand-holding-dollar",
  "/accounts": "fa-wallet",
  "/reports": "fa-chart-pie",
  "/billing": "fa-receipt",
  "/staff": "fa-user-tie",
  "/ops": "fa-shield-halved",
  "/mobile": "fa-mobile-screen-button",
  "/settings": "fa-gear",
  "/admin": "fa-gauge-high",
  "/admin/stores": "fa-store",
  "/admin/reports": "fa-chart-line",
};

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
      { to: "/products/expired", k: "nav.expired", icon: ShieldCheck },
      { to: "/products/barcodes-2", k: "nav.barcodes2", icon: ScanLine },
      { to: "/products/global-browse", k: "nav.globalBrowse", icon: Globe2 },
      { to: "/masters", k: "nav.masterData", icon: Layers },
    ],
  },
  {
    label: "nav.operations",
    items: [
      { to: "/sales", k: "nav.sales", icon: ShoppingCart },
      { to: "/sales/returns", k: "nav.saleReturn", icon: Undo2 },
      { to: "/invoices", k: "nav.invoices", icon: Receipt },
      { to: "/prescriptions", k: "nav.prescriptions", icon: ScanLine },
      { to: "/purchases", k: "nav.purchases", icon: Truck },
      { to: "/purchases/returns", k: "nav.purchaseReturn", icon: RotateCcw },
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
  const isV2 = useUIStore((s) => s.desktopUiVersion === "v2");
  const groups = variant === "admin" ? adminGroups : storeGroups;

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        className={cn(
          "flex h-screen shrink-0 flex-col transition-[width] duration-200 ease-out",
          isV2
            ? "sp-v2-sidebar border-r border-white/70 dark:border-white/10"
            : "border-r border-sidebar-border bg-sidebar shadow-sm",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex h-16 items-center",
            isV2 ? "border-b border-slate-400/15 dark:border-white/10" : "border-b border-sidebar-border",
            collapsed ? "justify-center px-2" : "gap-3 px-5",
          )}
        >
          <div
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white",
              isV2
                ? "bg-gradient-to-br from-[#0d8590] to-[#1ba7ad] shadow-md"
                : "bg-brand-gradient shadow-glow",
            )}
          >
            {isV2 ? <i className="fa-solid fa-capsules text-sm" /> : <Pill className="h-5 w-5" />}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-sidebar-foreground dark:text-white">{t("app.name")}</p>
              <p className={cn("text-[11px] uppercase tracking-wider", isV2 ? "text-[#0d8590] dark:text-teal-300 font-medium" : "text-muted-foreground")}>
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
                <p
                  className={cn(
                    "px-3 pb-1 font-semibold uppercase tracking-[0.08em] text-muted-foreground",
                    isV2 ? "text-[11.5px]" : "text-[10px]",
                  )}
                >
                  {t(group.label, { defaultValue: group.label })}
                </p>
              )}
              {group.items.map(({ to, k, icon: Icon, exact }) => {
                const active = exact
                  ? pathname === to
                  : pathname === to || pathname.startsWith(to + "/");
                const faIcon = FA_ICON_MAP[to] ?? "fa-circle-dot";
                const link = (
                  <Link
                    key={to}
                    to={to as never}
                    className={cn(
                      "group relative flex items-center font-medium outline-none transition-all",
                      "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      isV2 ? "rounded-2xl text-[15px]" : "rounded-xl text-sm",
                      collapsed ? "h-10 justify-center" : isV2 ? "gap-3 px-3.5 py-2.5" : "gap-3 px-3 py-2",
                      isV2
                        ? active
                          ? "sp-v2-active-nav font-semibold text-white"
                          : "text-slate-600 hover:bg-white/55 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
                        : active
                          ? "bg-emerald-50/90 font-semibold text-[#0d5c46] dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "text-sidebar-foreground/80 hover:bg-slate-100/80 hover:text-sidebar-foreground dark:hover:bg-slate-800/60",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {/* Left accent indicator (v1 only) */}
                    {!isV2 && (
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                    )}
                    {isV2 ? (
                      <i
                        className={cn(
                          "fa-solid w-4 text-center text-[15px] shrink-0 transition-colors",
                          faIcon,
                          active ? "text-white" : "text-[#0d8590] dark:text-teal-400",
                        )}
                      />
                    ) : (
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-colors",
                          active ? "text-[#0d5c46] dark:text-emerald-400" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                    )}
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

        {/* Footer portal switch — only for SaaS admins when in admin portal */}
        {isAppAdmin && variant === "admin" && (
          <div className="border-t border-sidebar-border p-3">
            <Link
              to="/store"
              className={cn(
                "flex items-center rounded-xl bg-primary-soft text-sm font-medium text-primary transition-colors hover:bg-accent",
                collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2",
              )}
            >
              <Store className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <span className="truncate">{t("nav.switchToStore")}</span>
              )}
            </Link>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
