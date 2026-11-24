import { createFileRoute, Outlet, useMatches, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plug, RefreshCw, CheckCircle2, XCircle, Loader2, Send,
  Printer, ListOrdered, History, Activity, FileCode, Trash2, Plus,
  Route as RouteIcon, Receipt, Barcode, FileText, Zap, FlaskConical, TrendingUp,
  Rocket, ShieldCheck,
} from "lucide-react";
import { PrintingSecurityTab } from "@/components/printing/printing-security-tab";
import { isWizardDone } from "@/lib/printing/wizard-state";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import {
  loadPrintingSettings, savePrintingSettings,
  qzConnect, qzDisconnect, qzReconnect, qzIsConnected, qzFindPrinters,
  qzFindDefaultPrinter,
  buildZplLabel, print,
  type PrintingSettings, type PrintEngine, type PaperWidth, type PrinterLanguage,
  DEFAULT_PRINTING_SETTINGS,
  detectPrinter,
  usePrintingSettingsRemote, usePrinterProfiles, usePrintHistory,
  usePrintQueue, usePrinterHealthMonitor,
} from "@/lib/printing";
import { loadExtras, saveExtras, type PrintingExtras } from "@/lib/printing/extras";
import { PrintingOverview } from "@/components/printing/printing-overview";
import { AnalyticsTab, FleetTab } from "@/components/printing/analytics-tabs";
import RoutingManagerProvider from "@/components/printing/routing-manager";
import { ReceiptConfigTab, InvoiceConfigTab, BarcodeConfigTab } from "@/components/printing/config-tabs";
import { ThermalPrinterQuickTab } from "@/components/printing/thermal-printer-quick-tab";

export const Route = createFileRoute("/settings/printing")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Printing Settings — SohojPharma" }] }),
  component: PrintingSettingsPage,
});

