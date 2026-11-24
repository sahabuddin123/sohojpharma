import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, ShoppingBag, Banknote, CreditCard, Ban, Calendar, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/staff/performance")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Salesman Performance — SohojPharma" }] }),
  component: PerformancePage,
});

type TimePeriod = "today" | "yesterday" | "this_week" | "this_month";

const mockStaffSales: Record<TimePeriod, Array<{
  name: string;
  role: string;
  sales: number;
  invoices: number;
  cashCollected: number;
  creditGiven: number;
  voidCount: number;
  score: number;
}>> = {
  today: [
    { name: "Sumon Ahmed", role: "সেলসম্যান / ক্যাশিয়ার", sales: 18450, invoices: 24, cashCollected: 16200, creditGiven: 2250, voidCount: 0, score: 96 },
    { name: "Karim Hossain", role: "ম্যানেজার", sales: 12200, invoices: 14, cashCollected: 12200, creditGiven: 0, voidCount: 0, score: 94 },
    { name: "Rina Khatun", role: "ফার্মাসিস্ট", sales: 9800, invoices: 12, cashCollected: 8900, creditGiven: 900, voidCount: 1, score: 88 },
  ],
  yesterday: [
    { name: "Sumon Ahmed", role: "সেলসম্যান / ক্যাশিয়ার", sales: 24500, invoices: 32, cashCollected: 21500, creditGiven: 3000, voidCount: 0, score: 95 },
    { name: "Karim Hossain", role: "ম্যানেজার", sales: 15400, invoices: 18, cashCollected: 14000, creditGiven: 1400, voidCount: 1, score: 92 },
    { name: "Rina Khatun", role: "ফার্মাসিস্ট", sales: 11200, invoices: 15, cashCollected: 10500, creditGiven: 700, voidCount: 0, score: 90 },
  ],
  this_week: [
    { name: "Sumon Ahmed", role: "সেলসম্যান / ক্যাশিয়ার", sales: 142500, invoices: 184, cashCollected: 128000, creditGiven: 14500, voidCount: 2, score: 94 },
    { name: "Karim Hossain", role: "ম্যানেজার", sales: 98400, invoices: 112, cashCollected: 92000, creditGiven: 6400, voidCount: 1, score: 91 },
    { name: "Rina Khatun", role: "ফার্মাসিস্ট", sales: 64200, invoices: 82, cashCollected: 58500, creditGiven: 5700, voidCount: 1, score: 87 },
  ],
  this_month: [
    { name: "Sumon Ahmed", role: "সেলসম্যান / ক্যাশিয়ার", sales: 485000, invoices: 620, cashCollected: 435000, creditGiven: 50000, voidCount: 5, score: 95 },
    { name: "Karim Hossain", role: "ম্যানেজার", sales: 340000, invoices: 390, cashCollected: 315000, creditGiven: 25000, voidCount: 3, score: 92 },
    { name: "Rina Khatun", role: "ফার্মাসিস্ট", sales: 220000, invoices: 275, cashCollected: 201000, creditGiven: 19000, voidCount: 4, score: 88 },
  ],
};

function PerformancePage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<TimePeriod>("today");

  const list = mockStaffSales[period];
  const summary = useMemo(() => {
    return list.reduce(
      (acc, cur) => ({
        totalSales: acc.totalSales + cur.sales,
        totalInvoices: acc.totalInvoices + cur.invoices,
        cashCollected: acc.cashCollected + cur.cashCollected,
        creditGiven: acc.creditGiven + cur.creditGiven,
        voidCount: acc.voidCount + cur.voidCount,
      }),
      { totalSales: 0, totalInvoices: 0, cashCollected: 0, creditGiven: 0, voidCount: 0 }
    );
  }, [list]);

  const periods: Array<{ id: TimePeriod; label: string }> = [
    { id: "today", label: "আজ" },
    { id: "yesterday", label: "গতকাল" },
    { id: "this_week", label: "এই সপ্তাহ" },
    { id: "this_month", label: "এই মাস" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <PageHeader title="সেলসম্যানের হিসাব" description="কর্মচারীদের দৈনিক বিক্রয়, নগদ আদায়, বাকি ও বাতিল ইনভয়েসের লাইভ হিসাব" />
        {/* Time period filter pills */}
        <div className="inline-flex rounded-xl bg-muted/80 p-1 border border-border self-start sm:self-auto">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                period === p.id
                  ? "bg-emerald-700 text-white shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="shadow-xs border-border">
          <CardContent className="p-3.5">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground block">মোট বিক্রয়</span>
            <span className="text-xl font-bold text-foreground mt-0.5 block">
              ৳ {summary.totalSales.toLocaleString("en-IN")}
            </span>
          </CardContent>
        </Card>
        <Card className="shadow-xs border-border">
          <CardContent className="p-3.5">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground block">মোট ইনভয়েস</span>
            <span className="text-xl font-bold text-foreground mt-0.5 block">
              {summary.totalInvoices} টি
            </span>
          </CardContent>
        </Card>
        <Card className="shadow-xs border-border">
          <CardContent className="p-3.5">
            <span className="text-[11px] font-semibold uppercase text-emerald-700 dark:text-emerald-400 block">নগদ আদায়</span>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              ৳ {summary.cashCollected.toLocaleString("en-IN")}
            </span>
          </CardContent>
        </Card>
        <Card className="shadow-xs border-border">
          <CardContent className="p-3.5">
            <span className="text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-400 block">বাকি দেওয়া</span>
            <span className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5 block">
              ৳ {summary.creditGiven.toLocaleString("en-IN")}
            </span>
          </CardContent>
        </Card>
        <Card className="shadow-xs border-border col-span-2 lg:col-span-1">
          <CardContent className="p-3.5">
            <span className="text-[11px] font-semibold uppercase text-rose-700 dark:text-rose-400 block">বাতিল (Void)</span>
            <span className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-0.5 block">
              {summary.voidCount} টি
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Salesman Performance Table */}
      <Card className="shadow-card border-border overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-emerald-600" /> সেলসম্যানের পারফরম্যান্স তালিকা
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>সেলসম্যান</TableHead>
                <TableHead className="text-right">মোট বিক্রয়</TableHead>
                <TableHead className="text-right">ইনভয়েস সংখ্যা</TableHead>
                <TableHead className="text-right">নগদ আদায়</TableHead>
                <TableHead className="text-right">বাকি দেওয়া</TableHead>
                <TableHead className="text-center">বাতিল</TableHead>
                <TableHead className="text-right">স্কোর</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((s, idx) => (
                <TableRow key={s.name}>
                  <TableCell>
                    <div className="font-bold text-sm text-foreground flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-black">
                        {idx + 1}
                      </span>
                      {s.name}
                    </div>
                    <div className="text-xs text-muted-foreground ml-8">{s.role}</div>
                  </TableCell>
                  <TableCell className="text-right font-bold text-sm text-foreground">
                    ৳ {s.sales.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-xs text-muted-foreground">
                    {s.invoices} টি
                  </TableCell>
                  <TableCell className="text-right font-bold text-xs text-emerald-600 dark:text-emerald-400">
                    ৳ {s.cashCollected.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-right font-bold text-xs text-amber-600 dark:text-amber-400">
                    ৳ {s.creditGiven.toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="text-center">
                    {s.voidCount > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">
                        {s.voidCount}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      {s.score}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
