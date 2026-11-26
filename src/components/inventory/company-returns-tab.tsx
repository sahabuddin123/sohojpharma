import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Building2, Calendar, FileText, CheckCircle2, Share2, Printer } from "lucide-react";
import { toast } from "sonner";

interface BatchItem {
  id: string;
  batch_no: string;
  expiry_date: string;
  qty_on_hand: number;
  purchase_price: number;
  products: {
    name?: string;
    generic_name?: string | null;
    manufacturer_name?: string | null;
  } | null;
}

interface CompanyReturnsTabProps {
  batches: BatchItem[];
  tenantId: string;
}

export function CompanyReturnsTab({ batches, tenantId }: CompanyReturnsTabProps) {
  const [selectedMfr, setSelectedMfr] = useState<string | null>(null);

  // Group by manufacturer and calculate at-risk capital
  const { groups, totalRiskCapital, totalRiskBatches } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let riskCapital = 0;
    let riskCount = 0;

    const map: Record<
      string,
      {
        manufacturer: string;
        items: Array<
          BatchItem & {
            daysRemaining: number;
            totalCost: number;
          }
        >;
        totalCost: number;
      }
    > = {};

    batches.forEach((b) => {
      const exp = new Date(b.expiry_date + "T00:00:00");
      const days = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      // Consider batches expiring within 180 days or already expired
      if (days <= 180 && b.qty_on_hand > 0) {
        const mfr = b.products?.manufacturer_name || "অন্যান্য / জেনেরিক";
        const cost = (Number(b.purchase_price) || 0) * (Number(b.qty_on_hand) || 0);
        riskCapital += cost;
        riskCount += 1;

        if (!map[mfr]) {
          map[mfr] = { manufacturer: mfr, items: [], totalCost: 0 };
        }
        map[mfr].items.push({
          ...b,
          daysRemaining: days,
          totalCost: cost,
        });
        map[mfr].totalCost += cost;
      }
    });

    // Sort groups by total cost desc
    const sortedGroups = Object.values(map).sort((a, b) => b.totalCost - a.totalCost);
    return {
      groups: sortedGroups,
      totalRiskCapital: riskCapital,
      totalRiskBatches: riskCount,
    };
  }, [batches]);

  const handleGenerateReturn = (mfrName: string, items: any[]) => {
    const lines = items
      .map(
        (it) =>
          `• ${it.products?.name || "Medicine"} (ব্যাচ: ${it.batch_no}, মেয়াদ: ${it.expiry_date}) - পরিমাণ: ${it.qty_on_hand}`
      )
      .join("\n");
    const text = encodeURIComponent(
      `*কোম্পানি ফেরত তালিকা (Return to Company)*\nকোম্পানি: ${mfrName}\nতারিখ: ${new Date().toLocaleDateString()}\n--------------------\n${lines}\n--------------------\nমোট ক্রয়মূল্য: ৳${items.reduce((s, x) => s + x.totalCost, 0).toFixed(2)}\nঅনুগ্রহ করে রিপ্লেসমেন্ট / ক্রেডিট নোট প্রদান করুন।`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
    toast.success(`${mfrName}-এর জন্য ফেরত তালিকা তৈরি ও হোয়াটসঅ্যাপে পাঠানো হয়েছে`);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: ঝুঁকিতে থাকা মূলধন */}
      <div className="flex flex-col gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/70 p-4 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-900/60 dark:text-rose-300 dark:ring-rose-800/60">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-xs font-medium text-rose-700 dark:text-rose-300">
              ঝুঁকিতে থাকা টাকা (ক্রয়মূল্য)
            </span>
            <span className="mt-0.5 block text-2xl font-bold tracking-tight tabular-nums text-rose-900 dark:text-rose-100">
              ৳ {totalRiskCapital.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="sm:text-right">
          <Badge variant="destructive" className="text-xs font-semibold">
            {totalRiskBatches}টি ব্যাচ মেয়াদোত্তীর্ণ হওয়ার পথে
          </Badge>
          <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">
            কোম্পানি প্রতিনিধি (MR)-কে ফেরত দিয়ে ক্ষতি এড়ান
          </p>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            আলহামদুলিল্লাহ! আগামী ১৮০ দিনের মধ্যে মেয়াদোত্তীর্ণ হওয়ার মতো কোনো মেডিসিন নেই।
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <Card key={group.manufacturer} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3.5 dark:border-slate-800/70 dark:bg-slate-800/40">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/60 dark:text-emerald-300">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {group.manufacturer}
                  </CardTitle>
                  <Badge variant="secondary">
                    {group.items.length}টি পণ্য
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    ঝুঁকি: ৳{group.totalCost.toLocaleString("en-IN")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateReturn(group.manufacturer, group.items)}
                    className="gap-1.5 text-xs font-medium border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/70 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                  >
                    <Share2 className="h-3.5 w-3.5" /> ফেরত তালিকা তৈরি
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                  {group.items.map((item) => {
                    const isUrgent = item.daysRemaining <= 60;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/35"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                            {item.products?.name || "Medicine"}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span>ব্যাচ: <span className="font-mono text-slate-700 dark:text-slate-300">{item.batch_no}</span></span>
                            <span>· মেয়াদ: {item.expiry_date}</span>
                            <span>· স্টক: <span className="tabular-nums">{item.qty_on_hand}</span></span>
                            <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                              · মোট ক্রয়মূল্য: ৳{item.totalCost.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant={isUrgent ? "destructive" : "warning"}
                          className="shrink-0"
                        >
                          {item.daysRemaining < 0
                            ? "মেয়াদ শেষ"
                            : `${item.daysRemaining} দিন বাকি`}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
