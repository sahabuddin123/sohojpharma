// Print Routing Manager — additive UI built on existing PrinterProfiles & PrintManager.
// Stores routes in localStorage (per tenant). Does NOT modify printing engine, PrintManager,
// Chrome printing, QZ printing, existing routes, or printer profiles.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Copy, RotateCcw, Send, Settings2,
  ShieldAlert, Wand2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePrinterProfiles, print } from "@/lib/printing";
import type { PrintKind } from "@/lib/printing/types";
import {
  DOCUMENT_TYPES, DEFAULT_ROUTE, loadRoutes, saveRoutes, validateRoute,
  resolveRoute, computeHealth, parseProfileNotes,
  type DocumentRoute, type RoutingMap, type ProfileLike, type RouteEngine, type RoutePaper,
} from "@/lib/printing/routing-config";

const ENGINE_OPTIONS: Array<{ value: RouteEngine; label: string }> = [
  { value: "inherit", label: "Inherit from Profile" },
  { value: "auto", label: "Auto" },
  { value: "qz", label: "QZ (Silent)" },
  { value: "chrome", label: "Chrome (Dialog)" },
];

const PAPER_OPTIONS: Array<{ value: RoutePaper; label: string }> = [
  { value: "inherit", label: "Inherit from Profile" },
  { value: "38mm", label: "38 mm" },
  { value: "58mm", label: "58 mm" },
  { value: "80mm", label: "80 mm" },
  { value: "A4", label: "A4" },
];

const KIND_MAP: Record<string, PrintKind> = {
  "pos-receipt": "thermal-receipt",
  "pos-invoice": "pos-invoice",
  "sales-invoice": "a4-invoice",
  "purchase-invoice": "a4-invoice",
  "purchase-order": "a4-invoice",
  "quotation": "a4-invoice",
  "barcode-label": "barcode",
  "medicine-label": "medicine-label",
  "shelf-label": "shelf-label",
  "batch-label": "barcode",
  "expiry-label": "barcode",
  "customer-receipt": "thermal-receipt",
  "supplier-receipt": "thermal-receipt",
  "stock-transfer": "report",
  "stock-adjustment": "report",
  "payment-receipt": "thermal-receipt",
  "money-receipt": "thermal-receipt",
  "return-receipt": "thermal-receipt",
  "credit-note": "a4-invoice",
  "debit-note": "a4-invoice",
  "reports": "report",
  "a4-documents": "a4-invoice",
};

