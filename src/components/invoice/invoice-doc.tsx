import "./invoice-print.css";

export type InvoiceFormat = "thermal-38" | "thermal-58" | "thermal-80" | "a4";

export type InvoiceItem = {
  name: string;
  sku?: string | null;
  qty: number;
  unit_price: number;
  discount?: number;
  vat?: number;
  line_total: number;
};

export type InvoiceSettings = {
  company_name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  trade_license?: string;
  drug_license?: string;
  bin_number?: string;
  tin_number?: string;
  logo_url?: string;
  footer_message?: string;
  terms_conditions?: string;
  print_format?: string;
  thermal_width?: string;
  primary_color?: string;
  font_family?: string;
  show_logo?: boolean;
  show_qr?: boolean;
  show_bin?: boolean;
  show_tin?: boolean;
  show_drug_license?: boolean;
  show_signature?: boolean;
  signature_url?: string;
};

export type InvoiceData = {
  invoice_no: string;
  date: string; // ISO or display
  cashier?: string;
  customer_name?: string;
  customer_phone?: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paid: number;
  due: number;
  payment_method?: string;
  notes?: string | null;
  kind?: "sale" | "return" | "payment";
};

const fmt = (n: number) => `৳ ${Number(n || 0).toFixed(2)}`;

export function InvoiceDoc({
  format,
  data,
  settings,
}: {
  format: InvoiceFormat;
  data: InvoiceData;
  settings: InvoiceSettings;
}) {
  const isThermal = format !== "a4";
  const title =
    data.kind === "return" ? "RETURN RECEIPT" :
    data.kind === "payment" ? "PAYMENT RECEIPT" : "INVOICE";

  return (
    <div
      className={`invoice-doc ${format}`}
      style={
        {
          "--inv-color": settings.primary_color || "#0ea5e9",
          "--inv-font": settings.font_family || "system-ui, sans-serif",
        } as React.CSSProperties
      }
    >
      {isThermal ? (
        <ThermalLayout data={data} settings={settings} title={title} />
      ) : (
        <A4Layout data={data} settings={settings} title={title} />
      )}
    </div>
  );
}

function ThermalLayout({ data, settings, title }: { data: InvoiceData; settings: InvoiceSettings; title: string }) {
  return (
    <>
      <div className="center">
        {settings.show_logo !== false && settings.logo_url ? <img src={settings.logo_url} className="logo" alt="" /> : null}
        <div style={{ fontWeight: 700, fontSize: "1.1em" }}>{settings.company_name || "Pharmacy"}</div>
        {settings.address ? <div>{settings.address}</div> : null}
        {settings.phone ? <div>Tel: {settings.phone}</div> : null}
        {settings.show_bin !== false && settings.bin_number ? <div>BIN: {settings.bin_number}</div> : null}
        {settings.show_tin !== false && settings.tin_number ? <div>TIN: {settings.tin_number}</div> : null}
        {settings.show_drug_license !== false && settings.drug_license ? <div>DL: {settings.drug_license}</div> : null}
        <div style={{ fontWeight: 700, marginTop: 4 }}>{title}</div>
      </div>
      <div className="sep" />
      <div className="row"><span>Invoice:</span><span>{data.invoice_no}</span></div>
      <div className="row"><span>Date:</span><span>{new Date(data.date).toLocaleString()}</span></div>
      {data.cashier && <div className="row"><span>Cashier:</span><span>{data.cashier}</span></div>}
      {data.customer_name && <div className="row"><span>Customer:</span><span>{data.customer_name}</span></div>}
      {data.customer_phone && <div className="row"><span>Phone:</span><span>{data.customer_phone}</span></div>}
      <div className="sep" />
      <table>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i}>
              <td colSpan={2}>
                <div className="item-name">{it.name}</div>
                <div className="row">
                  <span>{it.qty} × {fmt(it.unit_price)}{it.discount ? ` - ${fmt(it.discount)}` : ""}</span>
                  <span>{fmt(it.line_total)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sep" />
      <div className="row"><span>Subtotal</span><span>{fmt(data.subtotal)}</span></div>
      {data.discount > 0 && <div className="row"><span>Discount</span><span>-{fmt(data.discount)}</span></div>}
      {data.vat > 0 && <div className="row"><span>VAT</span><span>{fmt(data.vat)}</span></div>}
      <div className="row" style={{ fontWeight: 700, fontSize: "1.1em" }}>
        <span>TOTAL</span><span>{fmt(data.total)}</span>
      </div>
      <div className="row"><span>Paid ({data.payment_method || "cash"})</span><span>{fmt(data.paid)}</span></div>
      {data.due > 0 && <div className="row" style={{ fontWeight: 700 }}><span>DUE</span><span>{fmt(data.due)}</span></div>}
      <div style={{ whiteSpace: "pre-line", textAlign: "left", marginTop: 6 }}>
        {settings.footer_message || "Thank you for your purchase!"}
        {settings.website ? <div className="muted">{settings.website}</div> : null}
      </div>
      {settings.terms_conditions ? (
        <>
          <div className="sep" />
          <div className="muted" style={{ whiteSpace: "pre-line" }}>{settings.terms_conditions}</div>
        </>
      ) : null}
      {settings.show_signature !== false && (
        <ThermalSignature signatureUrl={settings.signature_url} />
      )}
    </>
  );
}

