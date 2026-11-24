// Printing Setup Wizard — additive, reuses existing services only.
// Guides a Store Admin through QZ check, printer detection, engine choice,
// receipt/barcode config, routing, test print, validation, and finish.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, ArrowLeft, ArrowRight, Rocket,
  Printer, Wifi, Settings as SettingsIcon, Receipt, Barcode, FileText,
  Route as RouteIcon, FlaskConical, ShieldCheck, Flag, Download, SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  qzConnect, qzIsConnected, qzFindPrinters, qzFindDefaultPrinter,
  loadPrintingSettings, savePrintingSettings,
  print, buildZplLabel,
  usePrinterProfiles, runProductionValidation,
  type PrintingSettings, type PrintEngine, type PaperWidth,
} from "@/lib/printing";
import { loadExtras, saveExtras } from "@/lib/printing/extras";
import { loadRoutes, saveRoutes, DEFAULT_ROUTE } from "@/lib/printing/routing-config";
import { detectPrinter } from "@/lib/printing/detect";
import { markWizardDone } from "@/lib/printing/wizard-state";

interface Props { tenantId: string | null }

type StepId =
  | "welcome" | "qz" | "detect" | "engine" | "receipt"
  | "barcode" | "routing" | "test" | "validation" | "finish";

const STEPS: { id: StepId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "welcome", label: "Welcome", icon: Rocket },
  { id: "qz", label: "QZ Check", icon: Wifi },
  { id: "detect", label: "Detect Printers", icon: Printer },
  { id: "engine", label: "Engine", icon: SettingsIcon },
  { id: "receipt", label: "Receipt", icon: Receipt },
  { id: "barcode", label: "Barcode", icon: Barcode },
  { id: "routing", label: "Routing", icon: RouteIcon },
  { id: "test", label: "Test Print", icon: FlaskConical },
  { id: "validation", label: "Validation", icon: ShieldCheck },
  { id: "finish", label: "Finish", icon: Flag },
];

