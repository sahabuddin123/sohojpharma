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
      {/* Top Banner: ঝুকিতে থাকা টাকা (ক্রয়মূল্য) */}
      <div className="rounded-xl border-2 border-rose-500/30 bg-rose-500/10 p-4 text-rose-950 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-600 text-white shadow-xs">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-300 block">
              ঝুকিতে থাকা টাকা (ক্রয়মূল্য)
            </span>
            <span className="text-2xl font-black text-rose-700 dark:text-rose-400">
              ৳ {totalRiskCapital.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
        <div className="text-right sm:text-right">
          <span className="inline-block text-xs font-bold bg-rose-600 text-white px-2.5 py-1 rounded-full shadow-2xs">
            {totalRiskBatches}টি ব্যাচ মেয়াদোত্তীর্ণ হওয়ার পথে
          </span>
          <p className="text-[11px] text-muted-foreground mt-1">
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
            <Card key={group.manufacturer} className="shadow-card border-border overflow-hidden">
              <CardHeader className="p-4 bg-muted/30 border-b border-border flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <CardTitle className="text-sm font-bold text-foreground">
                    {group.manufacturer}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs font-semibold">
                    {group.items.length}টি পণ্য
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    ঝুঁকি: ৳{group.totalCost.toLocaleString("en-IN")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateReturn(group.manufacturer, group.items)}
                    className="gap-1.5 text-xs font-semibold border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50"
                  >
                    <Share2 className="h-3.5 w-3.5" /> ফেরত তালিকা তৈরি
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/60">
                  {group.items.map((item) => {
                    const isUrgent = item.daysRemaining <= 60;
                    return (
                      <div
                        key={item.id}
                        className="p-3 flex items-center justify-between gap-3 hover:bg-muted/10 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">
                            {item.products?.name || "Medicine"}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                            <span>ব্যাচ: {item.batch_no}</span>
                            <span>· মেয়াদ: {item.expiry_date}</span>
                            <span>· স্টক: {item.qty_on_hand}</span>
                            <span className="font-semibold text-foreground">
                              · মোট ক্রয়মূল্য: ৳{item.totalCost.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <Badge
                          className={`shrink-0 font-bold text-xs ${
                            isUrgent
                              ? "bg-rose-600 hover:bg-rose-700 text-white animate-pulse"
                              : "bg-amber-500 hover:bg-amber-600 text-white"
                          }`}
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