function ThermalSignature({ signatureUrl }: { signatureUrl?: string }) {
  return (
    <div className="thermal-signature">
      <div className="signature-line">
        {signatureUrl ? <img src={signatureUrl} alt="Authorized signature" /> : null}
      </div>
      <div>Authorized Signature</div>
    </div>
  );
}

function A4Signature({ signatureUrl }: { signatureUrl?: string }) {
  return (
    <div className="signatures">
      <div className="box">
        <div className="signature-line" />
        <div>Customer Signature</div>
      </div>
      <div className="box">
        <div className="signature-line">
          {signatureUrl ? <img src={signatureUrl} alt="Authorized signature" /> : null}
        </div>
        <div>Authorized Signature</div>
      </div>
    </div>
  );
}

function A4Layout({ data, settings, title }: { data: InvoiceData; settings: InvoiceSettings; title: string }) {
  return (
    <>
      <div className="header">
        <div>
          {settings.show_logo !== false && settings.logo_url ? <img src={settings.logo_url} className="logo" alt="" /> : null}
          <h1>{settings.company_name || "Pharmacy"}</h1>
          {settings.address && <div className="muted">{settings.address}</div>}
          {settings.phone && <div className="muted">Tel: {settings.phone}{settings.email ? ` · ${settings.email}` : ""}</div>}
          {((settings.show_bin !== false && settings.bin_number) || (settings.show_tin !== false && settings.tin_number) || (settings.show_drug_license !== false && settings.drug_license)) && (
            <div className="muted">
              {settings.show_bin !== false && settings.bin_number ? `BIN: ${settings.bin_number}  ` : ""}
              {settings.show_tin !== false && settings.tin_number ? `TIN: ${settings.tin_number}  ` : ""}
              {settings.show_drug_license !== false && settings.drug_license ? `DL: ${settings.drug_license}` : ""}
            </div>
          )}
        </div>
        <div className="meta">
          <h1 style={{ fontSize: 18 }}>{title}</h1>
          <div><strong>{data.invoice_no}</strong></div>
          <div>Date: {new Date(data.date).toLocaleDateString()}</div>
          {data.cashier && <div>Cashier: {data.cashier}</div>}
        </div>
      </div>

      <div className="parties">
        <div>
          <h3>Bill To</h3>
          <div style={{ fontWeight: 600 }}>{data.customer_name || "Walk-in customer"}</div>
          {data.customer_phone && <div className="muted">{data.customer_phone}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <h3>Payment</h3>
          <div>Method: {data.payment_method || "cash"}</div>
          <div>Status: {data.due > 0 ? "Partial" : "Paid"}</div>
        </div>
      </div>

      <table className="items">
        <thead>
          <tr>
            <th style={{ width: 30 }}>#</th>
            <th>Item</th>
            <th style={{ textAlign: "right" }}>Qty</th>
            <th style={{ textAlign: "right" }}>Rate</th>
            <th style={{ textAlign: "right" }}>Disc</th>
            <th style={{ textAlign: "right" }}>VAT</th>
            <th style={{ textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((it, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                {it.sku && <div className="muted" style={{ fontSize: 10 }}>{it.sku}</div>}
              </td>
              <td style={{ textAlign: "right" }}>{it.qty}</td>
              <td style={{ textAlign: "right" }}>{fmt(it.unit_price)}</td>
              <td style={{ textAlign: "right" }}>{fmt(it.discount || 0)}</td>
              <td style={{ textAlign: "right" }}>{fmt(it.vat || 0)}</td>
              <td style={{ textAlign: "right" }}>{fmt(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <div className="row"><span>Subtotal</span><span>{fmt(data.subtotal)}</span></div>
        <div className="row"><span>Discount</span><span>-{fmt(data.discount)}</span></div>
        <div className="row"><span>VAT</span><span>{fmt(data.vat)}</span></div>
        <div className="row grand"><span>Grand Total</span><span>{fmt(data.total)}</span></div>
        <div className="row"><span>Paid</span><span>{fmt(data.paid)}</span></div>
        {data.due > 0 && <div className="row" style={{ color: "#b91c1c", fontWeight: 700 }}><span>Due</span><span>{fmt(data.due)}</span></div>}
      </div>

      {settings.terms_conditions && (
        <div style={{ marginTop: 24, fontSize: 10 }}>
          <h3 style={{ fontSize: 11, textTransform: "uppercase", color: "#666" }}>Terms & Conditions</h3>
          <div className="muted" style={{ whiteSpace: "pre-line" }}>{settings.terms_conditions}</div>
        </div>
      )}

      {settings.show_signature !== false && <A4Signature signatureUrl={settings.signature_url} />}

      <div className="footer" style={{ whiteSpace: "pre-line" }}>
        {settings.footer_message || "Thank you for your business!"}
        {settings.website ? ` · ${settings.website}` : ""}
      </div>
    </>
  );
}
