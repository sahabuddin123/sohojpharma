// Isolated iframe print helpers for Dena-Paona slips and ledger statements.
// Avoids global @media print rules in styles.css (which hide body * and force 80mm thermal width).

const escapeHtml = (val: unknown): string => {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatCurrency = (val: number | string | null | undefined): string => {
  const num = Number(val || 0);
  return new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 0 }).format(num);
};

const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("bn-BD", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
};

function printHtmlInIframe(html: string): void {
  if (typeof window === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    visibility: "hidden",
  });
  document.body.appendChild(iframe);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => iframe.parentNode?.removeChild(iframe), 500);
  };

  iframe.onload = () => {
    try {
      const cw = iframe.contentWindow;
      if (!cw) {
        cleanup();
        return;
      }
      cw.focus();
      cw.onafterprint = cleanup;
      setTimeout(() => {
        cw.print();
      }, 100);
      setTimeout(cleanup, 60_000);
    } catch (e) {
      console.error("[DenaPaonaPrint] failed:", e);
      cleanup();
    }
  };

  iframe.srcdoc = html;
}

const BASE_PRINT_STYLES = `
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Noto Sans Bengali', 'SolaimanLipi', system-ui, -apple-system, sans-serif;
    color: #111827;
    background: #fff;
    margin: 0;
    padding: 0;
    font-size: 13px;
    line-height: 1.5;
  }
  .doc { max-width: 720px; margin: 0 auto; }
  .header { text-align: center; padding-bottom: 14px; border-bottom: 2px solid #111827; margin-bottom: 18px; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 700; color: #007953; }
  .header .subtitle { margin: 4px 0 2px; font-size: 15px; font-weight: 600; }
  .header .date { margin: 0; font-size: 11px; color: #4b5563; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin-bottom: 18px; }
  .info-row { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; border-bottom: 1px dashed #e5e7eb; }
  .info-label { font-weight: 600; color: #374151; }
  .summary-box { border: 1.5px solid #111827; border-radius: 6px; padding: 14px 16px; margin-bottom: 18px; background: #f9fafb; }
  .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
  .summary-total { border-top: 1.5px solid #111827; margin-top: 8px; padding-top: 8px; font-size: 16px; font-weight: 700; }
  .meta-box { font-size: 12px; color: #374151; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin-bottom: 24px; }
  .meta-box p { margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
  th, td { border: 1px solid #374151; padding: 7px 9px; text-align: left; }
  th { background: #f3f4f6; font-weight: 700; }
  .text-right { text-align: right; }
  .signatures { display: flex; justify-content: space-between; margin-top: 56px; padding-top: 8px; }
  .sig-box { width: 160px; text-align: center; border-top: 1px solid #111827; padding-top: 6px; font-size: 12px; font-weight: 600; }
`;

export interface DenaPaonaSlipData {
  type: "give" | "take" | string;
  person_name: string;
  phone?: string | null;
  address?: string | null;
  transaction_date?: string | null;
  repayment_date?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  remaining_amount?: number | string | null;
  witness_1?: string | null;
  witness_2?: string | null;
  reason?: string | null;
}

export function printDenaPaonaSlip(item: DenaPaonaSlipData): void {
  const typeLabel =
    item.type === "give" ? "টাকা দেওয়া (আমার দেওয়া ঋণ)" : "টাকা নেওয়া (আমার নেওয়া ঋণ)";

  const html = `<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>দেনা-পাওনা রসিদ - ${escapeHtml(item.person_name)}</title>
  <style>${BASE_PRINT_STYLES}</style>
</head>
<body>
  <div class="doc">
    <div class="header">
      <h1>SohojPharma</h1>
      <div class="subtitle">দেনা-পাওনা খতিয়ান রসিদ</div>
      <div class="date">প্রিন্টের তারিখ: ${escapeHtml(new Date().toLocaleDateString("bn-BD"))}</div>
    </div>

    <div class="info-grid">
      <div class="info-row"><span class="info-label">লেনদেনের ধরন:</span><span>${escapeHtml(typeLabel)}</span></div>
      <div class="info-row"><span class="info-label">ব্যক্তির নাম:</span><span>${escapeHtml(item.person_name)}</span></div>
      <div class="info-row"><span class="info-label">ফোন নম্বর:</span><span>${escapeHtml(item.phone || "-")}</span></div>
      <div class="info-row"><span class="info-label">ঠিকানা:</span><span>${escapeHtml(item.address || "-")}</span></div>
      <div class="info-row"><span class="info-label">লেনদেনের তারিখ:</span><span>${escapeHtml(formatDate(item.transaction_date))}</span></div>
      <div class="info-row"><span class="info-label">পরিশোধের তারিখ:</span><span>${escapeHtml(formatDate(item.repayment_date))}</span></div>
    </div>

    <div class="summary-box">
      <div class="summary-row">
        <span>মোট ঋণ/পরিমাণ:</span>
        <strong>৳ ${escapeHtml(formatCurrency(item.total_amount))}</strong>
      </div>
      <div class="summary-row">
        <span>পরিশোধিত:</span>
        <span>৳ ${escapeHtml(formatCurrency(item.paid_amount))}</span>
      </div>
      <div class="summary-row summary-total">
        <span>বর্তমান অবশিষ্ট বাকি:</span>
        <span>৳ ${escapeHtml(formatCurrency(item.remaining_amount))}</span>
      </div>
    </div>

    <div class="meta-box">
      <p><strong>সাক্ষী ১:</strong> ${escapeHtml(item.witness_1 || "-")}</p>
      <p><strong>সাক্ষী ২:</strong> ${escapeHtml(item.witness_2 || "-")}</p>
      ${item.reason ? `<p><strong>কারণ/বিবরণ:</strong> ${escapeHtml(item.reason)}</p>` : ""}
    </div>

    <div class="signatures">
      <div class="sig-box">দাতার স্বাক্ষর</div>
      <div class="sig-box">গ্রহীতার স্বাক্ষর</div>
    </div>
  </div>
</body>
</html>`;

  printHtmlInIframe(html);
}

