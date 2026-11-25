import { useState } from "react";
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
  label: string;
  icon: typeof ClipboardList;
  tone: IconTone;
  badge?: "lowStock" | "expired";
};

const TONE_CLASSES: Record<IconTone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
  sky: "bg-sky-50 text-sky-700 border-sky-100",
  amber: "bg-amber-50 text-amber-700 border-amber-100",
  rose: "bg-rose-50 text-rose-600 border-rose-100",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  teal: "bg-teal-50 text-teal-700 border-teal-100",
};

const SECTIONS: Array<{ title: string; tiles: Tile[] }> = [
  {
    title: "দৈনন্দিন কার্যক্রম",
    tiles: [
      { to: "/m/products", label: "পণ্যের হিসাব", icon: ClipboardList, tone: "emerald" },
      { to: "/m/sale", label: "বিক্রি (POS)", icon: ShoppingCart, tone: "teal" },
      { to: "/purchases/new", label: "নতুন ক্রয়", icon: Truck, tone: "sky" },
      { to: "/m/collect", label: "ক্যাশ কালেক্ট", icon: HandCoins, tone: "amber" },
      { to: "/m/sales", label: "বিক্রি রেকর্ড", icon: ReceiptText, tone: "indigo" },
      { to: "/m/sale-returns", label: "বিক্রি রিটার্ন", icon: Undo2, tone: "rose" },
      { to: "/m/purchases", label: "ক্রয় রেকর্ড", icon: FileSpreadsheet, tone: "sky" },
      { to: "/m/purchase-returns", label: "ক্রয় রিটার্ন", icon: RotateCcw, tone: "amber" },
    ],
  },
  {
    title: "স্টক ও সতর্কতা",
    tiles: [
      { to: "/m/inventory", label: "ইনভেন্টরি", icon: Boxes, tone: "emerald" },
      { to: "/m/short-items", label: "শর্ট আইটেম", icon: PackageSearch, tone: "amber", badge: "lowStock" },
      { to: "/m/short-list", label: "শর্ট লিস্ট", icon: ListChecks, tone: "teal" },
      { to: "/m/expired", label: "মেয়াদোত্তীর্ণ", icon: CalendarX, tone: "rose", badge: "expired" },
      { to: "/m/generics", label: "জেনেরিক", icon: FlaskConical, tone: "indigo" },
    ],
  },
  {
    title: "ব্যক্তি ও হিসাব",
    tiles: [
      { to: "/m/customers", label: "গ্রাহক", icon: UserRound, tone: "emerald" },
      { to: "/m/suppliers", label: "সরবরাহকারী", icon: Users, tone: "sky" },
      { to: "/m/staff", label: "কর্মচারী", icon: IdCard, tone: "indigo" },
      { to: "/m/transactions", label: "লেনদেন", icon: ArrowLeftRight, tone: "teal" },
      { to: "/m/expenses", label: "খরচ", icon: Wallet, tone: "rose" },
      { to: "/m/income", label: "আয়", icon: PiggyBank, tone: "emerald" },
      { to: "/m/credit-adjustment", label: "ক্রেডিট অ্যাডজাস্ট", icon: Scale, tone: "amber" },
      { to: "/m/dena-paona", label: "দেনা-পাওনা", icon: BookOpenCheck, tone: "indigo" },
      { to: "/m/settings", label: "সেটিংস ও প্রোফাইল", icon: Settings, tone: "teal" },
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
    queryFn: () => fetchDashboard({ data: { tenant_id: currentTenantId!, from_date: from, to_date: to } }),
  });

  const badgeValue = (key?: Tile["badge"]) => {
    if (!key || !data) return null;
    const v = key === "lowStock" ? data.kpi.lowStock : data.kpi.expired;
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
                ["today", "আজ"],
                ["yesterday", "গতকাল"],
                ["7d", "৭ দিন"],
                ["month", "এই মাস"],
                ["custom", "তারিখ"],
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
                <span className="mb-0.5 block text-[10px] font-medium text-slate-500">শুরু</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || todayStr}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-[#0d5c46]"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-medium text-slate-500">শেষ</span>
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
            <p className="text-[10px] font-medium text-slate-500">মোট বিক্রি</p>
            <p className="mt-0.5 text-sm font-extrabold text-slate-900">
              ৳{formatMoney(data?.kpi.todaySales)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50/70 px-1.5 py-2">
            <p className="text-[10px] font-medium text-slate-500">নগদ বিক্রি</p>
            <p className="mt-0.5 text-sm font-extrabold text-[#0d6e4e]">
              ৳{formatMoney(data?.kpi.todayCashSale)}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50/70 px-1.5 py-2">
            <p className="text-[10px] font-medium text-slate-500">বাকি বিক্রি</p>
            <p className="mt-0.5 text-sm font-extrabold text-amber-700">
              ৳{formatMoney(data?.kpi.todayDueSale)}
            </p>
          </div>
        </div>

        {/* Row 2: Due Collection, Expense, Net Profit */}
        <div className="phone-grid-keep grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-sky-50/70 px-1.5 py-2">
            <p className="text-[10px] font-medium text-slate-500">বাকি আদায়</p>
            <p className="mt-0.5 text-sm font-extrabold text-sky-700">
              ৳{formatMoney(data?.kpi.dueCollection)}
            </p>
          </div>
          <div className="rounded-xl bg-rose-50/70 px-1.5 py-2">
            <p className="text-[10px] font-medium text-slate-500">
              {preset === "today" ? "আজকের খরচ" : "মোট খরচ"}
            </p>
            <p className="mt-0.5 text-sm font-extrabold text-rose-600">
              ৳{formatMoney(data?.kpi.todayExpense)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50/60 px-1.5 py-2">
            <p className="text-[10px] font-medium text-slate-500">নিট লাভ</p>
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
          <span className="text-xs font-semibold text-slate-700">দৈনিক হাতে ক্যাশ (Hand Cash)</span>
          <span className="text-base font-extrabold text-[#0d5c46]">
            {Number(data?.kpi.dailyCashInHand ?? 0) < 0 ? "-" : ""}৳
            {formatMoney(Math.abs(Number(data?.kpi.dailyCashInHand ?? 0)))}
          </span>
        </div>

        {/* Row 4: Inventory Value */}
        <Link
          to={"/m/products" as never}
          className="flex items-center justify-between rounded-xl border border-sky-200/70 bg-sky-50/50 px-3.5 py-2.5 transition hover:border-sky-300"
        >
          <span className="text-xs font-semibold text-slate-700">ইনভেন্টোরি মূল্য</span>
          <span className="text-base font-extrabold text-sky-700">
            ৳{formatMoney(data?.kpi.inventoryValue)}
          </span>
        </Link>
        </div>

        <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-2.5">
          <Link
            to={"/m/sale" as never}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#0d5c46] py-2.5 text-xs font-bold text-white shadow-xs active:scale-[0.98] transition"
          >
            <Plus className="h-4 w-4" />
            নতুন বিক্রি
          </Link>
          <Link
            to={"/purchases/new" as never}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-100 active:scale-[0.98] transition"
          >
            <Truck className="h-4 w-4 text-[#0d5c46]" />
            নতুন ক্রয়
          </Link>
        </div>
      </div>

      {/* Categorized Navigation Grid */}
      <div className="space-y-5">
        {SECTIONS.map((section) => (
          <section key={section.title} className="space-y-2.5">
            <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              {section.title}
            </h2>
            <div className="phone-grid-keep grid grid-cols-3 gap-2.5">
              {section.tiles.map((tile) => {
                const Icon = tile.icon;
                const badge = badgeValue(tile.badge);
                return (
                  <Link
                    key={tile.label}
                    to={tile.to as never}
                    className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-2 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-slate-300 active:scale-[0.96] transition"
                  >
                    {badge !== null && (
                      <span className="absolute right-2 top-2 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {badge}
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
                      {tile.label}
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