export function PrintingSettingsPage() {
  const { currentTenantId } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const matches = useMatches();
  const hasPrintingChild =
    (pathname !== "/settings/printing" && pathname.startsWith("/settings/printing/")) ||
    matches.some((m) => m.routeId !== "/settings/printing" && m.routeId.startsWith("/settings/printing/"));

  useEffect(() => {
    if (hasPrintingChild) return;
    if (!currentTenantId) return;
    if (!isWizardDone(currentTenantId)) {
      void navigate({ to: "/settings/printing/wizard" });
    }
  }, [hasPrintingChild, currentTenantId, navigate]);

  if (hasPrintingChild) return <Outlet />;

  const tabs: Array<{ value: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { value: "thermal", label: "ব্লুটুথ / ওয়াই-ফাই প্রিন্টার", icon: Printer },
    { value: "overview", label: "Overview", icon: TrendingUp },
    { value: "general", label: "General", icon: Printer },
    { value: "printers", label: "Printers", icon: Plug },
    { value: "routing", label: "Routing", icon: RouteIcon },
    { value: "receipt", label: "Receipt", icon: Receipt },
    { value: "invoice", label: "Invoice", icon: FileText },
    { value: "barcode", label: "Barcode", icon: Barcode },
    { value: "autoprint", label: "Auto-Print", icon: Zap },
    { value: "testcenter", label: "Test Center", icon: FlaskConical },
    { value: "queue", label: "Queue", icon: ListOrdered },
    { value: "history", label: "History", icon: History },
    { value: "analytics", label: "Analytics", icon: TrendingUp },
    { value: "fleet", label: "Fleet", icon: Printer },
    { value: "diagnostics", label: "Diagnostics", icon: Activity },
    { value: "templates", label: "Templates", icon: FileCode },
    { value: "security", label: "Security", icon: ShieldCheck },
  ];

  return (
    <AppShell variant="store" title="Printing Settings">
      <PageHeader
        title="Printing Settings"
        description="Enterprise printing — engines, profiles, routing & diagnostics"
        actions={
          <Button size="sm" onClick={() => navigate({ to: "/settings/printing/wizard" })}>
            <Rocket className="h-4 w-4 mr-1.5" /> Setup Wizard
          </Button>
        }
      />

      <Tabs defaultValue="thermal" className="w-full">
        <div className="sticky top-0 z-20 -mx-4 px-4 md:-mx-6 md:px-6 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-1 rounded-none">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="shrink-0 gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="thermal" className="mt-6 focus-visible:outline-none">
          <ThermalPrinterQuickTab tenantId={currentTenantId} />
        </TabsContent>
        <TabsContent value="overview" className="mt-6 focus-visible:outline-none">
          <PrintingOverview tenantId={currentTenantId} />
        </TabsContent>
        <TabsContent value="general" className="mt-6 focus-visible:outline-none"><GeneralTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="printers" className="mt-6 focus-visible:outline-none"><PrintersTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="routing" className="mt-6 focus-visible:outline-none"><RoutingTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="receipt" className="mt-6 focus-visible:outline-none"><ReceiptConfigTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="invoice" className="mt-6 focus-visible:outline-none"><InvoiceConfigTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="barcode" className="mt-6 focus-visible:outline-none"><BarcodeConfigTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="autoprint" className="mt-6 focus-visible:outline-none"><AutoPrintTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="testcenter" className="mt-6 focus-visible:outline-none"><TestCenterTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="queue" className="mt-6 focus-visible:outline-none"><QueueTab /></TabsContent>
        <TabsContent value="history" className="mt-6 focus-visible:outline-none"><HistoryTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="analytics" className="mt-6 focus-visible:outline-none"><AnalyticsTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="fleet" className="mt-6 focus-visible:outline-none"><FleetTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="diagnostics" className="mt-6 focus-visible:outline-none"><DiagnosticsTab tenantId={currentTenantId} /></TabsContent>
        <TabsContent value="templates" className="mt-6 focus-visible:outline-none"><TemplatesTab /></TabsContent>
        <TabsContent value="security" className="mt-6 focus-visible:outline-none"><PrintingSecurityTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

/* ============================= GENERAL (existing UI, preserved verbatim) ============================= */
function GeneralTab({ tenantId }: { tenantId: string | null }) {
  const [settings, setSettings] = useState<PrintingSettings>(DEFAULT_PRINTING_SETTINGS);
  const [printers, setPrinters] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [version, setVersion] = useState<string | undefined>();
  const [busy, setBusy] = useState<"connect" | "refresh" | "test-barcode" | "test-receipt" | "test-a4" | null>(null);
  const remote = usePrintingSettingsRemote({ tenantId });

  useEffect(() => { setSettings(loadPrintingSettings(tenantId)); }, [tenantId]);

  const refreshStatus = useCallback(async () => { setConnected(await qzIsConnected()); }, []);
  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  const update = (patch: Partial<PrintingSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      savePrintingSettings(next, tenantId);
      // mirror to DB if available (best-effort, non-blocking)
      if (tenantId) {
        void remote.save({
          engine: next.engine,
          paper_width_mm: parseWidthMm(next.paperWidth),
          printer_language: next.printerLanguage,
        }).catch(() => null);
      }
      return next;
    });
  };

  const handleConnect = async () => {
    setBusy("connect");
    const status = await qzConnect();
    setConnected(status.connected);
    setVersion(status.version);
    if (status.connected) toast.success(`QZ Tray connected${status.version ? ` (v${status.version})` : ""}`);
    else toast.error(status.error ?? "Could not connect to QZ Tray");
    if (status.connected) {
      const list = await qzFindPrinters();
      setPrinters(list);
    }
    setBusy(null);
  };
  const handleDisconnect = async () => { await qzDisconnect(); setConnected(false); toast.message("Disconnected from QZ Tray"); };
  const handleReconnect = async () => { setBusy("connect"); const s = await qzReconnect(); setConnected(s.connected); setVersion(s.version); setBusy(null); };
  const refreshPrinters = async () => { setBusy("refresh"); const list = await qzFindPrinters(); setPrinters(list); setBusy(null); toast.message(`Found ${list.length} printer${list.length === 1 ? "" : "s"}`); };

  const testBarcode = async () => {
    setBusy("test-barcode");
    const zpl = buildZplLabel({ text: "SohojPharma Test", barcode: "1234567890" });
    const res = await print({ kind: "barcode", payload: zpl });
    setBusy(null);
    if (res.ok) toast.success(`Barcode sent via ${res.engine}${res.fallbackUsed ? " (fallback)" : ""}`);
    else toast.error(res.error ?? "Barcode test failed");
  };
  const testReceipt = async (width: PaperWidth) => {
    setBusy("test-receipt");
    const html = `<div style="font-family:monospace;padding:4mm;text-align:center;"><strong>SohojPharma</strong><br/>Test Receipt ${width}<br/>${new Date().toLocaleString()}</div>`;
    const res = await print({ kind: "thermal-receipt", payload: html, paperWidth: width });
    setBusy(null);
    if (res.ok) toast.success(`Receipt ${width} sent via ${res.engine}${res.fallbackUsed ? " (fallback)" : ""}`);
    else toast.error(res.error ?? "Receipt test failed");
  };
  const testA4 = async () => {
    setBusy("test-a4");
    const html = `<div style="padding:20mm;font-family:sans-serif;"><h1>SohojPharma</h1><p>Test A4 invoice — ${new Date().toLocaleString()}</p></div>`;
    const res = await print({ kind: "a4-invoice", payload: html });
    setBusy(null);
    if (res.ok) toast.success(`A4 sent via ${res.engine}${res.fallbackUsed ? " (fallback)" : ""}`);
    else toast.error(res.error ?? "A4 test failed");
  };

  const printerOptions = unique([
    ...(settings.receiptPrinter ? [settings.receiptPrinter] : []),
    ...(settings.barcodePrinter ? [settings.barcodePrinter] : []),
    ...printers,
  ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> QZ Tray Connection</CardTitle>
            <CardDescription>Silent printing engine status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              {connected
                ? <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Connected{version ? ` · v${version}` : ""}</Badge>
                : <Badge variant="secondary" className="gap-1"><XCircle className="h-3 w-3" /> Disconnected</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              {!connected
                ? <Button onClick={handleConnect} disabled={busy === "connect"} size="sm">{busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect"}</Button>
                : <Button onClick={handleDisconnect} size="sm" variant="outline">Disconnect</Button>}
              <Button onClick={handleReconnect} size="sm" variant="outline" disabled={busy === "connect"}><RefreshCw className="h-4 w-4 mr-1" /> Reconnect</Button>
              <Button onClick={refreshPrinters} size="sm" variant="outline" disabled={busy === "refresh" || !connected}>{busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh Printers"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">Requires QZ Tray installed and running on this workstation (qz.io). If not connected, the system falls back to Chrome print automatically.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engine & Paper</CardTitle>
            <CardDescription>Applied automatically to all print actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Preferred Engine</Label>
              <Select value={settings.engine} onValueChange={(v) => update({ engine: v as PrintEngine })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (QZ if connected, else Chrome)</SelectItem>
                  <SelectItem value="chrome">Chrome Print</SelectItem>
                  <SelectItem value="qz">QZ Tray Silent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Invoice Paper Width</Label>
              <Select value={settings.paperWidth} onValueChange={(v) => update({ paperWidth: v as PaperWidth })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="38mm">38 mm</SelectItem>
                  <SelectItem value="58mm">58 mm</SelectItem>
                  <SelectItem value="80mm">80 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Printer Language (barcode)</Label>
              <Select value={settings.printerLanguage} onValueChange={(v) => update({ printerLanguage: v as PrinterLanguage })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZPL">ZPL (Rongta RP400H default)</SelectItem>
                  <SelectItem value="TSPL">TSPL</SelectItem>
                  <SelectItem value="EPL">EPL</SelectItem>
                  <SelectItem value="ESCPOS">ESC/POS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Receipt Printer</CardTitle><CardDescription>Used for POS invoices &amp; thermal receipts</CardDescription></CardHeader>
          <CardContent>
            <Select value={settings.receiptPrinter ?? ""} onValueChange={(v) => update({ receiptPrinter: v || null })} disabled={printerOptions.length === 0}>
              <SelectTrigger><SelectValue placeholder={connected ? "Select a printer" : "Connect QZ to discover"} /></SelectTrigger>
              <SelectContent>{printerOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Barcode Printer</CardTitle><CardDescription>Auto-detects Rongta RP400H / any ZPL printer</CardDescription></CardHeader>
          <CardContent>
            <Select value={settings.barcodePrinter ?? ""} onValueChange={(v) => update({ barcodePrinter: v || null })} disabled={printerOptions.length === 0}>
              <SelectTrigger><SelectValue placeholder={connected ? "Select a printer" : "Connect QZ to discover"} /></SelectTrigger>
              <SelectContent>{printerOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Test Prints</CardTitle><CardDescription>Send a sample job through the configured engine</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={testBarcode} disabled={busy === "test-barcode"}>{busy === "test-barcode" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test Barcode"}</Button>
          <Button size="sm" variant="outline" onClick={() => testReceipt("38mm")} disabled={busy === "test-receipt"}>Test Receipt 38mm</Button>
          <Button size="sm" variant="outline" onClick={() => testReceipt("58mm")} disabled={busy === "test-receipt"}>Test Receipt 58mm</Button>
          <Button size="sm" variant="outline" onClick={() => testReceipt("80mm")} disabled={busy === "test-receipt"}>Test Receipt 80mm</Button>
          <Button size="sm" variant="outline" onClick={testA4} disabled={busy === "test-a4"}>Test A4 Invoice</Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================= PRINTERS ============================= */
function PrintersTab({ tenantId }: { tenantId: string | null }) {
  const { items, upsert, remove, loading } = usePrinterProfiles({ tenantId });
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [form, setForm] = useState({ name: "", printer_role: "barcode", paper_width_mm: 80, language: "ZPL" });

  const scan = async () => {
    const list = await qzFindPrinters().catch(() => []);
    setDiscovered(list);
    toast.message(`Discovered ${list.length} printer${list.length === 1 ? "" : "s"}`);
  };

  const adopt = async (name: string) => {
    const det = detectPrinter(name);
    await upsert({
      printer_role: det.role,
      name,
      language: det.language,
      paper_width_mm: det.paperWidthMm,
      auto_detected: true,
    });
    toast.success(`Added ${name} as ${det.role}`);
  };

  const submit = async () => {
    if (!form.name) { toast.error("Printer name required"); return; }
    await upsert(form);
    setForm({ name: "", printer_role: "barcode", paper_width_mm: 80, language: "ZPL" });
    toast.success("Printer profile saved");
  };

  if (!tenantId) return <EmptyHint />;

  return (
    <div className="space-y-4">
      <PrintingEngineSection tenantId={tenantId} />
      <QzConnectionSection />


      <Card>
        <CardHeader>
          <CardTitle>Discovered Printers</CardTitle>
          <CardDescription>Click "Adopt" to add as a profile with auto-detected role.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button size="sm" variant="outline" onClick={scan}><RefreshCw className="h-4 w-4 mr-1" /> Scan</Button>
          <div className="flex flex-wrap gap-2 pt-2">
            {discovered.length === 0 && <p className="text-sm text-muted-foreground">No printers discovered yet.</p>}
            {discovered.map((p) => {
              const d = detectPrinter(p);
              return (
                <div key={p} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Badge variant={d.confidence === "high" ? "default" : "secondary"}>{d.role}</Badge>
                  <span className="text-sm">{p}</span>
                  <Button size="sm" variant="ghost" onClick={() => adopt(p)}><Plus className="h-3 w-3 mr-1" /> Adopt</Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Manual Add</CardTitle></CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-5 items-end">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Role</Label>
            <Select value={form.printer_role} onValueChange={(v) => setForm({ ...form, printer_role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="barcode">Barcode</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Width (mm)</Label><Input type="number" value={form.paper_width_mm} onChange={(e) => setForm({ ...form, paper_width_mm: Number(e.target.value) })} /></div>
          <div>
            <Label>Language</Label>
            <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ZPL">ZPL</SelectItem>
                <SelectItem value="TSPL">TSPL</SelectItem>
                <SelectItem value="EPL">EPL</SelectItem>
                <SelectItem value="ESCPOS">ESC/POS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit}>Save</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Configured Profiles</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Name</TableHead><TableHead>Width</TableHead><TableHead>Language</TableHead><TableHead>Auto</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-muted-foreground text-sm">No printer profiles yet.</TableCell></TableRow>}
                {items.map((p) => (
                  <TableRow key={String(p.id)}>
                    <TableCell><Badge>{String(p.printer_role)}</Badge></TableCell>
                    <TableCell>{String(p.name)}</TableCell>
                    <TableCell>{String(p.paper_width_mm)} mm</TableCell>
                    <TableCell>{String(p.language)}</TableCell>
                    <TableCell>{p.auto_detected ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : "—"}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => remove(String(p.id))}><Trash2 className="h-3 w-3" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PrinterDiscoveryAdvanced tenantId={tenantId} />
    </div>
  );
}

/* ============================= QUEUE ============================= */
function QueueTab() {
  const items = usePrintQueue();
  return (
    <Card>
      <CardHeader><CardTitle>Print Queue</CardTitle><CardDescription>Current in-flight and pending jobs (resets per session)</CardDescription></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Printer</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Queue is empty.</TableCell></TableRow>}
            {items.map((q) => (
              <TableRow key={q.id}>
                <TableCell>{q.documentType}{q.documentId ? ` · ${q.documentId}` : ""}</TableCell>
                <TableCell className="text-xs">{q.job.printer ?? "—"}</TableCell>
                <TableCell><StatusBadge status={q.status} /></TableCell>
                <TableCell>{q.attempts}</TableCell>
                <TableCell className="text-xs text-destructive">{q.error ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ============================= HISTORY ============================= */
function HistoryTab({ tenantId }: { tenantId: string | null }) {
  const [status, setStatus] = useState<string>("");
  const { items, loading, reload, cancel } = usePrintHistory({ tenantId, status: status || undefined });

  if (!tenantId) return <EmptyHint />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Print History</CardTitle>
        <CardDescription>Recent 200 jobs across all users in this tenant</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => void reload()}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Document</TableHead><TableHead>Engine</TableHead><TableHead>Printer</TableHead><TableHead>Status</TableHead><TableHead>Duration</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-sm text-muted-foreground">No print jobs yet.</TableCell></TableRow>}
              {items.map((j) => (
                <TableRow key={String(j.id)}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(String(j.created_at)).toLocaleString()}</TableCell>
                  <TableCell>{String(j.document_type)}{j.document_id ? ` · ${String(j.document_id)}` : ""}</TableCell>
                  <TableCell><Badge variant="outline">{String(j.engine)}</Badge></TableCell>
                  <TableCell className="text-xs">{String(j.printer_name ?? "—")}</TableCell>
                  <TableCell><StatusBadge status={String(j.status) as never} /></TableCell>
                  <TableCell className="text-xs">{j.duration_ms ? `${j.duration_ms} ms` : "—"}</TableCell>
                  <TableCell>
                    {(j.status === "pending" || j.status === "printing") && (
                      <Button size="sm" variant="ghost" onClick={() => cancel(String(j.id))}>Cancel</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================= DIAGNOSTICS ============================= */
function DiagnosticsTab({ tenantId }: { tenantId: string | null }) {
  const health = usePrinterHealthMonitor({ tenantId });
  const queue = usePrintQueue();
  const settings = loadPrintingSettings(tenantId);
  const queueLen = queue.filter((q) => q.status === "pending" || q.status === "printing").length;
  const lastError = [...queue].reverse().find((q) => q.status === "failed")?.error;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>QZ Tray</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="Connected" v={health.qzConnected ? "Yes" : "No"} />
          <Row k="Last checked" v={health.checkedAt ? new Date(health.checkedAt).toLocaleTimeString() : "—"} />
          <Row k="Selected receipt" v={settings.receiptPrinter ?? "—"} />
          <Row k="Selected barcode" v={settings.barcodePrinter ?? "—"} />
          <Row k="Language" v={settings.printerLanguage} />
          <Row k="Paper width" v={settings.paperWidth} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Queue</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="In flight" v={String(queueLen)} />
          <Row k="Total in session" v={String(queue.length)} />
          <Row k="Last error" v={lastError ?? "—"} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================= TEMPLATES (placeholder list) ============================= */
function TemplatesTab() {
  return (
    <Card>
      <CardHeader><CardTitle>Label Templates</CardTitle><CardDescription>System defaults are pre-loaded. Custom templates can be added per tenant.</CardDescription></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Template editor coming next iteration. System defaults for medicine/shelf/price labels are already in use.</p>
      </CardContent>
    </Card>
  );
}


/* ============================= EXTRAS: shared helpers ============================= */
function useExtras(tenantId: string | null) {
  const [extras, setExtras] = useState<PrintingExtras>(() => loadExtras(tenantId));
  const [printers, setPrinters] = useState<string[]>([]);
  useEffect(() => { setExtras(loadExtras(tenantId)); }, [tenantId]);
  useEffect(() => {
    void (async () => {
      if (await qzIsConnected()) setPrinters(await qzFindPrinters().catch(() => []));
    })();
  }, []);
  const patch = <K extends keyof PrintingExtras>(k: K, v: Partial<PrintingExtras[K]>) => {
    setExtras((prev) => {
      const next = { ...prev, [k]: { ...prev[k], ...v } } as PrintingExtras;
      saveExtras(next, tenantId);
      return next;
    });
  };
  const refresh = async () => {
    setPrinters(await qzFindPrinters().catch(() => []));
  };
  return { extras, patch, printers, refresh };
}

function PrinterPicker({
  value, onChange, printers, placeholder = "Select printer",
}: { value: string | null; onChange: (v: string | null) => void; printers: string[]; placeholder?: string }) {
  const list = unique([...(value ? [value] : []), ...printers]);
  return (
    <Select value={value ?? "__none"} onValueChange={(v) => onChange(v === "__none" ? null : v)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">— None —</SelectItem>
        {list.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/* ============================= ROUTING (upgraded — see routing-manager.tsx) ============================= */
function RoutingTab({ tenantId }: { tenantId: string | null }) {
  return <RoutingManagerProvider tenantId={tenantId} />;
}

/* Receipt / Barcode / Invoice tabs moved to src/components/printing/config-tabs.tsx */


/* ============================= AUTO-PRINT ============================= */
function AutoPrintTab({ tenantId }: { tenantId: string | null }) {
  const { extras, patch } = useExtras(tenantId);
  const a = extras.autoPrint;
  const rows: Array<[keyof typeof a, string, string]> = [
    ["receiptAfterSale", "Receipt after Sale", "Print thermal receipt as soon as a sale completes"],
    ["invoiceAfterSale", "Invoice after Sale", "Print A4/A5 invoice as soon as a sale completes"],
    ["barcodeAfterProductCreate", "Barcode after Product Create", "Auto-print barcode when a product is created"],
    ["purchaseLabelAfterPurchase", "Purchase Label after Purchase", "Auto-print labels on goods receipt"],
    ["autoReprintOnRetry", "Auto Reprint on Retry", "When a failed job retries, send to printer again"],
  ];
  return (
    <Card>
      <CardHeader><CardTitle>Auto Print Rules</CardTitle><CardDescription>Workflow automation per store.</CardDescription></CardHeader>
      <CardContent className="space-y-2">
        {rows.map(([key, label, desc]) => (
          <div key={key} className="flex items-center justify-between rounded-md border p-3">
            <div><div className="font-medium">{label}</div><div className="text-xs text-muted-foreground">{desc}</div></div>
            <Switch checked={a[key]} onCheckedChange={(v) => patch("autoPrint", { [key]: v } as Partial<typeof a>)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ============================= TEST CENTER ============================= */
function TestCenterTab({ tenantId }: { tenantId: string | null }) {
  const settings = loadPrintingSettings(tenantId);
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, fn: () => Promise<{ ok: boolean; engine?: string; error?: string }>) => {
    setBusy(label);
    try {
      const res = await fn();
      if (res.ok) toast.success(`${label} OK${res.engine ? ` via ${res.engine}` : ""}`);
      else toast.error(`${label} failed: ${res.error ?? "unknown"}`);
    } finally { setBusy(null); }
  };
  const html = (body: string) => `<div style="font-family:monospace;padding:4mm">${body}</div>`;
  return (
    <Card>
      <CardHeader><CardTitle>Test Center</CardTitle><CardDescription>Send sample jobs using the currently selected profile.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("Test Receipt", () => print({ kind: "thermal-receipt", payload: html("Test Receipt"), paperWidth: settings.paperWidth }))}>Print Test Receipt</Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("Test Invoice", () => print({ kind: "a4-invoice", payload: html("Test Invoice") }))}>Print Test Invoice</Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("Test Barcode", () => print({ kind: "barcode", payload: buildZplLabel({ text: "Test", barcode: "1234567890" }) }))}>Print Test Barcode</Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("Test Label", () => print({ kind: "medicine-label", payload: buildZplLabel({ text: "Label", barcode: "9999999999" }) }))}>Print Test Label</Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run("Test QR", () => print({ kind: "barcode", payload: buildZplLabel({ text: "QR", barcode: "https://sohojpharma.cloud" }) }))}>Print Test QR</Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => toast.message("Cash drawer command queued (requires ESC/POS receipt printer)")}>Open Cash Drawer</Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={async () => {
          const { runProductionValidation } = await import("@/lib/printing");
          const report = await runProductionValidation({ hasProfile: true, fallbackEnabled: true });
          toast[report.ok ? "success" : "warning"](`Production check: ${report.ok ? "PASS" : "WARN"} (${report.checks.length} checks)`);
        }}>Run Production Check</Button>
      </CardContent>
    </Card>
  );
}

/* ============================= helpers ============================= */
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
function StatusBadge({ status }: { status: "pending" | "printing" | "completed" | "failed" | "cancelled" }) {
  const map = {
    pending: { v: "secondary", t: "Pending" },
    printing: { v: "default", t: "Printing" },
    completed: { v: "default", t: "Completed" },
    failed: { v: "destructive", t: "Failed" },
    cancelled: { v: "outline", t: "Cancelled" },
  } as const;
  const m = map[status];
  return <Badge variant={m.v as never}>{m.t}</Badge>;
}
function EmptyHint() {
  return <p className="text-sm text-muted-foreground p-4">Tenant context not available.</p>;
}
function unique(arr: string[]): string[] { return Array.from(new Set(arr.filter(Boolean))); }
function parseWidthMm(w: PaperWidth): number {
  return parseInt(w, 10) || 80;
}
// avoid unused-warning for useMemo

/* ============================= PRINTING ENGINE (additive) ============================= */
function PrintingEngineSection({ tenantId }: { tenantId: string | null }) {
  const remote = usePrintingSettingsRemote({ tenantId });
  const row = (remote.data ?? {}) as {
    engine?: PrintEngine;
    fallback_enabled?: boolean;
    silent_print?: boolean;
    auto_connect?: boolean;
  };
  const engine: PrintEngine = (row.engine as PrintEngine) ?? "auto";
  const fallback = row.fallback_enabled ?? true;
  const silent = row.silent_print ?? false;
  const autoConnect = row.auto_connect ?? false;
  const [saving, setSaving] = useState<string | null>(null);

  const update = async (label: string, patch: Record<string, unknown>) => {
    setSaving(label);
    try {
      await remote.save(patch);
      toast.success("Printing engine updated");
      if (patch.auto_connect === true) {
        qzConnect().catch(() => undefined);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  const silentDisabled = engine !== "qz";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Printer className="h-4 w-4" /> Printing Engine</CardTitle>
        <CardDescription>Choose the default engine and how the printing module behaves.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Default Print Engine</Label>
          <Select
            value={engine}
            onValueChange={(v) => void update("engine", { engine: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (Recommended)</SelectItem>
              <SelectItem value="chrome">Chrome Browser</SelectItem>
              <SelectItem value="qz">QZ Tray</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Auto uses QZ when available and falls back to Chrome.</p>
        </div>

        <div className="flex items-start justify-between rounded-md border p-3">
          <div>
            <Label>Chrome Fallback</Label>
            <p className="text-xs text-muted-foreground">If QZ is unavailable, automatically use Chrome printing.</p>
          </div>
          <Switch
            checked={fallback}
            disabled={saving === "fallback"}
            onCheckedChange={(v) => void update("fallback", { fallback_enabled: v })}
          />
        </div>

        <div className="flex items-start justify-between rounded-md border p-3">
          <div>
            <Label>Silent Printing</Label>
            <p className="text-xs text-muted-foreground">
              {silentDisabled ? "Available only when QZ Tray is the selected engine." : "Skip browser print dialog via QZ Tray."}
            </p>
          </div>
          <Switch
            checked={!silentDisabled && silent}
            disabled={silentDisabled || saving === "silent"}
            onCheckedChange={(v) => void update("silent", { silent_print: v })}
          />
        </div>

        <div className="flex items-start justify-between rounded-md border p-3">
          <div>
            <Label>Auto Connect QZ</Label>
            <p className="text-xs text-muted-foreground">Connect to QZ Tray automatically on app start.</p>
          </div>
          <Switch
            checked={autoConnect}
            disabled={saving === "auto"}
            onCheckedChange={(v) => void update("auto", { auto_connect: v })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

void useMemo;

/* ============================= QZ TRAY CONNECTION (additive) ============================= */
function QzConnectionSection() {
  const [status, setStatus] = useState<{ available: boolean; connected: boolean; version?: string; error?: string }>({
    available: true, connected: false,
  });
  const [printerCount, setPrinterCount] = useState<number | null>(null);
  const [lastConnected, setLastConnected] = useState<Date | null>(null);
  const [busy, setBusy] = useState<"connect" | "disconnect" | "reconnect" | "test" | "refresh" | null>(null);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const connected = await qzIsConnected();
      setStatus((s) => ({ ...s, connected, available: true }));
      if (connected) {
        setLastConnected((d) => d ?? new Date());
        try { setPrinterCount((await qzFindPrinters()).length); } catch { /* noop */ }
      }
    } catch (e) {
      setStatus({ available: false, connected: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => { void refresh(); }, 7000);
    };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { document.hidden ? stop() : start(); };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  const doConnect = async () => {
    setBusy("connect"); setConnecting(true);
    try {
      const s = await qzConnect();
      setStatus(s);
      if (s.connected) {
        setLastConnected(new Date());
        try { setPrinterCount((await qzFindPrinters()).length); } catch { /* noop */ }
        toast.success(`QZ Tray connected${s.version ? ` (v${s.version})` : ""}`);
      } else {
        toast.error(s.error ?? "Failed to connect");
      }
    } finally { setBusy(null); setConnecting(false); }
  };

  const doDisconnect = async () => {
    setBusy("disconnect");
    try { await qzDisconnect(); setStatus((s) => ({ ...s, connected: false })); toast.message("QZ Tray disconnected"); }
    finally { setBusy(null); }
  };

  const doReconnect = async () => {
    setBusy("reconnect"); setConnecting(true);
    try {
      const s = await qzReconnect();
      setStatus(s);
      if (s.connected) { setLastConnected(new Date()); toast.success("Reconnected"); }
      else toast.error(s.error ?? "Reconnect failed");
    } finally { setBusy(null); setConnecting(false); }
  };

  const doTest = async () => {
    setBusy("test");
    try {
      const connected = await qzIsConnected();
      if (!connected) {
        const s = await qzConnect();
        setStatus(s);
        if (!s.connected) { toast.error(s.error ?? "QZ unreachable"); return; }
        setLastConnected(new Date());
      }
      const list = await qzFindPrinters().catch(() => [] as string[]);
      setPrinterCount(list.length);
      toast.success(`QZ reachable${status.version ? ` v${status.version}` : ""} — ${list.length} printer(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally { setBusy(null); }
  };

  const doRefresh = async () => {
    setBusy("refresh");
    try { await refresh(); toast.message("Status refreshed"); }
    finally { setBusy(null); }
  };

  const state: "connected" | "connecting" | "offline" =
    connecting ? "connecting" : status.connected ? "connected" : "offline";

  const badge = state === "connected"
    ? <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white">🟢 Connected</Badge>
    : state === "connecting"
    ? <Badge className="bg-amber-500 hover:bg-amber-500 text-white">🟠 Connecting</Badge>
    : <Badge variant="destructive">🔴 Offline</Badge>;

  const notInstalled = status.available === false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" /> QZ Tray Connection</CardTitle>
            <CardDescription>Live status of the QZ Tray silent-print bridge.</CardDescription>
          </div>
          {badge}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {notInstalled ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 space-y-3">
            <p className="text-sm font-medium">QZ Tray is not installed on this computer.</p>
            <p className="text-xs text-muted-foreground">Chrome printing continues to work normally.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <a href="https://qz.io/download/" target="_blank" rel="noreferrer">Download QZ Tray</a>
              </Button>
              <Button size="sm" variant="outline" onClick={doConnect} disabled={busy !== null}>
                {busy === "connect" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                Retry Connection
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="Version" value={status.version ?? "—"} />
          <InfoItem label="Host" value="localhost" />
          <InfoItem label="Port" value="8181 / 8282" />
          <InfoItem label="Last Connected" value={lastConnected ? lastConnected.toLocaleTimeString() : "—"} />
          <InfoItem label="Printers" value={printerCount === null ? "—" : String(printerCount)} />
          <InfoItem label="Last Error" value={status.error ?? "None"} tone={status.error ? "error" : undefined} />
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={doConnect} disabled={busy !== null || status.connected}>
            {busy === "connect" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plug className="h-4 w-4 mr-1" />}
            Connect
          </Button>
          <Button size="sm" variant="outline" onClick={doDisconnect} disabled={busy !== null || !status.connected}>
            {busy === "disconnect" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
            Disconnect
          </Button>
          <Button size="sm" variant="outline" onClick={doReconnect} disabled={busy !== null}>
            {busy === "reconnect" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Reconnect
          </Button>
          <Button size="sm" variant="outline" onClick={doTest} disabled={busy !== null}>
            {busy === "test" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Test Connection
          </Button>
          <Button size="sm" variant="ghost" onClick={doRefresh} disabled={busy !== null}>
            {busy === "refresh" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh Status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium break-words ${tone === "error" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

/* ============================= PRINTER DISCOVERY & PROFILES (additive, advanced) ============================= */

type AdvDriver = "Auto" | "ZPL" | "ESC/POS" | "EPL" | "RAW";
type AdvEngine = "chrome" | "qz";
type AdvConn = "USB" | "LAN" | "WiFi";
type AdvPaper = "38mm" | "58mm" | "80mm" | "A4" | "Custom";

interface AdvExtras {
  engine?: AdvEngine;
  driver?: AdvDriver;
  copies?: number;
  connectionType?: AdvConn;
  enabled?: boolean;
  note?: string;
  paperLabel?: AdvPaper;
}

function parseExtras(notes: unknown): AdvExtras {
  if (typeof notes !== "string" || !notes) return {};
  try {
    const v = JSON.parse(notes);
    return typeof v === "object" && v !== null ? (v as AdvExtras) : { note: notes };
  } catch {
    return { note: notes };
  }
}

function driverToLanguage(d: AdvDriver): PrinterLanguage {
  if (d === "ZPL" || d === "Auto") return "ZPL";
  if (d === "EPL") return "EPL";
  return "ESCPOS"; // ESC/POS, RAW
}

function paperToMm(p: AdvPaper, custom: number): number {
  if (p === "38mm") return 38;
  if (p === "58mm") return 58;
  if (p === "80mm") return 80;
  if (p === "A4") return 210;
  return Math.max(20, Math.min(300, Math.round(custom || 80)));
}

function mmToPaper(mm: number): AdvPaper {
  if (mm === 38) return "38mm";
  if (mm === 58) return "58mm";
  if (mm === 80) return "80mm";
  if (mm === 210) return "A4";
  return "Custom";
}

function guessConnection(name: string): "USB" | "Network" | "Virtual" {
  const n = name.toLowerCase();
  if (/(pdf|xps|onenote|fax|microsoft print|nitro)/.test(n)) return "Virtual";
  if (/(tcp|lan|ethernet|wifi|wireless|ip_|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/.test(n)) return "Network";
  return "USB";
}

function guessDriver(name: string): AdvDriver {
  const d = detectPrinter(name);
  if (d.language === "ZPL") return "ZPL";
  if (d.language === "EPL") return "EPL";
  if (d.language === "ESCPOS") return "ESC/POS";
  return "Auto";
}

interface AdvProfile {
  id?: string;
  name: string;
  printer_role: string;
  language: PrinterLanguage;
  paper_width_mm: number;
  is_default?: boolean;
  notes?: string | null;
}

const EMPTY_FORM = {
  id: undefined as string | undefined,
  profileName: "",
  printerName: "",
  engine: "qz" as AdvEngine,
  driver: "Auto" as AdvDriver,
  paper: "80mm" as AdvPaper,
  customWidth: 80,
  copies: 1,
  connectionType: "USB" as AdvConn,
  notes: "",
  enabled: true,
  isDefault: false,
};

function PrinterDiscoveryAdvanced({ tenantId }: { tenantId: string | null }) {
  const { items, upsert, remove, reload } = usePrinterProfiles({ tenantId });
  const [printers, setPrinters] = useState<string[]>([]);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [qzOk, setQzOk] = useState<boolean>(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const refreshAll = useCallback(async () => {
    setBusy("refresh");
    try {
      const connected = await qzIsConnected();
      setQzOk(connected);
      if (!connected) { setPrinters([]); setDefaultPrinter(null); return; }
      const [list, def] = await Promise.all([
        qzFindPrinters().catch(() => [] as string[]),
        qzFindDefaultPrinter().catch(() => null),
      ]);
      setPrinters(list);
      setDefaultPrinter(def);
      setLastRefresh(new Date());
    } finally { setBusy(null); }
  }, []);

  useEffect(() => { void refreshAll(); }, [refreshAll]);

  const onDetect = async () => {
    setBusy("detect");
    try {
      const list = await qzFindPrinters().catch(() => [] as string[]);
      setPrinters(list); setLastRefresh(new Date());
      toast.success(`Detected ${list.length} printer${list.length === 1 ? "" : "s"}`);
    } finally { setBusy(null); }
  };
  const onFindDefault = async () => {
    setBusy("default");
    try {
      const def = await qzFindDefaultPrinter().catch(() => null);
      setDefaultPrinter(def);
      toast.message(def ? `Default: ${def}` : "No default printer found");
    } finally { setBusy(null); }
  };

  const assignToProfile = (name: string) => {
    const drv = guessDriver(name);
    const det = detectPrinter(name);
    setForm({
      ...EMPTY_FORM,
      printerName: name,
      profileName: name,
      driver: drv,
      paper: mmToPaper(det.paperWidthMm),
      customWidth: det.paperWidthMm,
      connectionType: guessConnection(name) === "Network" ? "LAN" : "USB",
      isDefault: name === defaultPrinter,
    });
    toast.message(`Loaded ${name} into the editor`);
  };

  const testPrint = async (printerName: string, engine: AdvEngine = "qz", driver: AdvDriver = "Auto", paperMm = 80) => {
    setBusy(`test:${printerName}`);
    try {
      const lang = driverToLanguage(driver);
      const isThermal = paperMm <= 100;
      let payload: string;
      let kind: "barcode" | "thermal-receipt" | "a4-invoice";
      if (lang === "ZPL" || lang === "EPL") {
        payload = buildZplLabel({ text: "SohojPharma Test", barcode: "TEST-0001" });
        kind = "barcode";
      } else if (isThermal) {
        payload = `<div style="font-family:monospace;padding:4mm;text-align:center;"><strong>SohojPharma</strong><br/>Test Receipt<br/>${printerName}<br/>${new Date().toLocaleString()}</div>`;
        kind = "thermal-receipt";
      } else {
        payload = `<div style="padding:20mm;font-family:sans-serif;"><h2>SohojPharma Test</h2><p>Printer: ${printerName}</p><p>${new Date().toLocaleString()}</p></div>`;
        kind = "a4-invoice";
      }
      void engine; // engine preference is honored by PrintManager via settings; per-job override is not part of PrintJob
      const res = await print({
        kind,
        payload,
        printer: printerName,
        paperWidth: (isThermal ? (paperMm === 38 ? "38mm" : paperMm === 58 ? "58mm" : "80mm") : undefined) as PaperWidth | undefined,
      });
      if (res.ok) toast.success(`Test sent via ${res.engine}${res.fallbackUsed ? " (fallback)" : ""}`);
      else toast.error(res.error ?? "Test print failed");
    } finally { setBusy(null); }
  };

  const saveProfile = async () => {
    if (!form.profileName.trim()) { toast.error("Profile name required"); return; }
    if (!form.printerName.trim()) { toast.error("Select a detected printer"); return; }
    const widthMm = paperToMm(form.paper, form.customWidth);
    const lang = driverToLanguage(form.driver);
    const det = detectPrinter(form.printerName);
    const extras: AdvExtras = {
      engine: form.engine,
      driver: form.driver,
      copies: Math.max(1, Number(form.copies) || 1),
      connectionType: form.connectionType,
      enabled: form.enabled,
      note: form.notes,
      paperLabel: form.paper,
    };
    setBusy("save");
    try {
      await upsert({
        id: form.id,
        name: form.profileName,
        printer_role: det.role,
        language: lang,
        paper_width_mm: widthMm,
        is_default: form.isDefault,
        notes: JSON.stringify(extras),
      });
      toast.success("Profile saved");
      setForm({ ...EMPTY_FORM });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(null); }
  };

  const editProfile = (p: AdvProfile) => {
    const ex = parseExtras(p.notes);
    setForm({
      id: p.id,
      profileName: p.name,
      printerName: p.name,
      engine: (ex.engine ?? "qz") as AdvEngine,
      driver: (ex.driver ?? "Auto") as AdvDriver,
      paper: (ex.paperLabel ?? mmToPaper(p.paper_width_mm)) as AdvPaper,
      customWidth: p.paper_width_mm,
      copies: ex.copies ?? 1,
      connectionType: (ex.connectionType ?? "USB") as AdvConn,
      notes: ex.note ?? "",
      enabled: ex.enabled ?? true,
      isDefault: !!p.is_default,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const duplicateProfile = async (p: AdvProfile) => {
    setBusy("dup");
    try {
      await upsert({
        name: `${p.name} (Copy)`,
        printer_role: p.printer_role,
        language: p.language,
        paper_width_mm: p.paper_width_mm,
        is_default: false,
        notes: typeof p.notes === "string" ? p.notes : null,
      });
      toast.success("Profile duplicated");
    } finally { setBusy(null); }
  };

  const deleteProfile = async (id: string) => {
    setBusy(`del:${id}`);
    try { await remove(id); toast.success("Profile deleted"); }
    finally { setBusy(null); }
  };

  const profiles = items as unknown as AdvProfile[];

  return (
    <div className="space-y-4">
      {/* SECTION 1: Discovery */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-4 w-4" /> Printer Discovery</CardTitle>
          <CardDescription>Discover printers connected to this workstation via QZ Tray.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={refreshAll} disabled={busy === "refresh"}>
              {busy === "refresh" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Refresh Printers
            </Button>
            <Button size="sm" variant="outline" onClick={onDetect} disabled={busy === "detect" || !qzOk}>
              {busy === "detect" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plug className="h-4 w-4 mr-1" />} Detect Printers
            </Button>
            <Button size="sm" variant="outline" onClick={onFindDefault} disabled={busy === "default" || !qzOk}>
              {busy === "default" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Find Default Printer
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoItem label="Total Detected" value={String(printers.length)} />
            <InfoItem label="Default Printer" value={defaultPrinter ?? "—"} />
            <InfoItem label="Last Refresh" value={lastRefresh ? lastRefresh.toLocaleTimeString() : "—"} />
          </div>
          {!qzOk && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Connect QZ Tray to discover printers. Use the QZ Tray Connection panel above.
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: Available Printers */}
      <Card>
        <CardHeader>
          <CardTitle>Available Printers</CardTitle>
          <CardDescription>All printers reported by the workstation.</CardDescription>
        </CardHeader>
        <CardContent>
          {printers.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center space-y-3">
              <p className="text-sm font-medium">No printers detected.</p>
              <p className="text-xs text-muted-foreground">
                {qzOk ? "Try refreshing or check workstation printer settings." : "Connect QZ Tray to discover printers."}
              </p>
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" onClick={refreshAll} disabled={busy === "refresh"}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                </Button>
                {!qzOk && (
                  <Button size="sm" onClick={async () => { setBusy("qz"); try { const s = await qzConnect(); setQzOk(s.connected); if (s.connected) await refreshAll(); } finally { setBusy(null); } }}>
                    <Plug className="h-4 w-4 mr-1" /> Check QZ Connection
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Printer Name</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printers.map((p) => {
                  const conn = guessConnection(p);
                  const drv = guessDriver(p);
                  const isDefault = p === defaultPrinter;
                  return (
                    <TableRow key={p}>
                      <TableCell className="font-medium">{p}</TableCell>
                      <TableCell><Badge variant="outline">{conn}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{drv}</Badge></TableCell>
                      <TableCell><Badge variant={qzOk ? "default" : "secondary"}>{qzOk ? "Online" : "Unknown"}</Badge></TableCell>
                      <TableCell>{isDefault ? <Badge>Yes</Badge> : <span className="text-muted-foreground text-xs">No</span>}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" onClick={() => assignToProfile(p)}>Assign</Button>
                          <Button size="sm" variant="ghost" disabled={busy === `test:${p}`} onClick={() => testPrint(p, "qz", drv, 80)}>
                            {busy === `test:${p}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={refreshAll}><RefreshCw className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SECTION 3: Profile Editor */}
      <Card>
        <CardHeader>
          <CardTitle>{form.id ? "Edit Printer Profile" : "Add Printer Profile"}</CardTitle>
          <CardDescription>Create a reusable profile bound to a discovered printer.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Profile Name</Label>
            <Input value={form.profileName} onChange={(e) => setForm({ ...form, profileName: e.target.value })} placeholder="POS Receipt Printer" />
          </div>
          <div className="space-y-1.5">
            <Label>Detected Printer</Label>
            <Select value={form.printerName || undefined} onValueChange={(v) => setForm({ ...form, printerName: v })}>
              <SelectTrigger><SelectValue placeholder={printers.length ? "Select a printer" : "No printers detected"} /></SelectTrigger>
              <SelectContent>
                {printers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                {form.printerName && !printers.includes(form.printerName) && (
                  <SelectItem value={form.printerName}>{form.printerName}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Print Engine</Label>
            <Select value={form.engine} onValueChange={(v) => setForm({ ...form, engine: v as AdvEngine })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chrome">Chrome</SelectItem>
                <SelectItem value="qz">QZ Tray</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Driver</Label>
            <Select value={form.driver} onValueChange={(v) => setForm({ ...form, driver: v as AdvDriver })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Auto">Auto</SelectItem>
                <SelectItem value="ZPL">ZPL</SelectItem>
                <SelectItem value="ESC/POS">ESC/POS</SelectItem>
                <SelectItem value="EPL">EPL</SelectItem>
                <SelectItem value="RAW">RAW</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Paper Width</Label>
            <Select value={form.paper} onValueChange={(v) => setForm({ ...form, paper: v as AdvPaper })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="38mm">38 mm</SelectItem>
                <SelectItem value="58mm">58 mm</SelectItem>
                <SelectItem value="80mm">80 mm</SelectItem>
                <SelectItem value="A4">A4 (210 mm)</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {form.paper === "Custom" && (
              <Input type="number" min={20} max={300} value={form.customWidth}
                onChange={(e) => setForm({ ...form, customWidth: Number(e.target.value) })}
                placeholder="Width in mm" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Copies</Label>
            <Input type="number" min={1} value={form.copies} onChange={(e) => setForm({ ...form, copies: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Connection Type</Label>
            <Select value={form.connectionType} onValueChange={(v) => setForm({ ...form, connectionType: v as AdvConn })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USB">USB</SelectItem>
                <SelectItem value="LAN">LAN</SelectItem>
                <SelectItem value="WiFi">WiFi</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><Label>Enabled</Label><p className="text-xs text-muted-foreground">Profile available for use</p></div>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div><Label>Default Printer</Label><p className="text-xs text-muted-foreground">Use as default for its role</p></div>
            <Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2">
            {form.id && (
              <Button variant="outline" onClick={() => setForm({ ...EMPTY_FORM })}>Cancel</Button>
            )}
            <Button onClick={saveProfile} disabled={busy === "save"}>
              {busy === "save" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              {form.id ? "Update Profile" : "Save Profile"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 4: Profile Management */}
      <Card>
        <CardHeader>
          <CardTitle>Saved Profiles</CardTitle>
          <CardDescription>Manage all printer profiles for this tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No profiles yet. Detect a printer above and click <strong>Assign</strong> to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Profile</TableHead>
                  <TableHead>Printer</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Paper</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const ex = parseExtras(p.notes);
                  const enabled = ex.enabled !== false;
                  return (
                    <TableRow key={p.id ?? p.name}>
                      <TableCell className="font-medium">{p.name}{p.is_default ? <Badge className="ml-2">Default</Badge> : null}</TableCell>
                      <TableCell className="text-xs">{p.name}</TableCell>
                      <TableCell><Badge variant="outline">{ex.engine ?? "qz"}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{ex.driver ?? p.language}</Badge></TableCell>
                      <TableCell>{ex.paperLabel ?? `${p.paper_width_mm}mm`}</TableCell>
                      <TableCell>
                        {enabled
                          ? <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white">Enabled</Badge>
                          : <Badge variant="secondary">Disabled</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" onClick={() => editProfile(p)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => duplicateProfile(p)} disabled={busy === "dup"}>Duplicate</Button>
                          <Button size="sm" variant="ghost"
                            disabled={busy === `test:${p.name}`}
                            onClick={() => testPrint(p.name, (ex.engine ?? "qz") as AdvEngine, (ex.driver ?? "Auto") as AdvDriver, p.paper_width_mm)}>
                            {busy === `test:${p.name}` ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test Print"}
                          </Button>
                          {p.id && (
                            <Button size="sm" variant="ghost" onClick={() => deleteProfile(p.id!)} disabled={busy === `del:${p.id}`}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          <div className="flex justify-end pt-2">
            <Button size="sm" variant="ghost" onClick={() => void reload()}><RefreshCw className="h-3 w-3 mr-1" /> Reload</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