export interface DenaPaonaTxItem {
  id: string;
  transaction_date?: string | null;
  description?: string | null;
  given_amount?: number | string | null;
  taken_amount?: number | string | null;
  paid_amount?: number | string | null;
  remaining_amount?: number | string | null;
}

export function printDenaPaonaStatement(
  loan: DenaPaonaSlipData,
  transactions: DenaPaonaTxItem[],
): void {
  const typeLabel = loan.type === "give" ? "আমার দেওয়া ঋণ" : "আমার নেওয়া ঋণ";

  const rowsHtml =
    transactions.length === 0
      ? `<tr><td colspan="6" style="text-align:center;color:#6b7280;">কোনো লেনদেন পাওয়া যায়নি</td></tr>`
      : transactions
          .map(
            (tx) => `<tr>
              <td>${escapeHtml(formatDate(tx.transaction_date))}</td>
              <td>${escapeHtml(tx.description || "-")}</td>
              <td class="text-right">${Number(tx.given_amount) > 0 ? `৳ ${escapeHtml(formatCurrency(tx.given_amount))}` : "-"}</td>
              <td class="text-right">${Number(tx.taken_amount) > 0 ? `৳ ${escapeHtml(formatCurrency(tx.taken_amount))}` : "-"}</td>
              <td class="text-right">${Number(tx.paid_amount) > 0 ? `৳ ${escapeHtml(formatCurrency(tx.paid_amount))}` : "-"}</td>
              <td class="text-right"><strong>৳ ${escapeHtml(formatCurrency(tx.remaining_amount))}</strong></td>
            </tr>`,
          )
          .join("");

  const html = `<!doctype html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <title>দেনা-পাওনা স্টেটমেন্ট - ${escapeHtml(loan.person_name)}</title>
  <style>${BASE_PRINT_STYLES}</style>
</head>
<body>
  <div class="doc">
    <div class="header">
      <h1>SohojPharma</h1>
      <div class="subtitle">দেনা-পাওনা লেজার স্টেটমেন্ট</div>
      <div class="date">প্রিন্টের তারিখ: ${escapeHtml(new Date().toLocaleDateString("bn-BD"))}</div>
    </div>

    <div class="info-grid">
      <div class="info-row"><span class="info-label">ব্যক্তির নাম:</span><span>${escapeHtml(loan.person_name)}</span></div>
      <div class="info-row"><span class="info-label">লেনদেনের ধরন:</span><span>${escapeHtml(typeLabel)}</span></div>
      <div class="info-row"><span class="info-label">ফোন নম্বর:</span><span>${escapeHtml(loan.phone || "-")}</span></div>
      <div class="info-row"><span class="info-label">ঋণের তারিখ:</span><span>${escapeHtml(formatDate(loan.transaction_date))}</span></div>
      <div class="info-row"><span class="info-label">ঠিকানা:</span><span>${escapeHtml(loan.address || "-")}</span></div>
      <div class="info-row"><span class="info-label">পরিশোধের তারিখ:</span><span>${escapeHtml(formatDate(loan.repayment_date))}</span></div>
    </div>

    <div class="summary-box" style="display:flex;justify-content:space-around;font-weight:700;">
      <div>মোট ঋণ: ৳ ${escapeHtml(formatCurrency(loan.total_amount))}</div>
      <div>পরিশোধিত: ৳ ${escapeHtml(formatCurrency(loan.paid_amount))}</div>
      <div>অবশিষ্ট বাকি: ৳ ${escapeHtml(formatCurrency(loan.remaining_amount))}</div>
    </div>

    <h3 style="margin:0 0 8px;font-size:14px;">লেনদেনের বিস্তারিত ইতিহাস:</h3>
    <table>
      <thead>
        <tr>
          <th>তারিখ</th>
          <th>বিবরণ</th>
          <th class="text-right">দেওয়া</th>
          <th class="text-right">নেওয়া</th>
          <th class="text-right">পরিশোধ</th>
          <th class="text-right">বাকি</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="signatures">
      <div class="sig-box">দাতার স্বাক্ষর</div>
      <div class="sig-box">গ্রহীতার স্বাক্ষর</div>
    </div>
  </div>
</body>
</html>`;

  printHtmlInIframe(html);
}