export function RoutingManager({ tenantId }: { tenantId: string | null }) {
  const { items, loading } = usePrinterProfiles({ tenantId });
  const profiles = items as unknown as ProfileLike[];
  const [routes, setRoutes] = useState<RoutingMap>(() => loadRoutes(tenantId));
  const [filter, setFilter] = useState("");
  const [busyTest, setBusyTest] = useState<string | null>(null);

  useEffect(() => { setRoutes(loadRoutes(tenantId)); }, [tenantId]);

  const persist = useCallback((next: RoutingMap) => {
    setRoutes(next);
    saveRoutes(next, tenantId);
  }, [tenantId]);

  const updateRoute = useCallback((docId: string, patch: Partial<DocumentRoute>) => {
    const current = routes[docId] ?? { ...DEFAULT_ROUTE };
    const next = { ...routes, [docId]: { ...current, ...patch } };
    persist(next);
  }, [routes, persist]);

  const resetRoute = useCallback((docId: string) => {
    const next = { ...routes };
    delete next[docId];
    persist(next);
    toast.success("Route reset");
  }, [routes, persist]);

  const restoreAllDefaults = useCallback(() => {
    persist({});
    toast.success("All routes restored to defaults");
  }, [persist]);

  const assignSameToAll = useCallback((profileId: string) => {
    const next: RoutingMap = { ...routes };
    for (const doc of DOCUMENT_TYPES) {
      const cur = next[doc.id] ?? { ...DEFAULT_ROUTE };
      next[doc.id] = { ...cur, profileId };
    }
    persist(next);
    toast.success(`Assigned to all ${DOCUMENT_TYPES.length} routes`);
  }, [routes, persist]);

  const copyFromRoute = useCallback((sourceDocId: string, targetDocId: string) => {
    const src = routes[sourceDocId];
    if (!src) { toast.error("Source route is not configured"); return; }
    persist({ ...routes, [targetDocId]: { ...src } });
    toast.success("Route copied");
  }, [routes, persist]);

  const health = useMemo(() => computeHealth(routes, profiles), [routes, profiles]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return DOCUMENT_TYPES;
    return DOCUMENT_TYPES.filter((d) =>
      d.label.toLowerCase().includes(q) || d.group.toLowerCase().includes(q),
    );
  }, [filter]);

  const grouped = useMemo(() => {
    const g: Record<string, typeof DOCUMENT_TYPES> = {};
    for (const d of filtered) (g[d.group] ??= []).push(d);
    return g;
  }, [filtered]);

  const handleTest = useCallback(async (docId: string) => {
    setBusyTest(docId);
    try {
      const resolved = resolveRoute(docId, routes, profiles);
      const kind = KIND_MAP[docId] ?? "report";
      const isLabel = kind === "barcode" || kind === "shelf-label" || kind === "medicine-label";
      const payload = isLabel
        ? `^XA^FO50,50^A0N,30,30^FDSohojPharma Test^FS^FO50,100^BCN,80,Y,N,N^FD12345^FS^XZ`
        : `<div style="font-family:monospace;padding:6mm">
             <h3>SohojPharma Routing Test</h3>
             <p>Document: <strong>${escapeHtml(docId)}</strong></p>
             <p>Profile: ${escapeHtml(resolved.profile?.name ?? "Store Default / Chrome Fallback")}</p>
             <p>Engine: ${resolved.engine} · Paper: ${resolved.paperWidth} · Copies: ${resolved.copies}</p>
             <p>${new Date().toLocaleString()}</p>
           </div>`;
      const res = await print({
        kind,
        payload,
        printer: resolved.profile?.name,
        paperWidth: resolved.paperWidth === "A4" ? undefined : (resolved.paperWidth as "38mm" | "58mm" | "80mm"),
      });
      if (res.ok) toast.success(`Test sent via ${res.engine}${res.fallbackUsed ? " (fallback)" : ""}`);
      else toast.error(res.error ?? "Test print failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusyTest(null);
    }
  }, [routes, profiles]);

  return (
    <div className="space-y-4">
      <HealthCard health={health} profileCount={profiles.length} loading={loading} />
      <BulkActionsCard
        profiles={profiles}
        onAssignAll={assignSameToAll}
        onRestoreDefaults={restoreAllDefaults}
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Document Routes</CardTitle>
            <CardDescription>
              Assign exactly which printer profile handles each document type. Overrides inherit from the profile by default.
            </CardDescription>
          </div>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter documents…"
            className="sm:max-w-xs"
          />
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(grouped).map(([group, docs]) => (
            <div key={group} className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground">{group}</h4>
              <div className="grid gap-3">
                {docs.map((doc) => (
                  <RouteRow
                    key={doc.id}
                    docId={doc.id}
                    docLabel={doc.label}
                    route={routes[doc.id] ?? { ...DEFAULT_ROUTE }}
                    profiles={profiles}
                    allRoutes={routes}
                    onChange={(patch) => updateRoute(doc.id, patch)}
                    onReset={() => resetRoute(doc.id)}
                    onCopyFrom={(src) => copyFromRoute(src, doc.id)}
                    onTest={() => handleTest(doc.id)}
                    testing={busyTest === doc.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <PreviewCard routes={routes} profiles={profiles} />
    </div>
  );
}

/* ---------- Sub-components ---------- */

function HealthCard({
  health, profileCount, loading,
}: { health: ReturnType<typeof computeHealth>; profileCount: number; loading: boolean }) {
  const tone =
    health.level === "green" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    : health.level === "yellow" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
    : "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30";
  const dot =
    health.level === "green" ? "🟢"
    : health.level === "yellow" ? "🟡" : "🔴";
  const summary =
    health.level === "green" ? "All routes configured"
    : health.level === "yellow" ? "Some routes need printers"
    : "Invalid routes detected";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" /> Routing Health
        </CardTitle>
        <CardDescription>
          {loading ? "Loading printer profiles…" : `${profileCount} printer profile${profileCount === 1 ? "" : "s"} available`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${tone}`}>
          <span className="text-lg">{dot}</span>
          <span className="font-medium">{summary}</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Stat label="Configured" value={health.configured} tone="emerald" />
          <Stat label="Missing Printer" value={health.missing} tone="amber" />
          <Stat label="Disabled" value={health.disabled} tone="muted" />
          <Stat label="Errors" value={health.errors} tone="red" />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "red" | "muted" }) {
  const cls =
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "amber" ? "text-amber-600 dark:text-amber-400"
    : tone === "red" ? "text-red-600 dark:text-red-400"
    : "text-muted-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function BulkActionsCard({
  profiles, onAssignAll, onRestoreDefaults,
}: { profiles: ProfileLike[]; onAssignAll: (id: string) => void; onRestoreDefaults: () => void }) {
  const [bulkProfile, setBulkProfile] = useState<string>("");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5" /> Bulk Actions</CardTitle>
        <CardDescription>Apply the same printer to every document, or reset to defaults.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label>Assign Same Printer to All Documents</Label>
          <Select value={bulkProfile} onValueChange={setBulkProfile}>
            <SelectTrigger><SelectValue placeholder="Pick a printer profile…" /></SelectTrigger>
            <SelectContent>
              {profiles.length === 0
                ? <SelectItem value="__none" disabled>No profiles available</SelectItem>
                : profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => bulkProfile && onAssignAll(bulkProfile)}
          disabled={!bulkProfile}
        >
          Apply to All
        </Button>
        <Button variant="outline" onClick={onRestoreDefaults}>
          <RotateCcw className="h-4 w-4 mr-1" /> Restore Defaults
        </Button>
      </CardContent>
    </Card>
  );
}

function RouteRow({
  docId, docLabel, route, profiles, allRoutes, onChange, onReset, onCopyFrom, onTest, testing,
}: {
  docId: string;
  docLabel: string;
  route: DocumentRoute;
  profiles: ProfileLike[];
  allRoutes: RoutingMap;
  onChange: (p: Partial<DocumentRoute>) => void;
  onReset: () => void;
  onCopyFrom: (sourceDocId: string) => void;
  onTest: () => void;
  testing: boolean;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const issues = validateRoute(route, profiles);
  const hasError = issues.some((i) => i.level === "error");
  const hasWarn = !hasError && issues.length > 0;
  const otherConfigured = Object.keys(allRoutes).filter((k) => k !== docId && allRoutes[k]?.profileId);

  return (
    <div className={`rounded-lg border p-3 transition ${hasError ? "border-red-500/50" : hasWarn ? "border-amber-500/40" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusIndicator route={route} hasError={hasError} hasWarn={hasWarn} />
          <span className="font-medium">{docLabel}</span>
          {!route.enabled && <Badge variant="outline">Disabled</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => setCopyOpen((v) => !v)}>
                <Copy className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy from another route</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" onClick={onReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset route</TooltipContent>
          </Tooltip>
          <Button size="sm" onClick={onTest} disabled={testing}>
            <Send className="h-4 w-4 mr-1" /> {testing ? "Sending…" : "Test"}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
        <Field label="Printer Profile" className="lg:col-span-2">
          <Select
            value={route.profileId ?? "__none"}
            onValueChange={(v) => onChange({ profileId: v === "__none" ? null : v })}
          >
            <SelectTrigger><SelectValue placeholder="— Use Store Default —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— Use Store Default —</SelectItem>
              {profiles.map((p) => {
                const ex = parseProfileNotes(p.notes);
                const disabled = ex.enabled === false;
                return (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.is_default ? " ★" : ""}{disabled ? " (disabled)" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Engine">
          <Select value={route.engine} onValueChange={(v) => onChange({ engine: v as RouteEngine })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENGINE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Paper">
          <Select value={route.paperWidth} onValueChange={(v) => onChange({ paperWidth: v as RoutePaper })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAPER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Copies">
          <Input
            type="number" min={0} max={20}
            value={route.copies}
            onChange={(e) => onChange({ copies: Math.max(0, Number(e.target.value) || 0) })}
            placeholder="Inherit"
          />
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <ToggleRow label="Auto Print" checked={route.autoPrint} onChange={(v) => onChange({ autoPrint: v })} />
          <ToggleRow label="Enabled" checked={route.enabled} onChange={(v) => onChange({ enabled: v })} />
        </div>
      </div>

      {issues.length > 0 && (
        <div className="mt-2 space-y-1">
          {issues.map((i, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2 text-xs ${i.level === "error" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
            >
              {i.level === "error" ? <ShieldAlert className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {i.message}
            </div>
          ))}
        </div>
      )}

      {copyOpen && (
        <div className="mt-3 flex items-center gap-2 rounded-md border bg-muted/40 p-2">
          <Label className="text-xs">Copy from:</Label>
          <Select onValueChange={(v) => { onCopyFrom(v); setCopyOpen(false); }}>
            <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Pick a configured route…" /></SelectTrigger>
            <SelectContent>
              {otherConfigured.length === 0
                ? <SelectItem value="__none" disabled>No other routes configured</SelectItem>
                : otherConfigured.map((k) => {
                  const def = DOCUMENT_TYPES.find((d) => d.id === k);
                  return <SelectItem key={k} value={k}>{def?.label ?? k}</SelectItem>;
                })}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setCopyOpen(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ route, hasError, hasWarn }: { route: DocumentRoute; hasError: boolean; hasWarn: boolean }) {
  if (!route.enabled) return <XCircle className="h-4 w-4 text-muted-foreground" />;
  if (hasError) return <ShieldAlert className="h-4 w-4 text-red-500" />;
  if (hasWarn) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-2 py-1">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function PreviewCard({ routes, profiles }: { routes: RoutingMap; profiles: ProfileLike[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Routing Preview</CardTitle>
        <CardDescription>Live summary of effective routing for every document.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Printer</TableHead>
                <TableHead>Engine</TableHead>
                <TableHead>Paper</TableHead>
                <TableHead>Copies</TableHead>
                <TableHead>Auto</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DOCUMENT_TYPES.map((doc) => {
                const route = routes[doc.id] ?? { ...DEFAULT_ROUTE };
                const resolved = resolveRoute(doc.id, routes, profiles);
                const issues = validateRoute(route, profiles);
                const hasError = issues.some((i) => i.level === "error");
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.label}</TableCell>
                    <TableCell>
                      {resolved.profile?.name ?? <span className="text-muted-foreground">Chrome Fallback</span>}
                      {resolved.source !== "route" && (
                        <span className="ml-1 text-xs text-muted-foreground">({resolved.source})</span>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline">{resolved.engine}</Badge></TableCell>
                    <TableCell>{resolved.paperWidth}</TableCell>
                    <TableCell>{resolved.copies}</TableCell>
                    <TableCell>{route.autoPrint ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      {!route.enabled ? <Badge variant="outline">Disabled</Badge>
                        : hasError ? <Badge variant="destructive">Invalid</Badge>
                        : issues.length > 0 ? <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" variant="outline">Warning</Badge>
                        : <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" variant="outline">OK</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}

// Wrap RoutingManager in TooltipProvider for the inline tooltips.
export default function RoutingManagerProvider(props: { tenantId: string | null }) {
  return (
    <TooltipProvider delayDuration={150}>
      <RoutingManager {...props} />
    </TooltipProvider>
  );
}