export function PrintingSetupWizard({ tenantId }: Props) {
  const navigate = useNavigate();
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  // Persistent draft state
  const [settings, setSettings] = useState<PrintingSettings>(loadPrintingSettings(tenantId));
  const [extras, setExtras] = useState(loadExtras(tenantId));
  const profilesApi = usePrinterProfiles({ tenantId });

  useEffect(() => { setSettings(loadPrintingSettings(tenantId)); setExtras(loadExtras(tenantId)); }, [tenantId]);

  const patchSettings = useCallback((patch: Partial<PrintingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      savePrintingSettings(next, tenantId);
      return next;
    });
  }, [tenantId]);

  const patchExtras = useCallback((updater: (prev: ReturnType<typeof loadExtras>) => ReturnType<typeof loadExtras>) => {
    setExtras((prev) => {
      const next = updater(prev);
      saveExtras(next, tenantId);
      return next;
    });
  }, [tenantId]);

  const goNext = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const goPrev = () => setStepIdx((i) => Math.max(i - 1, 0));

  const skip = () => {
    markWizardDone(tenantId);
    void navigate({ to: "/settings/printing" });
  };
  const finish = () => {
    markWizardDone(tenantId);
    toast.success("Printing setup complete");
    void navigate({ to: "/settings/printing" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5" /> Printing Setup Wizard
              </CardTitle>
              <CardDescription>
                Step {stepIdx + 1} of {STEPS.length} — {step.label}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={skip}>
              <SkipForward className="h-4 w-4 mr-1" /> Skip Setup
            </Button>
          </div>
          <Progress value={progress} className="mt-3 h-2" />
          <div className="flex flex-wrap gap-1 mt-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === stepIdx;
              const done = i < stepIdx;
              return (
                <button
                  key={s.id}
                  onClick={() => setStepIdx(i)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : done
                      ? "bg-muted border-border text-foreground"
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden md:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          {step.id === "welcome" && <WelcomeStep />}
          {step.id === "qz" && <QzStep />}
          {step.id === "detect" && (
            <DetectStep settings={settings} patchSettings={patchSettings} />
          )}
          {step.id === "engine" && (
            <EngineStep settings={settings} patchSettings={patchSettings} />
          )}
          {step.id === "receipt" && (
            <ReceiptStep extras={extras} patchExtras={patchExtras} />
          )}
          {step.id === "barcode" && (
            <BarcodeStep extras={extras} patchExtras={patchExtras} />
          )}
          {step.id === "routing" && (
            <RoutingStep tenantId={tenantId} profiles={profilesApi.items} />
          )}
          {step.id === "test" && <TestStep settings={settings} />}
          {step.id === "validation" && (
            <ValidationStep hasProfile={profilesApi.items.length > 0} />
          )}
          {step.id === "finish" && <FinishStep settings={settings} extras={extras} />}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goPrev} disabled={stepIdx === 0}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {stepIdx < STEPS.length - 1 ? (
          <Button onClick={goNext}>
            Next <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void navigate({ to: "/settings/printing" })}>
              Open Printing Settings
            </Button>
            <Button onClick={finish}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Finish
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================== STEPS ============================== */

function WelcomeStep() {
  const items = [
    { title: "Chrome Print", text: "Uses the browser's built-in print dialog. Works everywhere, no install required." },
    { title: "QZ Tray", text: "Native desktop helper that enables silent, direct-to-printer output for receipts, labels, and invoices." },
    { title: "Silent Printing", text: "Prints without showing a dialog — requires QZ Tray." },
    { title: "Printer Profiles", text: "Reusable settings (engine, driver, paper size, copies) per physical printer." },
    { title: "Routing", text: "Decides which printer profile handles each document type (POS receipt, invoice, barcode, etc.)." },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        This wizard will walk you through configuring your store's printing in a few steps.
        Everything is saved as you go and can be changed later from Settings → Printing.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.title} className="rounded border p-3">
            <div className="font-medium text-sm">{it.title}</div>
            <div className="text-xs text-muted-foreground mt-1">{it.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QzStep() {
  const [status, setStatus] = useState<{ connected: boolean; version?: string; checking: boolean; error?: string }>({
    connected: false, checking: true,
  });

  const check = useCallback(async () => {
    setStatus((s) => ({ ...s, checking: true }));
    try {
      const isUp = await qzIsConnected();
      if (isUp) { setStatus({ connected: true, checking: false }); return; }
      const r = await qzConnect();
      setStatus({ connected: r.connected, version: r.version, checking: false, error: r.error });
    } catch (e) {
      setStatus({ connected: false, checking: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => { void check(); }, [check]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 p-3 rounded border">
        {status.checking ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : status.connected ? (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        ) : (
          <XCircle className="h-5 w-5 text-red-600" />
        )}
        <div className="flex-1">
          <div className="font-medium text-sm">
            QZ Tray {status.checking ? "checking…" : status.connected ? "connected" : "not available"}
          </div>
          <div className="text-xs text-muted-foreground">
            {status.connected
              ? `Version ${status.version ?? "—"}`
              : status.error ?? "QZ Tray is required for silent printing. You can continue with Chrome."}
          </div>
        </div>
        <Badge variant={status.connected ? "default" : "secondary"}>
          {status.connected ? "Online" : "Offline"}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void check()}>
          <Loader2 className={`h-4 w-4 mr-1 ${status.checking ? "animate-spin" : "hidden"}`} /> Retry
        </Button>
        <Button variant="outline" asChild>
          <a href="https://qz.io/download/" target="_blank" rel="noreferrer">
            <Download className="h-4 w-4 mr-1" /> Download QZ Tray
          </a>
        </Button>
      </div>
    </div>
  );
}

function DetectStep({ settings, patchSettings }: { settings: PrintingSettings; patchSettings: (p: Partial<PrintingSettings>) => void }) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [invoicePrinter, setInvoicePrinter] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const list = await qzFindPrinters();
      setPrinters(list);
      if (!settings.receiptPrinter || !settings.barcodePrinter) {
        const def = await qzFindDefaultPrinter();
        const guess: Partial<PrintingSettings> = {};
        for (const name of list) {
          const d = detectPrinter(name);
          if (d.role === "barcode" && !settings.barcodePrinter) guess.barcodePrinter = name;
          if (d.role === "receipt" && !settings.receiptPrinter) guess.receiptPrinter = name;
        }
        if (!guess.receiptPrinter && def) guess.receiptPrinter = def;
        if (Object.keys(guess).length) patchSettings(guess);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [settings.receiptPrinter, settings.barcodePrinter, patchSettings]);

  useEffect(() => { void refresh(); }, [refresh]);

  const testPrinter = async (name: string) => {
    try {
      await print({ kind: "thermal-receipt", payload: `<div style="font-family:monospace;padding:8px">Test print — ${name}</div>`, printer: name });
      toast.success(`Test sent to ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">{printers.length} printer(s) detected</div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <RoleSelect label="Receipt Printer" value={settings.receiptPrinter} options={printers}
          onChange={(v) => patchSettings({ receiptPrinter: v })} onTest={testPrinter} />
        <RoleSelect label="Barcode Printer" value={settings.barcodePrinter} options={printers}
          onChange={(v) => patchSettings({ barcodePrinter: v })} onTest={testPrinter} />
        <RoleSelect label="Invoice Printer" value={invoicePrinter} options={printers}
          onChange={setInvoicePrinter} onTest={testPrinter} />
      </div>
      {printers.length === 0 && (
        <div className="text-xs text-muted-foreground p-3 rounded border">
          No printers detected. Make sure QZ Tray is running, or skip and use Chrome Print.
        </div>
      )}
    </div>
  );
}

function RoleSelect({ label, value, options, onChange, onTest }: {
  label: string; value: string | null; options: string[];
  onChange: (v: string) => void; onTest: (name: string) => void;
}) {
  return (
    <div className="rounded border p-3 space-y-2">
      <Label className="text-xs">{label}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v)}>
        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          {options.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" disabled={!value} onClick={() => value && onTest(value)}>
        Test Print
      </Button>
    </div>
  );
}

function EngineStep({ settings, patchSettings }: { settings: PrintingSettings; patchSettings: (p: Partial<PrintingSettings>) => void }) {
  const options: { id: PrintEngine; title: string; desc: string }[] = [
    { id: "chrome", title: "Chrome Print", desc: "Browser dialog. Universal. Requires user confirmation each print." },
    { id: "qz", title: "QZ Tray", desc: "Direct-to-printer, supports silent printing. Requires QZ Tray installed." },
    { id: "auto", title: "Auto (Recommended)", desc: "Uses QZ when available, falls back to Chrome automatically." },
  ];
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => patchSettings({ engine: o.id })}
          className={`text-left rounded border p-3 transition-colors ${settings.engine === o.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
        >
          <div className="font-medium text-sm flex items-center justify-between">
            {o.title}
            {settings.engine === o.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{o.desc}</div>
        </button>
      ))}
    </div>
  );
}

function ReceiptStep({ extras, patchExtras }: {
  extras: ReturnType<typeof loadExtras>;
  patchExtras: (u: (p: ReturnType<typeof loadExtras>) => ReturnType<typeof loadExtras>) => void;
}) {
  const r = extras.receipt;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Paper Width</Label>
          <Select value={r.paperWidth} onValueChange={(v) => patchExtras((p) => ({ ...p, receipt: { ...p.receipt, paperWidth: v as typeof r.paperWidth } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="38mm">38mm</SelectItem>
              <SelectItem value="58mm">58mm</SelectItem>
              <SelectItem value="80mm">80mm</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded border p-2">
          <Label className="text-sm">Show Logo</Label>
          <Switch checked={r.showLogo} onCheckedChange={(v) => patchExtras((p) => ({ ...p, receipt: { ...p.receipt, showLogo: v } }))} />
        </div>
        <div className="flex items-center justify-between rounded border p-2">
          <Label className="text-sm">Show QR Code</Label>
          <Switch checked={r.showQR} onCheckedChange={(v) => patchExtras((p) => ({ ...p, receipt: { ...p.receipt, showQR: v } }))} />
        </div>
        <div>
          <Label className="text-xs">Copies</Label>
          <Input type="number" min={1} max={5} value={r.copies}
            onChange={(e) => patchExtras((p) => ({ ...p, receipt: { ...p.receipt, copies: Math.max(1, Number(e.target.value) || 1) } }))} />
        </div>
      </div>
      <div className="rounded border p-3 bg-muted/30">
        <div className="text-xs font-medium mb-2">Live Preview</div>
        <div className="bg-white text-black mx-auto rounded shadow-sm p-2 font-mono text-[10px] leading-tight"
          style={{ width: r.paperWidth === "38mm" ? 120 : r.paperWidth === "58mm" ? 180 : 240 }}>
          {r.showLogo && <div className="text-center font-bold mb-1">[LOGO]</div>}
          <div className="text-center">Your Store</div>
          <div className="border-t border-dashed my-1" />
          <div>Item A ............ 100</div>
          <div>Item B ............. 50</div>
          <div className="border-t border-dashed my-1" />
          <div className="text-right">Total: 150</div>
          {r.showQR && <div className="text-center mt-1">[QR]</div>}
          <div className="text-center mt-1">x{r.copies} copies</div>
        </div>
      </div>
    </div>
  );
}

function BarcodeStep({ extras, patchExtras }: {
  extras: ReturnType<typeof loadExtras>;
  patchExtras: (u: (p: ReturnType<typeof loadExtras>) => ReturnType<typeof loadExtras>) => void;
}) {
  const b = extras.barcode;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Driver</Label>
          <Select value={b.driver} onValueChange={(v) => patchExtras((p) => ({ ...p, barcode: { ...p.barcode, driver: v as typeof b.driver } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Auto">Auto</SelectItem>
              <SelectItem value="ZPL">ZPL</SelectItem>
              <SelectItem value="ESCPOS">ESC/POS</SelectItem>
              <SelectItem value="RAW">RAW</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Label Size</Label>
          <Select value={b.labelSize} onValueChange={(v) => patchExtras((p) => ({ ...p, barcode: { ...p.barcode, labelSize: v as typeof b.labelSize } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="38x20">38 × 20 mm</SelectItem>
              <SelectItem value="40x20">40 × 20 mm</SelectItem>
              <SelectItem value="50x25">50 × 25 mm</SelectItem>
              <SelectItem value="58x30">58 × 30 mm</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Barcode Type</Label>
          <Select value={b.type} onValueChange={(v) => patchExtras((p) => ({ ...p, barcode: { ...p.barcode, type: v as typeof b.type } }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Code128">Code 128</SelectItem>
              <SelectItem value="Code39">Code 39</SelectItem>
              <SelectItem value="EAN13">EAN-13</SelectItem>
              <SelectItem value="EAN8">EAN-8</SelectItem>
              <SelectItem value="QR">QR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="rounded border p-3 bg-muted/30">
        <div className="text-xs font-medium mb-2">Live Preview</div>
        <div className="bg-white text-black rounded p-3 text-center inline-block">
          <div className="text-xs">Sample Product</div>
          <div className="my-2 font-mono text-xl tracking-widest">| |||| | || |||</div>
          <div className="text-[10px]">{b.type} · {b.labelSize}</div>
        </div>
      </div>
    </div>
  );
}

function RoutingStep({ tenantId, profiles }: { tenantId: string | null; profiles: Array<Record<string, unknown>> }) {
  const [routes, setRoutes] = useState(() => loadRoutes(tenantId));
  useEffect(() => { setRoutes(loadRoutes(tenantId)); }, [tenantId]);

  const setRoute = (docId: string, profileId: string | null) => {
    const next = { ...routes, [docId]: { ...(routes[docId] ?? DEFAULT_ROUTE), profileId } };
    setRoutes(next);
    saveRoutes(next, tenantId);

    const legacyKey = docId === "pos-receipt"
      ? "receipt"
      : docId === "pos-invoice"
      ? "invoice"
      : docId === "barcode-label"
      ? "barcode"
      : null;
    if (legacyKey) {
      const selectedProfile = profiles.find((p) => String(p.id) === profileId);
      const currentExtras = loadExtras(tenantId);
      saveExtras({
        ...currentExtras,
        routing: {
          ...currentExtras.routing,
          [legacyKey]: selectedProfile ? String(selectedProfile.name ?? "") : null,
        },
      }, tenantId);
    }
  };

  const docs = [
    { id: "pos-receipt", label: "Receipt" },
    { id: "pos-invoice", label: "Invoice" },
    { id: "barcode-label", label: "Barcode" },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Assign printer profiles for the main document types. Full routing for all 22 document types is available in Settings → Printing → Routing.
      </p>
      {profiles.length === 0 && (
        <div className="text-xs p-3 rounded border bg-yellow-500/10 border-yellow-500/30">
          No printer profiles created yet. You can finish the wizard and create them later from Settings → Printing → Printers.
        </div>
      )}
      <div className="space-y-2">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center gap-3">
            <div className="w-28 text-sm">{d.label}</div>
            <Select value={routes[d.id]?.profileId ?? ""} onValueChange={(v) => setRoute(d.id, v || null)}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="(Use store default)" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={String(p.id)} value={String(p.id)}>{String(p.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function TestStep({ settings: _settings }: { settings: PrintingSettings }) {
  const tests: { id: string; label: string; run: () => Promise<void> }[] = [
    {
      id: "receipt", label: "Test Receipt",
      run: async () => {
        await print({ kind: "thermal-receipt", payload: "<div style='font-family:monospace;padding:8px;text-align:center'>Test Receipt<br/>Wizard OK</div>" });
      },
    },
    {
      id: "barcode", label: "Test Barcode",
      run: async () => {
        const zpl = buildZplLabel({ text: "WIZARD-TEST", barcode: "WIZARD-TEST" });
        await print({ kind: "barcode", payload: zpl });
      },
    },
    {
      id: "invoice", label: "Test Invoice",
      run: async () => {
        await print({ kind: "a4-invoice", payload: "<html><body style='font-family:sans-serif;padding:24px'><h1>Test Invoice</h1><p>SohojPharma wizard test</p></body></html>" });
      },
    },
  ];
  const [state, setState] = useState<Record<string, "idle" | "running" | "pass" | "fail">>({});
  const [errs, setErrs] = useState<Record<string, string>>({});

  const runOne = async (t: typeof tests[number]) => {
    setState((s) => ({ ...s, [t.id]: "running" }));
    try { await t.run(); setState((s) => ({ ...s, [t.id]: "pass" })); }
    catch (e) {
      setState((s) => ({ ...s, [t.id]: "fail" }));
      setErrs((s) => ({ ...s, [t.id]: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <div className="space-y-2">
      {tests.map((t) => {
        const s = state[t.id] ?? "idle";
        return (
          <div key={t.id} className="flex items-center gap-3 p-3 rounded border">
            <div className="flex-1 text-sm">{t.label}</div>
            {s === "pass" && <Badge className="bg-green-600">Pass</Badge>}
            {s === "fail" && <Badge variant="destructive">Fail</Badge>}
            {s === "running" && <Loader2 className="h-4 w-4 animate-spin" />}
            <Button variant="outline" size="sm" onClick={() => void runOne(t)} disabled={s === "running"}>
              Run
            </Button>
          </div>
        );
      })}
      {Object.entries(errs).map(([k, v]) => (
        <div key={k} className="text-xs text-red-600">{k}: {v}</div>
      ))}
    </div>
  );
}

function ValidationStep({ hasProfile }: { hasProfile: boolean }) {
  const [report, setReport] = useState<Awaited<ReturnType<typeof runProductionValidation>> | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const r = await runProductionValidation({ hasProfile, fallbackEnabled: true });
      setReport(r);
    } finally { setBusy(false); }
  }, [hasProfile]);

  useEffect(() => { void run(); }, [run]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {report ? (report.ok ? "All checks passed" : "Some checks need attention") : "Running validation…"}
        </div>
        <Button variant="outline" size="sm" onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Re-run"}
        </Button>
      </div>
      <div className="space-y-1">
        {report?.checks.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-2 rounded border">
            {c.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
            <div className="text-sm flex-1">{c.label}</div>
            <div className="text-xs text-muted-foreground">{c.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinishStep({ settings, extras }: { settings: PrintingSettings; extras: ReturnType<typeof loadExtras> }) {
  const rows = useMemo(() => ([
    { k: "Default Engine", v: settings.engine },
    { k: "Receipt Printer", v: settings.receiptPrinter ?? "—" },
    { k: "Barcode Printer", v: settings.barcodePrinter ?? "—" },
    { k: "Invoice Paper", v: extras.invoice.paper },
    { k: "Receipt Paper Width", v: extras.receipt.paperWidth },
    { k: "Status", v: "Ready" },
  ]), [settings, extras]);
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Setup is complete. Review your configuration below — you can fine-tune any of these from Settings → Printing.
      </div>
      <div className="rounded border divide-y">
        {rows.map((r) => (
          <div key={r.k} className="flex items-center justify-between p-2 text-sm">
            <div className="text-muted-foreground">{r.k}</div>
            <div className="font-medium">{r.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PrintingSetupWizard;
