// Thermal printer receipt + A4 invoice HTML templates.
// Pure string builders — no DOM, no React. Safe to import anywhere.
import { escapeHtml, safeMediaUrl } from "@/lib/security/html-escape";

export type PaperSize = "58mm" | "80mm" | "A4";

export interface ReceiptLine {
  name: string;
  qty: number;
  unit_price: number;
  discount?: number;
  vat?: number;
  line_total: number;
  batch_no?: string;
  expiry_date?: string | null;
}

export interface ReceiptPayment {
  method: string;
  amount: number;
  reference?: string | null;
}

export interface ReceiptData {
  // Header
  pharmacy_name: string;
  pharmacy_address?: string;
  pharmacy_phone?: string;
  pharmacy_vat_no?: string;
  logo_url?: string;
  signature_url?: string;
  show_signature?: boolean;
  // Invoice
  invoice_no: string;
  invoice_date: string; // ISO
  cashier_name?: string;
  customer_name?: string;
  customer_phone?: string;
  // Body
  items: ReceiptLine[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paid: number;
  due: number;
  payments: ReceiptPayment[];
  // Footer
  footer_note?: string;
}

const money = (n: number) => (n ?? 0).toFixed(2);
const esc = escapeHtml;
const safeImg = (src: unknown) => safeMediaUrl(src);

function thermalStyles(size: "58mm" | "80mm"): string {
  const width = size === "58mm" ? "58mm" : "80mm";
  const fontSize = size === "58mm" ? "10px" : "11px";
  const pad = size === "58mm" ? "2mm" : "3mm";
  return `
    @page { size: ${width} auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      width: ${width};
      padding: ${pad};
      font-family: 'Courier New', ui-monospace, monospace;
      font-size: ${fontSize};
      color: #000;
      line-height: 1.3;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: 700; }
    .hr { border-top: 1px dashed #000; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; gap: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 1px 0; vertical-align: top; font-size: ${fontSize}; }
    th { border-bottom: 1px dashed #000; text-align: left; }
    .col-qty { width: 14%; text-align: right; }
    .col-price { width: 22%; text-align: right; }
    .col-total { width: 24%; text-align: right; }
    h1 { font-size: ${size === "58mm" ? "13px" : "15px"}; margin: 0; }
    .small { font-size: ${size === "58mm" ? "9px" : "10px"}; }
    .logo { max-width: 40mm; max-height: 18mm; display: block; margin: 0 auto 2px; }
    .signature { margin-top: 10px; text-align: center; }
    .signature-line { display: flex; align-items: flex-end; justify-content: center; height: ${size === "58mm" ? "24px" : "30px"}; border-bottom: 1px dashed #000; }
    .signature img { max-height: ${size === "58mm" ? "22px" : "28px"}; max-width: ${size === "58mm" ? "42mm" : "55mm"}; object-fit: contain; }
  `;
}

function a4Styles(): string {
  return `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #111; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12mm; }
    .header h1 { margin: 0 0 4px; font-size: 22px; }
    .logo { max-width: 50mm; max-height: 20mm; }
    .meta { text-align: right; font-size: 11px; }
    .meta .big { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-bottom: 8mm; }
    .parties .box { border: 1px solid #ddd; padding: 4mm; border-radius: 4px; }
    .parties h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; color: #666; }
    table.items { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
    table.items th, table.items td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; font-size: 12px; }
    table.items th { background: #f6f7f9; font-weight: 600; }
    table.items td.num, table.items th.num { text-align: right; white-space: nowrap; }
    .totals { width: 70mm; margin-left: auto; }
    .totals .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #eee; }
    .totals .row.grand { font-weight: 700; font-size: 14px; border-bottom: 2px solid #111; border-top: 2px solid #111; padding: 8px 0; }
    .payments { margin-top: 6mm; }
    .footer { margin-top: 14mm; padding-top: 4mm; border-top: 1px solid #ddd; font-size: 10px; color: #666; text-align: center; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28mm; margin-top: 14mm; font-size: 11px; }
    .signatures .box { text-align: center; }
    .signature-line { display: flex; align-items: flex-end; justify-content: center; height: 44px; border-bottom: 1px solid #000; }
    .signature-line img { max-height: 40px; max-width: 100%; object-fit: contain; display: block; }
  `;
}

function thermalBody(d: ReceiptData, size: "58mm" | "80mm"): string {
  const colName = size === "58mm" ? 40 : 44;
  const safeLogo = safeImg(d.logo_url);
  const safeSig = safeImg(d.signature_url);
  return `
  <div class="center">
    ${safeLogo ? `<img class="logo" src="${esc(safeLogo)}" alt="" />` : ""}
    <h1>${esc(d.pharmacy_name)}</h1>
    ${d.pharmacy_address ? `<div class="small">${esc(d.pharmacy_address)}</div>` : ""}
    ${d.pharmacy_phone ? `<div class="small">Tel: ${esc(d.pharmacy_phone)}</div>` : ""}
    ${d.pharmacy_vat_no ? `<div class="small">VAT: ${esc(d.pharmacy_vat_no)}</div>` : ""}
  </div>
  <div class="hr"></div>
  <div class="row small"><span>Invoice</span><span class="bold">${esc(d.invoice_no)}</span></div>
  <div class="row small"><span>Date</span><span>${esc(new Date(d.invoice_date).toLocaleString())}</span></div>
  ${d.cashier_name ? `<div class="row small"><span>Cashier</span><span>${esc(d.cashier_name)}</span></div>` : ""}
  ${d.customer_name ? `<div class="row small"><span>Customer</span><span>${esc(d.customer_name)}</span></div>` : ""}
  <div class="hr"></div>
  <table>
    <thead><tr>
      <th style="width:${colName}%">Item</th>
      <th class="col-qty">Qty</th>
      <th class="col-price">Price</th>
      <th class="col-total">Total</th>
    </tr></thead>
    <tbody>
      ${d.items
        .map(
          (it) => `
        <tr>
          <td>${esc(it.name)}${it.batch_no ? `<div class="small">B:${esc(it.batch_no)}${it.expiry_date ? ` E:${esc(it.expiry_date)}` : ""}</div>` : ""}</td>
          <td class="col-qty">${it.qty}</td>
          <td class="col-price">${money(it.unit_price)}</td>
          <td class="col-total">${money(it.line_total)}</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>
  <div class="hr"></div>
  <div class="row"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
  ${d.discount ? `<div class="row"><span>Discount</span><span>-${money(d.discount)}</span></div>` : ""}
  ${d.vat ? `<div class="row"><span>VAT</span><span>${money(d.vat)}</span></div>` : ""}
  <div class="row bold"><span>TOTAL</span><span>${money(d.total)}</span></div>
  <div class="row"><span>Paid</span><span>${money(d.paid)}</span></div>
  ${d.due > 0 ? `<div class="row bold"><span>DUE</span><span>${money(d.due)}</span></div>` : ""}
  ${
    d.payments.length
      ? `<div class="hr"></div>${d.payments
          .map(
            (p) =>
              `<div class="row small"><span>${esc(p.method.toUpperCase())}${p.reference ? ` (${esc(p.reference)})` : ""}</span><span>${money(p.amount)}</span></div>`
          )
          .join("")}`
      : ""
  }
  <div class="hr"></div>
  <div class="center small">${esc(d.footer_note ?? "Thank you for your purchase")}</div>
  ${
    d.show_signature !== false
      ? `<div class="signature"><div class="signature-line">${safeSig ? `<img src="${esc(safeSig)}" alt="Authorized signature" />` : ""}</div><div class="small">Authorized Signature</div></div>`
      : ""
  }
  `;
}

function a4Body(d: ReceiptData): string {
  const safeLogo = safeImg(d.logo_url);
  const safeSig = safeImg(d.signature_url);
  return `
  <div class="header">
    <div>
      ${safeLogo ? `<img class="logo" src="${esc(safeLogo)}" alt="" />` : ""}
      <h1>${esc(d.pharmacy_name)}</h1>
      <div>${esc(d.pharmacy_address ?? "")}</div>
      <div>${d.pharmacy_phone ? `Tel: ${esc(d.pharmacy_phone)}` : ""}${
        d.pharmacy_vat_no ? `  &nbsp; VAT: ${esc(d.pharmacy_vat_no)}` : ""
      }</div>
    </div>
    <div class="meta">
      <div class="big">INVOICE</div>
      <div><strong>${esc(d.invoice_no)}</strong></div>
      <div>${esc(new Date(d.invoice_date).toLocaleString())}</div>
    </div>
  </div>
  <div class="parties">
    <div class="box">
      <h3>Billed To</h3>
      <div><strong>${esc(d.customer_name ?? "Walk-in Customer")}</strong></div>
      ${d.customer_phone ? `<div>${esc(d.customer_phone)}</div>` : ""}
    </div>
    <div class="box">
      <h3>Issued By</h3>
      <div>${esc(d.cashier_name ?? "—")}</div>
    </div>
  </div>
  <table class="items">
    <thead><tr>
      <th style="width:6%">#</th>
      <th>Item</th>
      <th>Batch / Exp</th>
      <th class="num">Qty</th>
      <th class="num">Unit Price</th>
      <th class="num">Disc</th>
      <th class="num">VAT</th>
      <th class="num">Total</th>
    </tr></thead>
    <tbody>
      ${d.items
        .map(
          (it, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${esc(it.name)}</td>
          <td>${esc(it.batch_no ?? "")}${it.expiry_date ? ` / ${esc(it.expiry_date)}` : ""}</td>
          <td class="num">${it.qty}</td>
          <td class="num">${money(it.unit_price)}</td>
          <td class="num">${money(it.discount ?? 0)}</td>
          <td class="num">${money(it.vat ?? 0)}</td>
          <td class="num">${money(it.line_total)}</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
    <div class="row"><span>Discount</span><span>-${money(d.discount)}</span></div>
    <div class="row"><span>VAT</span><span>${money(d.vat)}</span></div>
    <div class="row grand"><span>TOTAL</span><span>${money(d.total)}</span></div>
    <div class="row"><span>Paid</span><span>${money(d.paid)}</span></div>
    <div class="row"><span>Due</span><span>${money(d.due)}</span></div>
  </div>
  ${
    d.payments.length
      ? `<div class="payments"><strong>Payments:</strong> ${d.payments
          .map(
            (p) =>
              `${esc(p.method)} ${money(p.amount)}${p.reference ? ` (${esc(p.reference)})` : ""}`
          )
          .join(" • ")}</div>`
      : ""
  }
  ${
    d.show_signature !== false
      ? `<div class="signatures"><div class="box"><div class="signature-line"></div><div>Customer Signature</div></div><div class="box"><div class="signature-line">${safeSig ? `<img src="${esc(safeSig)}" alt="Authorized signature" />` : ""}</div><div>Authorized Signature</div></div></div>`
      : ""
  }
  <div class="footer">${esc(d.footer_note ?? "Thank you for your business.")}</div>
  `;
}

/** Build a complete standalone HTML document for a given paper size. */
export function buildReceiptHtml(data: ReceiptData, paper: PaperSize): string {
  const styles = paper === "A4" ? a4Styles() : thermalStyles(paper);
  const body = paper === "A4" ? a4Body(data) : thermalBody(data, paper);
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>${esc(data.invoice_no)} — ${paper}</title>
<style>${styles}</style>
</head><body>${body}<script>
  // Auto-print hook: parent posts 'print' to trigger; defaults to manual.
  window.addEventListener('message', (e) => {
    if (e.data === 'print') { window.focus(); window.print(); }
  });
</script></body></html>`;
}
