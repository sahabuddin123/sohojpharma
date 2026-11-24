import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { useAuth } from "@/hooks/use-auth";
import { getStoreDashboard } from "@/lib/api/dashboard.functions";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  ShoppingCart,
  Truck,
  HandCoins,
  ReceiptText,
  FileSpreadsheet,
  PackageSearch,
  ListChecks,
  CalendarX,
  Users,
  UserRound,
  IdCard,
  ArrowLeftRight,
  Wallet,
  Scale,
  PiggyBank,
  FlaskConical,
} from "lucide-react";

export const Route = createFileRoute("/m/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Pharmacy App Home — SohojPharma" },
      {
        name: "description",
        content:
          "Phone home screen for your pharmacy: sales, purchase, stock, customers, suppliers and cash — one tap away.",
      },
      { property: "og:title", content: "Pharmacy App Home — SohojPharma" },
      {
        property: "og:description",
        content: "Run your pharmacy from your phone — sale, purchase, stock and cash in one app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#7f1d3a" },
    ],
  }),
  component: PhoneHome,
});

type Tile = {
  to: string;
  label: string;
  icon: typeof ClipboardList;
  tone: "rose" | "sky" | "mint";
  badge?: "lowStock" | "expired";
};

const tiles: Tile[] = [
  { to: "/products", label: "Product List", icon: ClipboardList, tone: "sky" },
  { to: "/m/sale", label: "Sale", icon: ShoppingCart, tone: "sky" },
  { to: "/purchases/new", label: "Purchase", icon: Truck, tone: "sky" },
  { to: "/m/collect", label: "Cash collect", icon: HandCoins, tone: "rose" },
  { to: "/m/sales", label: "Sale Record", icon: ReceiptText, tone: "rose" },
  { to: "/m/purchases", label: "Purchase Record", icon: FileSpreadsheet, tone: "rose" },
  { to: "/m/short-items", label: "Short items", icon: PackageSearch, tone: "rose", badge: "lowStock" },
  { to: "/inventory/reports", label: "Short list Record", icon: ListChecks, tone: "rose" },
  { to: "/m/expired", label: "Expired", icon: CalendarX, tone: "rose", badge: "expired" },
  { to: "/m/suppliers", label: "Supplier", icon: Users, tone: "mint" },
  { to: "/m/customers", label: "Customer", icon: UserRound, tone: "mint" },
  { to: "/staff/list", label: "Employee", icon: IdCard, tone: "mint" },
  { to: "/m/transactions", label: "Transaction", icon: ArrowLeftRight, tone: "sky" },
  { to: "/accounts/expenses", label: "Expenses", icon: Wallet, tone: "sky" },
  { to: "/m/credit-adjustment", label: "Credit Adjustment", icon: Scale, tone: "sky" },
  { to: "/m/income", label: "Income", icon: PiggyBank, tone: "sky" },
  { to: "/m/generics", label: "Generics", icon: FlaskConical, tone: "sky" },
];

const toneArt: Record<Tile["tone"], string> = {
  rose: "bg-[color-mix(in_oklab,var(--color-primary)_10%,transparent)] text-primary",
  sky: "bg-[color-mix(in_oklab,var(--color-accent)_35%,transparent)] text-accent-foreground",
  mint: "bg-[color-mix(in_oklab,var(--color-muted)_80%,transparent)] text-foreground",
};

const toneFoot: Record<Tile["tone"], string> = {
  rose: "bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-card))]",
  sky: "bg-[color-mix(in_oklab,var(--color-accent)_25%,var(--color-card))]",
  mint: "bg-muted/60",
};

function PhoneHome() {
  const { currentTenantId } = useAuth();
  const fetchDashboard = useServerFn(getStoreDashboard);
  const { data } = useQuery({
    queryKey: ["m-home-kpi", currentTenantId],
    enabled: !!currentTenantId,
    staleTime: 60_000,
    queryFn: () => fetchDashboard({ data: { tenant_id: currentTenantId! } }),
  });

  const badgeValue = (key?: Tile["badge"]) => {
    if (!key || !data) return null;
    const v = key === "lowStock" ? data.kpi.lowStock : data.kpi.expired;
    return v > 0 ? v : null;
  };

  return (
    <PhoneShell>
      <h1 className="sr-only">Pharmacy phone home</h1>
      <div className="phone-grid-keep grid grid-cols-3 gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const badge = badgeValue(tile.badge);
          return (
            <Link
              key={tile.label}
              to={tile.to as never}
              className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm active:scale-[0.98] transition-transform"
            >
              {badge !== null && (
                <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {badge}
                </span>
              )}
              <div className={cn("grid h-20 place-items-center", toneArt[tile.tone])}>
                <Icon className="h-8 w-8" strokeWidth={1.6} />
              </div>
              <div className={cn("px-1.5 py-2", toneFoot[tile.tone])}>
                <p className="text-center text-[12px] font-semibold leading-tight text-foreground">
                  {tile.label}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </PhoneShell>
  );
}
