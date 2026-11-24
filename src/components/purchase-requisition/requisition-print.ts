// Purchase Requisition print — A4 and thermal are completely separate paths.
// Thermal uses the POS PrintManager/QZ receipt engine and never renders the A4 template.

export type PrintRequisitionInput = {
  companyName: string;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyLogoUrl?: string | null;

  prNumber: string;
  requisitionDate: string;
  expectedDate?: string | null;
  supplierName?: string | null;
  supplierIsDefault?: boolean;
  warehouseName?: string | null;
  requestedByName?: string | null;
  remarks?: string | null;

  paper?: "A4" | "58mm" | "auto";
  tenantId?: string | null;

  items: Array<{
    product_name: string;
    sku?: string | null;
    unit?: string | null;
    requested_qty: number;
    remarks?: string | null;
    strength?: string | null;
    volume?: string | null;
  }>;
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// ─────────────────────────────── A4 (unchanged) ───────────────────────────────
export function buildRequisitionHtml(d: PrintRequisitionInput): string {
  const rows = d.items.map((it, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.product_name)}</td>
      <td>${esc(it.sku ?? "")}</td>
      <td class="c">${esc(it.unit ?? "")}</td>
      <td class="r">${Number(it.requested_qty).toLocaleString(undefined,{maximumFractionDigits:3})}</td>
      <td>${esc(it.remarks ?? "")}</td>
    </tr>`).join("");

  const logo = d.companyLogoUrl
    ? `<img src="${esc(d.companyLogoUrl)}" alt="logo" style="max-height:60px;max-width:140px;object-fit:contain" />`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(d.prNumber)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.4 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#111; margin:0; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; }
  .hdr .co h1 { margin:0 0 4px; font-size:18px; }
  .hdr .co p { margin:1px 0; font-size:11px; color:#444; }
  .title { text-align:center; font-size:16px; font-weight:700; letter-spacing:1px; text-transform:uppercase; margin:6px 0 12px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; margin-bottom:12px; font-size:12px; }
  .meta div { display:flex; }
  .meta .k { min-width:110px; color:#555; }
  .meta .v { font-weight:600; }
  table { width:100%; border-collapse:collapse; margin-top:6px; }
  th, td { border:1px solid #333; padding:6px 8px; font-size:11.5px; vertical-align:top; }
  th { background:#f2f4f7; text-align:left; }
  td.c { text-align:center; } td.r { text-align:right; }
  .rem { margin-top:12px; padding:8px 10px; border:1px dashed #999; font-size:11px; }
  .sign { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; margin-top:48px; text-align:center; font-size:11.5px; }
  .sign div { border-top:1px solid #333; padding-top:6px; }
  .default-badge { display:inline-block; margin-left:6px; padding:1px 6px; font-size:10px; background:#e5f4ee; color:#046c4e; border-radius:10px; font-weight:600; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body>
  <div class="hdr">
    <div class="co">
      <h1>${esc(d.companyName)}</h1>
      ${d.companyAddress ? `<p>${esc(d.companyAddress)}</p>` : ""}
      ${d.companyPhone ? `<p>Phone: ${esc(d.companyPhone)}</p>` : ""}
      ${d.companyEmail ? `<p>Email: ${esc(d.companyEmail)}</p>` : ""}
    </div>
    <div>${logo}</div>
  </div>

  <div class="title">Purchase Requisition</div>

  <div class="meta">
    <div><span class="k">Requisition No:</span><span class="v">${esc(d.prNumber)}</span></div>
    <div><span class="k">Date:</span><span class="v">${esc(d.requisitionDate)}</span></div>
    <div><span class="k">Supplier:</span><span class="v">${esc(d.supplierName ?? "—")}${d.supplierIsDefault ? '<span class="default-badge">Default</span>' : ""}</span></div>
    <div><span class="k">Expected:</span><span class="v">${esc(d.expectedDate ?? "—")}</span></div>
    <div><span class="k">Warehouse:</span><span class="v">${esc(d.warehouseName ?? "—")}</span></div>
    <div><span class="k">Requested By:</span><span class="v">${esc(d.requestedByName ?? "—")}</span></div>
  </div>

  <table>
    <thead><tr>
      <th style="width:30px" class="c">#</th>
      <th>Product</th>
      <th style="width:110px">SKU</th>
      <th style="width:60px" class="c">Unit</th>
      <th style="width:90px" class="r">Req. Qty</th>
      <th style="width:180px">Remarks</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="6" class="c">No items</td></tr>`}</tbody>
  </table>

  ${d.remarks ? `<div class="rem"><b>Remarks:</b> ${esc(d.remarks)}</div>` : ""}

  <div class="sign">
    <div>Prepared By</div>
    <div>Checked By</div>
    <div>Approved By</div>
  </div>
</body></html>`;
}

// ───────────────────────── Dedicated 58mm Thermal Receipt ─────────────────────────
// POS-style receipt only — NO A4 header, NO table, NO prices, NO remarks/signature table.
export function buildRequisitionThermal58Markup(d: PrintRequisitionInput): string {
  const totalItems = d.items.length;
  const totalQty = d.items.reduce((s, it) => s + (Number(it.requested_qty) || 0), 0);

  const itemBlocks = d.items.map((it) => {
    const strength = it.strength && String(it.strength).trim() ? `<div class="muted-line">${esc(it.strength)}</div>` : "";
    const volume = it.volume && String(it.volume).trim() ? `<div class="muted-line">${esc(it.volume)}</div>` : "";
    const qty = Number(it.requested_qty).toLocaleString(undefined, { maximumFractionDigits: 3 });
    const unit = it.unit ? ` ${esc(it.unit)}` : "";
    return `
    <div class="sep">--------------------------------</div>
    <div class="item-block">
      <div class="product-name">${esc(it.product_name)}</div>
      ${strength}
      ${volume}
      <div class="qty-line">Qty : ${qty}${unit}</div>
    </div>
    `;
  }).join("");

  return `<style>
@page{
  size:58mm auto;
  margin:0;
}
.print-root{
  width:58mm;
  max-width:58mm;
  min-width:58mm;
  margin:0 auto;
  padding:2mm;
  box-sizing:border-box;
}
.print-root, .print-root *{box-sizing:border-box;}
.print-root{font-family:ui-monospace,"Courier New",monospace;font-size:11px;line-height:1.32;color:#000;background:#fff;overflow-wrap:anywhere;word-break:break-word;}
.shop-name{text-align:center;font-size:13px;font-weight:700;margin:0 0 2mm;}
.doc-title{text-align:center;font-size:12px;font-weight:700;margin:0 0 1mm;}
.sep{font-size:11px;line-height:1.1;white-space:pre;text-align:center;margin:1.5mm 0;}
.meta-row{display:flex;gap:1mm;font-size:10.5px;}
.meta-key{width:20mm;flex:0 0 20mm;}
.meta-val{flex:1;min-width:0;}
.item-block{padding:0.5mm 0;}
.product-name{font-size:12px;font-weight:800;margin-bottom:0.5mm;}
.muted-line{font-size:11px;margin:0.25mm 0;}
.qty-line{font-size:11.5px;font-weight:700;margin-top:0.75mm;}
.total-row{display:flex;gap:1mm;font-size:11px;font-weight:700;}
.total-key{width:20mm;flex:0 0 20mm;}
.prepared{font-size:11px;margin:3mm 0 1mm;}
.footer{text-align:center;font-size:10px;margin-top:1mm;}
@media print{html,body{margin:0!important;padding:0!important;width:58mm!important;background:#fff!important;}.print-root{width:58mm!important;max-width:58mm!important;min-width:58mm!important;margin:0 auto!important;padding:2mm!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
</style>
<div class="print-root" data-pr-thermal-receipt="58mm">
  <div class="shop-name">${esc(d.companyName || "New Joya Pharmacy")}</div>
  <div class="doc-title">Purchase Requisition</div>
  <div class="sep">--------------------------------</div>
  <div class="meta-row"><span class="meta-key">PR No</span><span>:</span><span class="meta-val">${esc(d.prNumber)}</span></div>
  <div class="meta-row"><span class="meta-key">Date</span><span>:</span><span class="meta-val">${esc(d.requisitionDate)}</span></div>
  <div class="meta-row"><span class="meta-key">Supplier</span><span>:</span><span class="meta-val">${esc(d.supplierName ?? "—")}</span></div>
  <div class="meta-row"><span class="meta-key">Warehouse</span><span>:</span><span class="meta-val">${esc(d.warehouseName ?? "—")}</span></div>
  <div class="meta-row"><span class="meta-key">Requested By</span><span>:</span><span class="meta-val">${esc(d.requestedByName ?? "—")}</span></div>
  ${itemBlocks || `<div class="sep">--------------------------------</div><div class="item-block">No items</div>`}
  <div class="sep">--------------------------------</div>
  <div class="total-row"><span class="total-key">Items</span><span>:</span><span>${totalItems}</span></div>
  <div class="total-row"><span class="total-key">Total Qty</span><span>:</span><span>${totalQty.toLocaleString(undefined,{maximumFractionDigits:3})}</span></div>
  <div class="sep">--------------------------------</div>
  <div class="prepared">Prepared By</div>
  <div class="sep">--------------------------------</div>
  <div class="footer">Generated by SohojPharma</div>
</div>`;
}

export function buildRequisitionThermal58Html(d: PrintRequisitionInput): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.prNumber)}</title></head><body>${buildRequisitionThermal58Markup(d)}</body></html>`;
}

function printInHiddenIframe(html: string, frameAttr: string) {
  document.querySelectorAll(`iframe[${frameAttr}="true"]`).forEach((n) => n.remove());
  const iframe = document.createElement("iframe");
  iframe.setAttribute(frameAttr, "true");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", opacity: "0",
  } as CSSStyleDeclaration);
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  let printed = false;
  iframe.addEventListener("load", () => {
    if (printed) return;
    printed = true;
    const w = iframe.contentWindow;
    if (!w) return;
    setTimeout(() => {
      try { w.focus(); w.print(); } catch { /* noop */ }
      setTimeout(() => iframe.parentNode?.removeChild(iframe), 1500);
    }, 100);
  });
}

function shouldUseThermal(paper: PrintRequisitionInput["paper"], tenantId?: string | null): boolean {
  if (paper === "58mm") return true;
  if (paper === "A4") return false;
  try {
    const raw = window.localStorage.getItem(tenantId ? `sohojpharma.printing.settings.${tenantId}` : "sohojpharma.printing.settings")
      ?? window.localStorage.getItem("sohojpharma.printing.settings");
    const settings = raw ? JSON.parse(raw) as { paperWidth?: string } : null;
    return settings?.paperWidth === "58mm";
  } catch {
    return false;
  }
}

export async function printRequisition(d: PrintRequisitionInput) {
  if (shouldUseThermal(d.paper, d.tenantId)) {
    const payload = buildRequisitionThermal58Markup(d);
    try {
      const { print } = await import("@/lib/printing/manager");
      const result = await print(
        { kind: "thermal-receipt", payload, paperWidth: "58mm" },
        { storeId: d.tenantId ?? null, silent: true },
      );
      if (result.ok) return;
    } catch {
      /* fall through to dedicated thermal iframe */
    }
    printInHiddenIframe(buildRequisitionThermal58Html(d), "data-pr-thermal-print-frame");
    return;
  }

  const html = buildRequisitionHtml(d);
  document.querySelectorAll('iframe[data-pr-print-frame="true"]').forEach((n) => n.remove());
  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-pr-print-frame", "true");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", opacity: "0",
  } as CSSStyleDeclaration);
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
  let printed = false;
  iframe.addEventListener("load", () => {
    if (printed) return;
    printed = true;
    const w = iframe.contentWindow;
    if (!w) return;
    setTimeout(() => {
      try { w.focus(); w.print(); } catch { /* noop */ }
      setTimeout(() => iframe.parentNode?.removeChild(iframe), 1500);
    }, 100);
  });
}
