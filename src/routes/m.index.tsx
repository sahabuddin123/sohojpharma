import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { useAuth } from "@/hooks/use-auth";
import { getStoreDashboard } from "@/lib/api/dashboard.functions";
import { buildOfflineStoreDashboard, isOfflineNetworkError } from "@/lib/offline/warm-cache";
import { cn } from "@/lib/utils";
import {
  ClipboardList,
  ShoppingCart,
  Truck,
  HandCoins,
  ReceiptText,
  FileSpreadsheet,
  Package,
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
  BookOpenCheck,
  Plus,
  Undo2,
  RotateCcw,
  Calendar,
  Settings,
  Boxes,
} from "lucide-react";

export const Route = createFileRoute("/m/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "হোম — SohojPharma" },
      {
        name: "description",
        content: "ফার্মেসি মোবাইল ড্যাশবোর্ড: বিক্রি, ক্রয়, স্টক, গ্রাহক ও ক্যাশ হিসাব।",
      },
      { name: "theme-color", content: "#0d5c46" },
    ],
  }),
  component: PhoneHome,
});

type IconTone = "emerald" | "sky" | "amber" | "rose" | "indigo" | "teal";

type Tile = {
  to: string;
  key: string;
  icon: typeof ClipboardList;
  tone: IconTone;
  badge?: "lowStock" | "expired" | "products";
};

const TONE_CLASSES: Record<IconTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  sky: "bg-sky-50 text-sky-700 border-sky-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  rose: "bg-rose-50 text-rose-600 border-rose-100",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  teal: "bg-teal-50 text-teal-700 border-teal-100",
};

const SECTIONS: Array<{ titleKey: string; tiles: Tile[] }> = [
  {
    titleKey: "m.home.secDaily",
    tiles: [
      { to: "/m/product-list", key: "m.home.tiles.productList", icon: Package, tone: "sky", badge: "products" },
      { to: "/m/products", key: "m.home.tiles.productAccounting", icon: ClipboardList, tone: "emerald" },
      { to: "/m/sale", key: "m.home.tiles.pos", icon: ShoppingCart, tone: "teal" },
      { to: "/purchases/new", key: "m.home.tiles.newPurchase", icon: Truck, tone: "sky" },
      { to: "/m/collect", key: "m.home.tiles.cashCollect", icon: HandCoins, tone: "amber" },
      { to: "/m/sales", key: "m.home.tiles.salesRecord", icon: ReceiptText, tone: "indigo" },
      { to: "/m/sale-returns", key: "m.home.tiles.saleReturn", icon: Undo2, tone: "rose" },
      { to: "/m/purchases", key: "m.home.tiles.purchaseRecord", icon: FileSpreadsheet, tone: "sky" },
      { to: "/m/purchase-returns", key: "m.home.tiles.purchaseReturn", icon: RotateCcw, tone: "amber" },
    ],
  },
  {
    titleKey: "m.home.secStock",
    tiles: [
      { to: "/m/inventory", key: "m.home.tiles.inventory", icon: Boxes, tone: "emerald" },
      { to: "/m/short-items", key: "m.home.tiles.shortItems", icon: PackageSearch, tone: "amber", badge: "lowStock" },
      { to: "/m/short-list", key: "m.home.tiles.shortList", icon: ListChecks, tone: "teal" },
      { to: "/m/expired", key: "m.home.tiles.expired", icon: CalendarX, tone: "rose", badge: "expired" },
      { to: "/m/generics", key: "m.home.tiles.generics", icon: FlaskConical, tone: "indigo" },
    ],
  },
  {
    titleKey: "m.home.secPeople",
    tiles: [
      { to: "/m/customers", key: "m.home.tiles.customers", icon: UserRound, tone: "emerald" },
      { to: "/m/suppliers", key: "m.home.tiles.suppliers", icon: Users, tone: "sky" },
      { to: "/m/staff", key: "m.home.tiles.staff", icon: IdCard, tone: "indigo" },
      { to: "/m/transactions", key: "m.home.tiles.transactions", icon: ArrowLeftRight, tone: "teal" },
      { to: "/m/expenses", key: "m.home.tiles.expenses", icon: Wallet, tone: "rose" },
      { to: "/m/income", key: "m.home.tiles.income", icon: PiggyBank, tone: "emerald" },
      { to: "/m/credit-adjustment", key: "m.home.tiles.creditAdjustment", icon: Scale, tone: "amber" },
      { to: "/m/dena-paona", key: "m.home.tiles.denaPaona", icon: BookOpenCheck, tone: "indigo" },
      { to: "/m/settings", key: "m.home.tiles.settings", icon: Settings, tone: "teal" },
    ],
  },
];

