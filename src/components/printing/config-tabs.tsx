// Printing Configuration Center — additive UI for Receipt / Invoice / Barcode tabs.
// Reuses extras storage, printer profiles, and the existing PrintManager.
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download, Upload, RotateCcw, Send, AlertTriangle, CheckCircle2, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  loadExtras, saveExtras, resetTab, DEFAULT_EXTRAS,
  type PrintingExtras, type ReceiptPrefs, type InvoicePrefs, type BarcodePrefs,
} from "@/lib/printing/extras";
import { print, buildZplLabel, usePrinterProfiles } from "@/lib/printing";

/* ---------------- shared helpers ---------------- */
function useExtras(tenantId: string | null) {
  const [extras, setExtras] = useState<PrintingExtras>(() => loadExtras(tenantId));
  const patch = <K extends keyof PrintingExtras>(k: K, v: Partial<PrintingExtras[K]>) => {
    setExtras((prev) => {
      const next = { ...prev, [k]: { ...prev[k], ...v } } as PrintingExtras;
      saveExtras(next, tenantId);
      return next;
    });
  };
  const replace = (next: PrintingExtras) => { setExtras(next); saveExtras(next, tenantId); };
  return { extras, patch, replace };
}

function ToggleGrid<T>({
  obj, fields, onChange, cols = 3,
}: {
  obj: T;
  fields: Array<[keyof T & string, string]>;
  onChange: (k: keyof T & string, v: boolean) => void;
  cols?: 2 | 3;
}) {
  return (
    <div className={`grid gap-2 ${cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
      {fields.map(([key, label]) => (
        <div key={key} className="flex items-center justify-between rounded-md border p-2">
          <Label className="text-sm">{label}</Label>
          <Switch checked={Boolean((obj as Record<string, unknown>)[key])} onCheckedChange={(v) => onChange(key, v)} />
        </div>
      ))}
    </div>
  );
}

function ActionBar({
  onReset, onExport, onImport, onTest, testLabel,
}: {
  onReset: () => void; onExport: () => void;
  onImport: (file: File) => void; onTest: () => void; testLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={onReset}><RotateCcw className="h-4 w-4 mr-1" /> Reset Tab</Button>
      <Button size="sm" variant="outline" onClick={onExport}><Download className="h-4 w-4 mr-1" /> Export</Button>
      <Button size="sm" variant="outline" onClick={() => ref.current?.click()}><Upload className="h-4 w-4 mr-1" /> Import</Button>
      <input ref={ref} type="file" accept="application/json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.currentTarget.value = ""; }} />
      <Button size="sm" onClick={onTest}><Send className="h-4 w-4 mr-1" /> {testLabel}</Button>
    </div>
  );
}

function ValidationList({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Configuration is valid.
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {errors.map((e, i) => (
        <div key={`e${i}`} className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {e}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w${i}`} className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" /> {w}
        </div>
      ))}
    </div>
  );
}

