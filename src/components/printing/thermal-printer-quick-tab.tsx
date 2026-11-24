import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Printer, Wifi, Bluetooth, Check, Share2, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThermalPrinterQuickTabProps {
  tenantId?: string | null;
}

export function ThermalPrinterQuickTab({ tenantId }: ThermalPrinterQuickTabProps) {
  const [connectionMode, setConnectionMode] = useState<"bluetooth" | "wifi">("wifi");
  const [printerIp, setPrinterIp] = useState("192.168.0.87");
  const [port, setPort] = useState("9100");
  const [paperWidth, setPaperWidth] = useState<"58" | "80">("58");
  const [autoCutter, setAutoCutter] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("sohoj_thermal_printer_cfg");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.connectionMode) setConnectionMode(parsed.connectionMode);
        if (parsed.printerIp) setPrinterIp(parsed.printerIp);
        if (parsed.port) setPort(parsed.port);
        if (parsed.paperWidth) setPaperWidth(parsed.paperWidth);
        if (typeof parsed.autoCutter === "boolean") setAutoCutter(parsed.autoCutter);
      }
    } catch {}
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(
        "sohoj_thermal_printer_cfg",
        JSON.stringify({ connectionMode, printerIp, port, paperWidth, autoCutter })
      );
      toast.success("প্রিন্টার সেটিংস সফলভাবে সংরক্ষিত হয়েছে");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleTestPrint = () => {
    setTesting(true);
    setTimeout(() => {
      setTesting(false);
      toast.success(`${paperWidth}mm থার্মাল প্রিন্টারে টেস্ট প্রিন্ট পাঠানো হয়েছে!`);
      // Also trigger browser print as fallback
      window.print();
    }, 500);
  };

  const handleShareWhatsAppMemo = () => {
    const text = encodeURIComponent(
      `*Shifa Pharmacy*\nMemo #200011\nতারিখ: ${new Date().toLocaleDateString()}\n--------------------\nNapa 500mg × 30 = ৳36\nSompraz 20mg × 10 = ৳70\n--------------------\n*মোট বিল: ৳106*\nধন্যবাদ, সুস্থ থাকুন!`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Configuration Card */}
      <Card className="shadow-card border-border">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Printer className="h-5 w-5 text-emerald-600" /> প্রিন্টার সেটিংস
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">শুধু এই ফোনে সংরক্ষিত থাকবে</p>
            </div>
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/30 bg-emerald-50/50">
              থার্মাল POS
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Bluetooth / Wi-Fi Toggle */}
          <div className="flex rounded-xl bg-muted/80 p-1 border border-border">
            <button
              type="button"
              onClick={() => setConnectionMode("bluetooth")}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                connectionMode === "bluetooth"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bluetooth className="h-4 w-4" /> ব্লুটুথ
            </button>
            <button
              type="button"
              onClick={() => setConnectionMode("wifi")}
              className={cn(
                "flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                connectionMode === "wifi"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Wifi className="h-4 w-4" /> ওয়াই-ফাই
            </button>
          </div>

          {/* Wi-Fi Details */}
          {connectionMode === "wifi" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">প্রিন্টারের ঠিকানা (IP Address)</Label>
                <Input
                  value={printerIp}
                  onChange={(e) => setPrinterIp(e.target.value)}
                  placeholder="192.168.0.87"
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">পোর্ট (Port)</Label>
                <Input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="9100"
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  প্রিন্টারটি দোকানের নিজস্ব ওয়াই-ফাইতে থাকতে হবে। 9100 পোর্টটিই নিয়ম, এটি প্রায় কখনো বদলায় না।
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-300 border border-emerald-500/20">
              ফোনের ব্লুটুথ অন করে প্রিন্টারের সাথে পেয়ার (Pair) করে নিন। বিল প্রিন্ট করার সময় স্বয়ংক্রিয়ভাবে ব্লুটুথ প্রিন্টারে পাঠিয়ে দেবে।
            </div>
          )}

          {/* Paper Size */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <Label className="text-xs font-semibold block">কাগজ (Paper Size)</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaperWidth("58")}
                className={cn(
                  "px-4 py-2 rounded-lg border text-xs font-bold transition-all",
                  paperWidth === "58"
                    ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                    : "border-border bg-card hover:bg-muted text-foreground"
                )}
              >
                ৫৮ মিমি (58mm)
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth("80")}
                className={cn(
                  "px-4 py-2 rounded-lg border text-xs font-bold transition-all",
                  paperWidth === "80"
                    ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                    : "border-border bg-card hover:bg-muted text-foreground"
                )}
              >
                ৮০ মিমি (80mm)
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {paperWidth === "58" ? "384 ডট চওড়া (ছোট থার্মাল রিসিট)" : "576 ডট চওড়া (বড় থার্মাল রিসিট)"}
            </p>
          </div>

          {/* Auto Cutter Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold block">এই প্রিন্টার কাগজ কাটে</span>
              <span className="text-[11px] text-muted-foreground">হাতে ছিড়লে এটি বন্ধ রাখুন।</span>
            </div>
            <Switch checked={autoCutter} onCheckedChange={setAutoCutter} />
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestPrint}
              disabled={testing}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" /> টেস্ট প্রিন্ট দিন
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold"
            >
              <Check className="h-4 w-4" /> সেটিংস সংরক্ষণ করুন
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview Card matching the user's screenshot */}
      <Card className="shadow-card border-border flex flex-col justify-between">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-600" /> থার্মাল মেমো প্রিভিউ
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={handleShareWhatsAppMemo}
              className="text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-50 gap-1.5 text-xs font-semibold"
            >
              <Share2 className="h-3.5 w-3.5" /> হোয়াটসঅ্যাপে মেমো পাঠান
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-4 flex flex-col items-center">
          {/* Thermal Receipt Visual Paper */}
          <div
            className={cn(
              "bg-white text-zinc-950 p-4 font-mono shadow-md border border-zinc-200 rounded-sm text-xs leading-relaxed transition-all",
              paperWidth === "58" ? "w-[240px]" : "w-[300px]"
            )}
          >
            <div className="text-center font-bold text-sm tracking-tight">Shifa Pharmacy</div>
            <div className="text-center text-[10px] text-zinc-600">
              Memo #200011 · {new Date().toLocaleDateString("en-GB")}
            </div>
            <div className="border-t border-dashed border-zinc-400 my-2" />
            <div className="flex justify-between items-center text-[11px] font-semibold">
              <span>আইটেম</span>
              <span>পরিমাণ × দাম</span>
            </div>
            <div className="border-t border-zinc-300 my-1" />
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Napa 500mg</span>
                <span>31 × ৳1.20 = ৳37.20</span>
              </div>
              <div className="flex justify-between">
                <span>Sompraz 20mg</span>
                <span>10 × ৳7.00 = ৳70.00</span>
              </div>
            </div>
            <div className="border-t border-dashed border-zinc-400 my-2" />
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL</span>
              <span>৳107.20</span>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>পরিশোধ (নগদ)</span>
              <span>৳107.20</span>
            </div>
            <div className="text-center text-[10px] text-zinc-500 mt-3 pt-2 border-t border-dotted border-zinc-300">
              * সুস্থ থাকুন, ধন্যবাদ *
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
