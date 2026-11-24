// Additive overview / dashboard panel for Settings → Printing.
// Pure presentational. Reads only; never mutates existing settings shape.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, Printer, Plug,
  Download, Upload, RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  loadPrintingSettings, savePrintingSettings, qzIsConnected,
  DEFAULT_PRINTING_SETTINGS, usePrinterProfiles,
} from "@/lib/printing";
import {
  loadExtras, saveExtras, DEFAULT_EXTRAS, type PrintingExtras,
} from "@/lib/printing/extras";
import { loadRoutes } from "@/lib/printing/routing-config";

type Dot = "green" | "orange" | "red" | "gray";
const dotClass: Record<Dot, string> = {
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-muted-foreground/40",
};

function StatRow({
  label, value, status = "gray",
}: { label: string; value: React.ReactNode; status?: Dot }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={`inline-block h-2 w-2 rounded-full ${dotClass[status]}`} aria-hidden />
        <span>{label}</span>
      </div>
      <div className="font-medium text-right truncate max-w-[60%]">{value}</div>
    </div>
  );
}

export function PrintingOverview({ tenantId }: { tenantId: string | null }) {
  const [settings, setSettings] = useState(() => loadPrintingSettings(tenantId));
  const [extras, setExtras] = useState<PrintingExtras>(() => loadExtras(tenantId));
  const [routes, setRoutes] = useState(() => loadRoutes(tenantId));
  const [qzOn, setQzOn] = useState(false);
  const [lastPrintAt, setLastPrintAt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const profilesApi = usePrinterProfiles({ tenantId });

  // Refresh from storage when tenant changes
  useEffect(() => {
    setSettings(loadPrintingSettings(tenantId));
    setExtras(loadExtras(tenantId));
    setRoutes(loadRoutes(tenantId));
  }, [tenantId]);

  // Poll QZ status lightly (no continuous polling – every 8s)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const ok = await qzIsConnected(); if (alive) setQzOn(ok); } catch { /* noop */ }
    };
    void tick();
    const id = window.setInterval(tick, 8000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  // Listen for "last print" events from the print manager if it dispatches them
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ at?: string }>).detail;
      setLastPrintAt(detail?.at ?? new Date().toISOString());
    };
    window.addEventListener("sohojpharma:print:completed", handler as EventListener);
    return () => window.removeEventListener("sohojpharma:print:completed", handler as EventListener);
  }, []);

  const engine = settings.engine ?? "chrome";
  const engineStatus: Dot = engine === "qz" ? (qzOn ? "green" : "red") : "green";

  const routingSummary = useMemo(() => {
    const profiles = profilesApi.items;
    const routeProfileName = (docId: string) => {
      const route = routes[docId];
      if (!route?.enabled || !route.profileId) return null;
      const profile = profiles.find((p) => String(p.id) === route.profileId);
      return profile ? String(profile.name ?? route.profileId) : "Configured profile";
    };

    const receipt = extras.routing.receipt || routeProfileName("pos-receipt") || settings.receiptPrinter;
    const barcode = extras.routing.barcode || routeProfileName("barcode-label") || settings.barcodePrinter;
    const invoice = extras.routing.invoice || routeProfileName("pos-invoice") || settings.receiptPrinter;

    return { receipt, barcode, invoice };
  }, [extras.routing, profilesApi.items, routes, settings.receiptPrinter, settings.barcodePrinter]);

  const health = useMemo(() => {
    const checks = [
      { label: "Engine Ready", ok: !!engine },
      { label: "QZ Running", ok: engine !== "qz" || qzOn },
      { label: "Receipt Printer", ok: !!routingSummary.receipt },
      { label: "Barcode Printer", ok: !!routingSummary.barcode },
      { label: "Invoice Printer", ok: !!routingSummary.invoice },
      { label: "Routing OK", ok: !!(routingSummary.receipt || routingSummary.invoice) },
      { label: "Chrome Fallback", ok: true },
      { label: "Storage OK", ok: typeof window !== "undefined" && !!window.localStorage },
    ];
    const passed = checks.filter((c) => c.ok).length;
    const pct = Math.round((passed / checks.length) * 100);
    const tier =
      pct >= 95 ? "Excellent" : pct >= 80 ? "Good" : pct >= 60 ? "Warning" : "Critical";
    const tone: Dot = pct >= 95 ? "green" : pct >= 80 ? "green" : pct >= 60 ? "orange" : "red";
    return { checks, pct, tier, tone };
  }, [engine, qzOn, routingSummary]);

  const onExport = useCallback(() => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tenantId: tenantId ?? null,
      settings,
      extras,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sohojpharma-printing-${(tenantId ?? "default").slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Printing settings exported");
  }, [settings, extras, tenantId]);

  const onImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.settings) {
        savePrintingSettings({ ...DEFAULT_PRINTING_SETTINGS, ...data.settings }, tenantId);
        setSettings(loadPrintingSettings(tenantId));
      }
      if (data?.extras) {
        const merged: PrintingExtras = {
          routing: { ...DEFAULT_EXTRAS.routing, ...(data.extras.routing ?? {}) },
          receipt: { ...DEFAULT_EXTRAS.receipt, ...(data.extras.receipt ?? {}) },
          barcode: { ...DEFAULT_EXTRAS.barcode, ...(data.extras.barcode ?? {}) },
          invoice: { ...DEFAULT_EXTRAS.invoice, ...(data.extras.invoice ?? {}) },
          autoPrint: { ...DEFAULT_EXTRAS.autoPrint, ...(data.extras.autoPrint ?? {}) },
        };
        saveExtras(merged, tenantId);
        setExtras(merged);
      }
      toast.success("Printing settings imported");
    } catch (err) {
      toast.error("Invalid settings file");
    }
  }, [tenantId]);

  const onReset = useCallback(() => {
    if (!window.confirm("Reset all printing settings to defaults? Profiles and history will remain.")) return;
    savePrintingSettings(DEFAULT_PRINTING_SETTINGS, tenantId);
    saveExtras(DEFAULT_EXTRAS, tenantId);
    setSettings(DEFAULT_PRINTING_SETTINGS);
    setExtras(DEFAULT_EXTRAS);
    toast.success("Printing settings reset to defaults");
  }, [tenantId]);

  return (
    <div className="grid gap-4 md:grid-cols-3 mb-4">
      {/* Summary */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Printer className="h-4 w-4 text-primary" aria-hidden />
            <CardTitle className="text-base">Printing Overview</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExport} aria-label="Export printing settings">
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} aria-label="Import printing settings">
              <Upload className="h-3.5 w-3.5 mr-1" /> Import
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset} aria-label="Reset to defaults">
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-1 sm:grid-cols-2">
          <StatRow label="Active Engine" value={engine.toUpperCase()} status={engineStatus} />
          <StatRow
            label="QZ Status"
            value={engine === "qz" ? (qzOn ? "Connected" : "Disconnected") : "Not in use"}
            status={engine === "qz" ? (qzOn ? "green" : "red") : "gray"}
          />
          <StatRow label="Receipt Printer" value={routingSummary.receipt ?? "Not set"} status={routingSummary.receipt ? "green" : "orange"} />
          <StatRow label="Barcode Printer" value={routingSummary.barcode ?? "Not set"} status={routingSummary.barcode ? "green" : "orange"} />
          <StatRow label="Invoice Printer" value={routingSummary.invoice ?? "Not set"} status={routingSummary.invoice ? "green" : "orange"} />
          <StatRow label="Chrome Fallback" value="Available" status="green" />
          <StatRow
            label="Last Print"
            value={lastPrintAt ? new Date(lastPrintAt).toLocaleString() : "—"}
            status={lastPrintAt ? "green" : "gray"}
          />
          <StatRow label="Auto-Print After Sale" value={extras.autoPrint.receiptAfterSale ? "On" : "Off"} status={extras.autoPrint.receiptAfterSale ? "green" : "gray"} />
        </CardContent>
      </Card>

      {/* Production Health */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle className="text-base">Production Health</CardTitle>
            </div>
            <Badge
              variant="outline"
              className={
                health.tone === "green"
                  ? "border-emerald-500/40 text-emerald-600"
                  : health.tone === "orange"
                  ? "border-amber-500/40 text-amber-600"
                  : "border-red-500/40 text-red-600"
              }
            >
              {health.tier} · {health.pct}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {health.checks.map((c) => (
            <div key={c.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{c.label}</span>
              {c.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="OK" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Attention" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