function readJson(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => { try { resolve(JSON.parse(String(r.result))); } catch (e) { reject(e); } };
    r.readAsText(file);
  });
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* ============================= RECEIPT ============================= */
export function ReceiptConfigTab({ tenantId }: { tenantId: string | null }) {
  const { extras, patch, replace } = useExtras(tenantId);
  const r = extras.receipt;

  const widthMm = r.paperWidth === "custom" ? r.customWidth : parseInt(r.paperWidth, 10);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (r.paperWidth === "custom" && (!r.customWidth || r.customWidth < 20 || r.customWidth > 120))
    errors.push("Custom paper width must be between 20mm and 120mm.");
  if (r.copies < 1) errors.push("Copies must be at least 1.");
  if ([r.leftMargin, r.rightMargin, r.topMargin, r.bottomMargin].some((m) => m < 0))
    errors.push("Margins cannot be negative.");
  if (r.fontSize < 8 || r.fontSize > 24) warnings.push("Font size outside the recommended 8–24px range.");

  const onTest = async () => {
    if (errors.length) { toast.error("Fix validation errors first."); return; }
    const html = receiptPreviewHtml(r, widthMm);
    const res = await print({ kind: "thermal-receipt", payload: html, paperWidth: r.paperWidth === "custom" ? "80mm" : r.paperWidth });
    if (res.ok) toast.success(`Test receipt sent via ${res.engine}`); else toast.error(res.error ?? "Test failed");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Receipt Settings</CardTitle>
          <CardDescription>Thermal receipt layout, content, and printer behavior.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Paper Width</Label>
            <Select value={r.paperWidth} onValueChange={(v) => patch("receipt", { paperWidth: v as ReceiptPrefs["paperWidth"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="38mm">38 mm</SelectItem>
                <SelectItem value="58mm">58 mm</SelectItem>
                <SelectItem value="80mm">80 mm</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {r.paperWidth === "custom" && (
            <div className="space-y-1.5">
              <Label>Custom Width (mm)</Label>
              <Input type="number" value={r.customWidth} onChange={(e) => patch("receipt", { customWidth: Number(e.target.value) })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Receipt Layout</Label>
            <Select value={r.layout} onValueChange={(v) => patch("receipt", { layout: v as ReceiptPrefs["layout"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Character Set</Label>
            <Select value={r.characterSet} onValueChange={(v) => patch("receipt", { characterSet: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UTF-8">UTF-8</SelectItem>
                <SelectItem value="CP437">CP437</SelectItem>
                <SelectItem value="CP850">CP850</SelectItem>
                <SelectItem value="CP1252">CP1252</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5"><Label>Print Copies</Label><Input type="number" min={1} value={r.copies} onChange={(e) => patch("receipt", { copies: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Font Size (px)</Label><Input type="number" value={r.fontSize} onChange={(e) => patch("receipt", { fontSize: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Line Height</Label><Input type="number" step="0.1" value={r.lineHeight} onChange={(e) => patch("receipt", { lineHeight: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Left Margin (mm)</Label><Input type="number" min={0} value={r.leftMargin} onChange={(e) => patch("receipt", { leftMargin: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Right Margin (mm)</Label><Input type="number" min={0} value={r.rightMargin} onChange={(e) => patch("receipt", { rightMargin: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Top Margin (mm)</Label><Input type="number" min={0} value={r.topMargin} onChange={(e) => patch("receipt", { topMargin: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Bottom Margin (mm)</Label><Input type="number" min={0} value={r.bottomMargin} onChange={(e) => patch("receipt", { bottomMargin: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Feed Before Print (lines)</Label><Input type="number" min={0} value={r.feedBefore} onChange={(e) => patch("receipt", { feedBefore: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Feed After Print (lines)</Label><Input type="number" min={0} value={r.feedAfter} onChange={(e) => patch("receipt", { feedAfter: Number(e.target.value) })} /></div>

          <div className="col-span-full space-y-1.5">
            <Label>Footer Message</Label>
            <Textarea rows={2} value={r.footerMessage} onChange={(e) => patch("receipt", { footerMessage: e.target.value })} />
          </div>
          <div className="col-span-full space-y-1.5">
            <Label>Thank You Message</Label>
            <Input value={r.thankYouMessage} onChange={(e) => patch("receipt", { thankYouMessage: e.target.value })} />
          </div>

          <div className="col-span-full pt-2">
            <Label className="mb-2 block">Show / Hide Sections</Label>
            <ToggleGrid<ReceiptPrefs>
              obj={r}
              onChange={(k, v) => patch("receipt", { [k]: v } as Partial<ReceiptPrefs>)}
              fields={[
                ["showLogo", "Store Logo"], ["showAddress", "Store Address"], ["showPhone", "Phone"],
                ["showBin", "BIN / VAT"], ["showCustomerName", "Customer Name"], ["showCustomerPhone", "Customer Phone"],
                ["showSalesperson", "Salesperson"], ["showCashier", "Cashier"], ["showPaymentMethod", "Payment Method"],
                ["showDiscount", "Discount"], ["showVat", "VAT"], ["showDue", "Due"],
                ["showQR", "QR Code"], ["showBarcode", "Barcode"], ["showFooter", "Footer Message"],
                ["showThankYou", "Thank You Message"], ["autoCut", "Auto Cut"], ["openDrawer", "Open Drawer"],
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Live Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="mx-auto border bg-white text-black shadow-inner" style={{ width: `${widthMm}mm`, padding: `${r.topMargin}mm ${r.rightMargin}mm ${r.bottomMargin}mm ${r.leftMargin}mm`, fontSize: `${r.fontSize}px`, lineHeight: r.lineHeight }}>
            <ReceiptPreview r={r} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Validation</CardTitle></CardHeader>
        <CardContent><ValidationList errors={errors} warnings={warnings} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Summary & Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{r.paperWidth === "custom" ? `${r.customWidth}mm` : r.paperWidth}</Badge>
            <Badge variant="outline">{r.layout}</Badge>
            <Badge variant="outline">{r.copies} copy</Badge>
            {r.showLogo && <Badge>Logo</Badge>}
            {r.showQR && <Badge>QR</Badge>}
            {r.showBarcode && <Badge>Barcode</Badge>}
            {r.autoCut && <Badge>Auto-Cut</Badge>}
          </div>
          <ActionBar
            testLabel="Test Receipt"
            onTest={onTest}
            onReset={() => { replace(resetTab(tenantId, "receipt")); toast.success("Receipt defaults restored"); }}
            onExport={() => downloadJson(`receipt-config-${Date.now()}.json`, r)}
            onImport={async (f) => {
              try {
                const json = await readJson(f) as Partial<ReceiptPrefs>;
                patch("receipt", { ...DEFAULT_EXTRAS.receipt, ...json });
                toast.success("Receipt configuration imported");
              } catch { toast.error("Invalid JSON file"); }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ReceiptPreview({ r }: { r: ReceiptPrefs }) {
  const lines = r.layout === "detailed" ? 4 : r.layout === "compact" ? 1 : 2;
  return (
    <div className="text-center space-y-1">
      {r.showLogo && <div className="font-bold">[ LOGO ]</div>}
      <div className="font-bold text-base">SohojPharma Store</div>
      {r.showAddress && <div>123 Main Road, Dhaka</div>}
      {r.showPhone && <div>Phone: 01700-000000</div>}
      {r.showBin && <div>BIN: 1234567890</div>}
      <div className="border-t border-dashed my-1" />
      <div className="text-left space-y-0.5">
        {r.showCustomerName && <div>Customer: John Doe</div>}
        {r.showCustomerPhone && <div>Phone: 01800-111111</div>}
        {r.showSalesperson && <div>Salesperson: Alice</div>}
        {r.showCashier && <div>Cashier: Bob</div>}
        <div>Invoice #INV-001</div>
      </div>
      <div className="border-t border-dashed my-1" />
      <div className="text-left">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex justify-between"><span>Item {i + 1}</span><span>৳ {(100 + i * 25).toFixed(2)}</span></div>
        ))}
      </div>
      <div className="border-t border-dashed my-1" />
      <div className="text-left space-y-0.5">
        {r.showDiscount && <div className="flex justify-between"><span>Discount</span><span>৳ 10.00</span></div>}
        {r.showVat && <div className="flex justify-between"><span>VAT</span><span>৳ 15.00</span></div>}
        <div className="flex justify-between font-bold"><span>Total</span><span>৳ {(100 * lines + 15 - 10).toFixed(2)}</span></div>
        {r.showPaymentMethod && <div className="flex justify-between"><span>Paid (Cash)</span><span>৳ 150.00</span></div>}
        {r.showDue && <div className="flex justify-between"><span>Due</span><span>৳ 0.00</span></div>}
      </div>
      <div className="border-t border-dashed my-1" />
      {r.showQR && <div>[ QR CODE ]</div>}
      {r.showBarcode && <div>‖‖‖ ‖ ‖‖‖ ‖‖ ‖</div>}
      {r.showFooter && <div className="text-left whitespace-pre-line">{r.footerMessage}</div>}
      {r.showThankYou && <div className="font-medium">{r.thankYouMessage}</div>}
    </div>
  );
}

function receiptPreviewHtml(r: ReceiptPrefs, widthMm: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  body { width: ${widthMm}mm; margin: 0; padding: ${r.topMargin}mm ${r.rightMargin}mm ${r.bottomMargin}mm ${r.leftMargin}mm;
    font-family: monospace; font-size: ${r.fontSize}px; line-height: ${r.lineHeight}; }
  .c { text-align: center; } .b { font-weight: bold; } .hr { border-top: 1px dashed #000; margin: 4px 0; }
  </style></head><body>
  ${r.showLogo ? '<div class="c b">[ LOGO ]</div>' : ""}
  <div class="c b">SohojPharma Store</div>
  ${r.showAddress ? '<div class="c">123 Main Road</div>' : ""}
  <div class="hr"></div>
  <div>Test Receipt — preview from Settings</div>
  <div class="hr"></div>
  ${r.showFooter ? `<div>${r.footerMessage}</div>` : ""}
  ${r.showThankYou ? `<div class="c b">${r.thankYouMessage}</div>` : ""}
  </body></html>`;
}

/* ============================= INVOICE ============================= */
export function InvoiceConfigTab({ tenantId }: { tenantId: string | null }) {
  const { extras, patch, replace } = useExtras(tenantId);
  const i = extras.invoice;

  const errors: string[] = [];
  const warnings: string[] = [];
  if (i.copies < 1) errors.push("Copies must be at least 1.");
  if ([i.marginTop, i.marginBottom, i.marginLeft, i.marginRight].some((m) => m < 0))
    errors.push("Margins cannot be negative.");
  if (i.headerHeight < 0 || i.footerHeight < 0) errors.push("Header / footer height cannot be negative.");
  if (i.silent && i.engine !== "qz") warnings.push("Silent printing requires the QZ engine.");

  const onTest = async () => {
    if (errors.length) { toast.error("Fix validation errors first."); return; }
    const html = invoicePreviewHtml(i);
    const isThermal = i.paper === "thermal" || i.paper === "38mm" || i.paper === "58mm" || i.paper === "80mm";
    const res = await print({
      kind: isThermal ? "thermal-receipt" : "a4-invoice",
      payload: html,
      paperWidth: i.paper === "38mm" ? "38mm" : i.paper === "58mm" ? "58mm" : i.paper === "80mm" ? "80mm" : undefined,
    });
    if (res.ok) toast.success(`Test invoice sent via ${res.engine}`); else toast.error(res.error ?? "Test failed");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Invoice Settings</CardTitle><CardDescription>Engine, paper, margins, and content visibility.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Engine</Label>
            <Select value={i.engine} onValueChange={(v) => patch("invoice", { engine: v as InvoicePrefs["engine"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chrome">Chrome</SelectItem>
                <SelectItem value="qz">QZ Tray</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Paper Type</Label>
            <Select value={i.paper} onValueChange={(v) => patch("invoice", { paper: v as InvoicePrefs["paper"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="A5">A5</SelectItem>
                <SelectItem value="38mm">38 mm Thermal</SelectItem>
                <SelectItem value="58mm">58 mm Thermal</SelectItem>
                <SelectItem value="80mm">80 mm Thermal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Orientation</Label>
            <Select value={i.orientation} onValueChange={(v) => patch("invoice", { orientation: v as InvoicePrefs["orientation"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Copies</Label><Input type="number" min={1} value={i.copies} onChange={(e) => patch("invoice", { copies: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Margin Top (mm)</Label><Input type="number" min={0} value={i.marginTop} onChange={(e) => patch("invoice", { marginTop: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Margin Bottom (mm)</Label><Input type="number" min={0} value={i.marginBottom} onChange={(e) => patch("invoice", { marginBottom: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Margin Left (mm)</Label><Input type="number" min={0} value={i.marginLeft} onChange={(e) => patch("invoice", { marginLeft: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Margin Right (mm)</Label><Input type="number" min={0} value={i.marginRight} onChange={(e) => patch("invoice", { marginRight: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Header Height (mm)</Label><Input type="number" min={0} value={i.headerHeight} onChange={(e) => patch("invoice", { headerHeight: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Footer Height (mm)</Label><Input type="number" min={0} value={i.footerHeight} onChange={(e) => patch("invoice", { footerHeight: Number(e.target.value) })} /></div>

          <div className="col-span-full pt-2">
            <Label className="mb-2 block">Show / Hide</Label>
            <ToggleGrid<InvoicePrefs>
              obj={i}
              onChange={(k, v) => patch("invoice", { [k]: v } as Partial<InvoicePrefs>)}
              fields={[
                ["showLogo", "Logo"], ["showSignature", "Signature"],
                ["showQR", "QR Code"], ["showBarcode", "Barcode"],
                ["showTerms", "Terms & Conditions"], ["showSeal", "Company Seal"],
              ]}
            />
          </div>
          <div className="col-span-full grid gap-2 md:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border p-2"><Label className="text-sm">Silent Print (QZ only)</Label><Switch checked={i.silent} onCheckedChange={(v) => patch("invoice", { silent: v })} /></div>
            <div className="flex items-center justify-between rounded-md border p-2"><Label className="text-sm">Auto Print After Sale</Label><Switch checked={i.autoPrintAfterSale} onCheckedChange={(v) => patch("invoice", { autoPrintAfterSale: v })} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Live Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="mx-auto border bg-white text-black shadow-inner aspect-[1/1.414] overflow-hidden"
               style={{ maxWidth: i.orientation === "portrait" ? 360 : 500, padding: `${i.marginTop}mm ${i.marginRight}mm ${i.marginBottom}mm ${i.marginLeft}mm` }}>
            <InvoicePreview i={i} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Validation</CardTitle></CardHeader>
        <CardContent><ValidationList errors={errors} warnings={warnings} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Summary & Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{i.paper}</Badge>
            <Badge variant="outline">{i.orientation}</Badge>
            <Badge variant="outline">{i.engine}</Badge>
            <Badge variant="outline">{i.copies} copy</Badge>
            {i.silent && <Badge>Silent</Badge>}
            {i.autoPrintAfterSale && <Badge>Auto-Print</Badge>}
          </div>
          <ActionBar
            testLabel="Test Invoice"
            onTest={onTest}
            onReset={() => { replace(resetTab(tenantId, "invoice")); toast.success("Invoice defaults restored"); }}
            onExport={() => downloadJson(`invoice-config-${Date.now()}.json`, i)}
            onImport={async (f) => {
              try {
                const json = await readJson(f) as Partial<InvoicePrefs>;
                patch("invoice", { ...DEFAULT_EXTRAS.invoice, ...json });
                toast.success("Invoice configuration imported");
              } catch { toast.error("Invalid JSON file"); }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InvoicePreview({ i }: { i: InvoicePrefs }) {
  return (
    <div className="text-xs space-y-2">
      <div className="flex items-center justify-between" style={{ minHeight: `${i.headerHeight}mm` }}>
        <div>{i.showLogo && <div className="font-bold text-sm">[ LOGO ]</div>}<div className="font-bold">SohojPharma Store</div><div>Dhaka, Bangladesh</div></div>
        <div className="text-right"><div className="font-bold">INVOICE</div><div>#INV-00123</div><div>2026-06-25</div></div>
      </div>
      <div className="border-y py-1"><div><span className="font-semibold">Bill To:</span> John Doe</div></div>
      <table className="w-full text-[10px]"><thead><tr className="border-b"><th className="text-left">Item</th><th>Qty</th><th>Rate</th><th className="text-right">Total</th></tr></thead>
        <tbody>{["Napa 500mg", "Seclo 20mg", "Maxpro 20mg"].map((n, k) => (
          <tr key={k} className="border-b"><td>{n}</td><td className="text-center">{k + 1}</td><td className="text-center">25</td><td className="text-right">{(k + 1) * 25}</td></tr>
        ))}</tbody>
      </table>
      <div className="flex justify-end"><div className="text-right"><div>Subtotal: ৳150</div><div>VAT: ৳15</div><div className="font-bold">Total: ৳165</div></div></div>
      {i.showQR && <div>[ QR ]</div>}
      {i.showBarcode && <div>‖‖ ‖ ‖‖‖ ‖</div>}
      {i.showTerms && <div className="text-[9px] opacity-70">Terms: Goods once sold are not returnable.</div>}
      <div className="flex justify-between" style={{ minHeight: `${i.footerHeight}mm` }}>
        {i.showSeal && <div>[ SEAL ]</div>}
        {i.showSignature && <div className="ml-auto text-right">_______________<br />Authorized Signature</div>}
      </div>
    </div>
  );
}

function invoicePreviewHtml(i: InvoicePrefs): string {
  const sizeRule = i.paper === "A4" || i.paper === "A5"
    ? `@page { size: ${i.paper} ${i.orientation}; margin: ${i.marginTop}mm ${i.marginRight}mm ${i.marginBottom}mm ${i.marginLeft}mm; }`
    : `@page { size: ${i.paper.replace("mm", "")}mm auto; margin: 0; }`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${sizeRule}
  body { font-family: sans-serif; font-size: 12px; } h1 { font-size: 16px; }
  </style></head><body>
  <h1>SohojPharma — Test Invoice</h1>
  <p>Engine: ${i.engine} · Paper: ${i.paper} · ${i.orientation}</p>
  <p>This is a printing test from Settings → Invoice.</p>
  </body></html>`;
}

/* ============================= BARCODE ============================= */
export function BarcodeConfigTab({ tenantId }: { tenantId: string | null }) {
  const { extras, patch, replace } = useExtras(tenantId);
  const b = extras.barcode;
  const profiles = usePrinterProfiles({ tenantId });
  const profileList = (profiles.items ?? []) as Array<Record<string, unknown>>;

  const [w, h] = b.labelSize === "custom"
    ? [b.customW, b.customH]
    : b.labelSize.split("x").map(Number) as [number, number];

  const errors: string[] = [];
  const warnings: string[] = [];
  if (b.labelSize === "custom" && (b.customW < 10 || b.customH < 10))
    errors.push("Custom label must be at least 10×10 mm.");
  if (b.copies < 1) errors.push("Print copies must be at least 1.");
  if (!b.profileId) warnings.push("No printer profile assigned — system default will be used.");

  const onTest = async () => {
    if (errors.length) { toast.error("Fix validation errors first."); return; }
    const zpl = buildZplLabel({ text: b.showName ? "SohojPharma Test" : "TEST", barcode: "1234567890" });
    const res = await print({ kind: "barcode", payload: zpl });
    if (res.ok) toast.success(`Test label sent via ${res.engine}`); else toast.error(res.error ?? "Test failed");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Barcode Settings</CardTitle><CardDescription>Label printer, format, and content.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Printer Profile</Label>
            <Select value={b.profileId ?? "__none"} onValueChange={(v) => patch("barcode", { profileId: v === "__none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="System default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— System default —</SelectItem>
                {profileList.map((p) => {
                  const id = String(p.id ?? "");
                  const name = String(p.name ?? p.printer_name ?? id);
                  return <SelectItem key={id} value={id}>{name}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Driver</Label>
            <Select value={b.driver} onValueChange={(v) => patch("barcode", { driver: v as BarcodePrefs["driver"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Auto">Auto-detect</SelectItem>
                <SelectItem value="ZPL">ZPL</SelectItem>
                <SelectItem value="ESCPOS">ESC/POS</SelectItem>
                <SelectItem value="RAW">RAW</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Paper Width</Label>
            <Select value={b.paperWidth} onValueChange={(v) => patch("barcode", { paperWidth: v as BarcodePrefs["paperWidth"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="38mm">38 mm</SelectItem>
                <SelectItem value="58mm">58 mm</SelectItem>
                <SelectItem value="80mm">80 mm</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Label Size</Label>
            <Select value={b.labelSize} onValueChange={(v) => patch("barcode", { labelSize: v as BarcodePrefs["labelSize"] })}>
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
          {b.labelSize === "custom" && (<>
            <div className="space-y-1.5"><Label>Width (mm)</Label><Input type="number" value={b.customW} onChange={(e) => patch("barcode", { customW: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Height (mm)</Label><Input type="number" value={b.customH} onChange={(e) => patch("barcode", { customH: Number(e.target.value) })} /></div>
          </>)}
          <div className="space-y-1.5"><Label>Barcode Type</Label>
            <Select value={b.type} onValueChange={(v) => patch("barcode", { type: v as BarcodePrefs["type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Code128">Code128</SelectItem>
                <SelectItem value="Code39">Code39</SelectItem>
                <SelectItem value="EAN13">EAN13</SelectItem>
                <SelectItem value="EAN8">EAN8</SelectItem>
                <SelectItem value="QR">QR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Rotation</Label>
            <Select value={b.rotation} onValueChange={(v) => patch("barcode", { rotation: v as BarcodePrefs["rotation"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Text Position</Label>
            <Select value={b.textPosition} onValueChange={(v) => patch("barcode", { textPosition: v as BarcodePrefs["textPosition"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Top</SelectItem>
                <SelectItem value="bottom">Bottom</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Print Copies</Label><Input type="number" min={1} value={b.copies} onChange={(e) => patch("barcode", { copies: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Barcode Height</Label><Input type="number" value={b.barcodeHeight} onChange={(e) => patch("barcode", { barcodeHeight: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Barcode Width</Label><Input type="number" value={b.barcodeWidth} onChange={(e) => patch("barcode", { barcodeWidth: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Font</Label><Input value={b.font} onChange={(e) => patch("barcode", { font: e.target.value })} /></div>

          <div className="col-span-full pt-2">
            <Label className="mb-2 block">Label Content</Label>
            <ToggleGrid<BarcodePrefs>
              obj={b}
              onChange={(k, v) => patch("barcode", { [k]: v } as Partial<BarcodePrefs>)}
              fields={[
                ["showName", "Medicine Name"], ["showGeneric", "Generic"], ["showStrength", "Strength"],
                ["showCompany", "Company"], ["showMrp", "MRP"], ["showBatch", "Batch"],
                ["showExpiry", "Expiry"], ["showSku", "SKU"], ["showBarcode", "Barcode"],
                ["showQR", "QR Code"], ["showLogo", "Store Logo"],
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Live Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="mx-auto rounded border bg-white text-black p-1 text-[9px] leading-tight text-center"
               style={{ width: `${(b.rotation === "landscape" ? h : w) * 4}px`, height: `${(b.rotation === "landscape" ? w : h) * 4}px` }}>
            {b.showLogo && <div>[LOGO]</div>}
            {b.showName && <div className="font-bold">Napa 500mg</div>}
            {b.showGeneric && <div>Paracetamol</div>}
            {b.showStrength && <div>500 mg</div>}
            {b.showCompany && <div>Beximco</div>}
            {b.showMrp && <div>MRP ৳ 12.00</div>}
            {b.showBatch && <div>B: A12</div>}
            {b.showExpiry && <div>Exp: 12/27</div>}
            {b.showSku && <div>SKU: NAP500</div>}
            {b.textPosition === "top" && <div>1234567890</div>}
            {b.showBarcode && <div className="font-mono">‖‖ ‖ ‖‖‖ ‖‖ ‖ ‖</div>}
            {b.showQR && <div>[QR]</div>}
            {b.textPosition === "bottom" && <div>1234567890</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Validation</CardTitle></CardHeader>
        <CardContent><ValidationList errors={errors} warnings={warnings} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Summary & Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{b.driver === "Auto" ? b.engine : b.driver}</Badge>
            <Badge variant="outline">{b.labelSize === "custom" ? `${b.customW}×${b.customH}` : b.labelSize}</Badge>
            <Badge variant="outline">{b.type}</Badge>
            <Badge variant="outline">{b.copies} copy</Badge>
            {b.profileId && <Badge>Profile assigned</Badge>}
            {b.showQR && <Badge>QR</Badge>}
          </div>
          <ActionBar
            testLabel="Test Barcode"
            onTest={onTest}
            onReset={() => { replace(resetTab(tenantId, "barcode")); toast.success("Barcode defaults restored"); }}
            onExport={() => downloadJson(`barcode-config-${Date.now()}.json`, b)}
            onImport={async (f) => {
              try {
                const json = await readJson(f) as Partial<BarcodePrefs>;
                patch("barcode", { ...DEFAULT_EXTRAS.barcode, ...json });
                toast.success("Barcode configuration imported");
              } catch { toast.error("Invalid JSON file"); }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