function formatMoney(v: number | undefined | null): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(v ?? 0));
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DatePreset = "today" | "yesterday" | "7d" | "month" | "custom";

function PhoneHome() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const fetchDashboard = useServerFn(getStoreDashboard);
  const todayStr = toYmd(new Date());
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);

  const getRange = (): { from: string; to: string } => {
    const now = new Date();
    if (preset === "today") return { from: todayStr, to: todayStr };
    if (preset === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toYmd(y);
      return { from: yStr, to: yStr };
    }
    if (preset === "7d") {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { from: toYmd(s), to: todayStr };
    }
    if (preset === "month") {
      return { from: `${todayStr.slice(0, 7)}-01`, to: todayStr };
    }
    return { from: customFrom || todayStr, to: customTo || customFrom || todayStr };
  };

  const { from, to } = getRange();

  const { data, isFetching } = useQuery({
    queryKey: ["m-home-kpi", currentTenantId, from, to],
    enabled: !!currentTenantId,
    staleTime: 60_000,
    queryFn: async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await buildOfflineStoreDashboard(currentTenantId!, from, to);
      }
      try {
        return await fetchDashboard({ data: { tenant_id: currentTenantId!, from_date: from, to_date: to } });
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await buildOfflineStoreDashboard(currentTenantId!, from, to);
        }
        throw err;
      }
    },
  });

  const badgeValue = (key?: Tile["badge"]) => {
    if (!key || !data) return null;
    const v =
      key === "lowStock"
        ? data.kpi.lowStock
        : key === "expired"
          ? data.kpi.expired
          : data.kpi.totalProducts;
    return v > 0 ? v : null;
  };

  return (
    <PhoneShell>
      <h1 className="sr-only">Pharmacy phone home</h1>

      {/* Today's Live Snapshot + Quick Actions */}
      <div className="mb-5 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] space-y-2.5">
        {/* Date Filter Bar */}
        <div className="space-y-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <Calendar className="mr-0.5 h-3.5 w-3.5 shrink-0 text-[#0d5c46]" />
            {(
              [
                ["today", t("m.presets.today")],
                ["yesterday", t("m.presets.yesterday")],
                ["7d", t("m.presets.7d")],
                ["month", t("m.presets.month")],
                ["custom", t("m.presets.custom")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                  preset === key
                    ? "bg-[#0d5c46] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-medium text-slate-500">{t("m.presets.start")}</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || todayStr}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-medium text-slate-500">{t("m.presets.end")}</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={todayStr}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
                />
              </label>
            </div>
          )}
        </div>

        <div className={cn("space-y-2.5 transition-opacity", isFetching && "opacity-60")}>
          {/* Row 1: Total Sale, Cash Sale, Due Sale */}
          <div className="phone-grid-keep grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 px-1.5 py-2">
              <p className="text-[10px] font-medium text-slate-500">{t("m.home.totalSales")}</p>
              <p className="mt-0.5 text-sm font-extrabold text-slate-900">
                ৳{formatMoney(data?.kpi.todaySales)}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/70 px-1.5 py-2">
              <p className="text-[10px] font-medium text-slate-500">{t("m.home.cashSales")}</p>
              <p className="mt-0.5 text-sm font-extrabold text-[#0d6e4e]">
                ৳{formatMoney(data?.kpi.todayCashSale)}
              </p>
            </div>
            <div className="rounded-xl bg-amber-50/70 px-1.5 py-2">
              <p className="text-[10px] font-medium text-slate-500">{t("m.home.dueSales")}</p>
              <p className="mt-0.5 text-sm font-extrabold text-amber-700">
                ৳{formatMoney(data?.kpi.todayDueSale)}
              </p>
            </div>
          </div>

          {/* Row 2: Due Collection, Expense, Net Profit */}
          <div className="phone-grid-keep grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-sky-50/70 px-1.5 py-2">
              <p className="text-[10px] font-medium text-slate-500">{t("m.home.dueCollection")}</p>
              <p className="mt-0.5 text-sm font-extrabold text-sky-700">
                ৳{formatMoney(data?.kpi.dueCollection)}
              </p>
            </div>
            <div className="rounded-xl bg-rose-50/70 px-1.5 py-2">
              <p className="text-[10px] font-medium text-slate-500">
                {preset === "today" ? t("m.home.todayExpense") : t("m.home.totalExpense")}
              </p>
              <p className="mt-0.5 text-sm font-extrabold text-rose-600">
                ৳{formatMoney(data?.kpi.todayExpense)}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/60 px-1.5 py-2">
              <p className="text-[10px] font-medium text-slate-500">{t("m.home.netProfit")}</p>
              <p
                className={cn(
                  "mt-0.5 text-sm font-extrabold",
                  Number(data?.kpi.todayProfit ?? 0) < 0 ? "text-rose-600" : "text-[#0d6e4e]",
                )}
              >
                {Number(data?.kpi.todayProfit ?? 0) < 0 ? "-" : ""}৳
                {formatMoney(Math.abs(Number(data?.kpi.todayProfit ?? 0)))}
              </p>
            </div>
          </div>

          {/* Row 3: Daily Hand Cash Highlight */}
          <div className="flex items-center justify-between rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3.5 py-2.5">
            <span className="text-xs font-semibold text-slate-700">{t("m.home.handCash")}</span>
            <span className="text-base font-extrabold text-[#0d5c46]">
              {Number(data?.kpi.dailyCashInHand ?? 0) < 0 ? "-" : ""}৳
              {formatMoney(Math.abs(Number(data?.kpi.dailyCashInHand ?? 0)))}
            </span>
          </div>

          {/* Row 4: Inventory Value & Product List KPI */}
          <div className="phone-grid-keep grid grid-cols-2 gap-2">
            <Link
              to={"/m/inventory" as never}
              className="flex items-center justify-between gap-1 rounded-xl border border-sky-200/70 bg-sky-50/50 px-3 py-2.5 transition hover:border-sky-300"
            >
              <span className="truncate text-[11px] font-semibold text-slate-700">{t("m.home.stockValue")}</span>
              <span className="shrink-0 text-sm font-extrabold text-sky-700 tabular-nums">
                ৳{formatMoney(data?.kpi.inventoryValue)}
              </span>
            </Link>
            <Link
              to={"/m/product-list" as never}
              className="flex items-center justify-between gap-1 rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3 py-2.5 transition hover:border-emerald-300"
            >
              <span className="truncate text-[11px] font-semibold text-slate-700">{t("m.home.productList")}</span>
              <span className="shrink-0 text-sm font-extrabold text-[#0d5c46] tabular-nums">
                {formatMoney(data?.kpi.totalProducts)}{t("m.common.itemsSuffix")}
              </span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-2.5">
          <Link
            to={"/m/sale" as never}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0d5c46] py-2.5 text-xs font-bold text-white shadow-xs active:scale-[0.98] transition"
          >
            <Plus className="h-4 w-4" />
            {t("m.home.newSale")}
          </Link>
          <Link
            to={"/purchases/new" as never}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 active:scale-[0.98] transition"
          >
            <Truck className="h-4 w-4 text-[#0d5c46]" />
            {t("m.home.newPurchase")}
          </Link>
        </div>
      </div>

      {/* Categorized Navigation Grid */}
      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <section key={section.titleKey} className="space-y-2.5">
            <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              {t(section.titleKey)}
            </h2>
            <div className="phone-grid-keep grid grid-cols-3 gap-2.5">
              {section.tiles.map((tile) => {
                const Icon = tile.icon;
                const badge = badgeValue(tile.badge);
                const label = t(tile.key);
                return (
                  <Link
                    key={tile.key}
                    to={tile.to as never}
                    className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-2 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-slate-300 active:scale-[0.96] transition"
                  >
                    {badge !== null && (
                      <span
                        className={cn(
                          "absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums",
                          tile.badge === "products" ? "bg-[#0d5c46]" : "bg-rose-600",
                        )}
                      >
                        {formatMoney(badge)}
                      </span>
                    )}
                    <div
                      className={cn(
                        "grid h-11 w-11 place-items-center rounded-2xl border",
                        TONE_CLASSES[tile.tone],
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.9} />
                    </div>
                    <p className="text-center text-[12px] font-semibold leading-tight text-slate-800">
                      {label}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </PhoneShell>
  );
}
