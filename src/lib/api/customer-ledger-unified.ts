// Pure helper to build a unified customer ledger from sales + customer_payments + sales_returns.
// Running balance reconciles to customers.due_balance (single source of truth: customer_due_summary).
//
// Formula per row:
//   - Opening Balance     debit = customer.opening_balance
//   - Invoice (sale)      debit = sale.total           (NOT netted by sale.paid)
//   - Collection          credit = customer_payment.amount  (ALL payments, sale-linked or not)
//   - Sales Return        credit = max(total - refunded_amount, 0)
//
//   running = opening + Σ sale.total - Σ customer_payments - Σ net_returns
//           = customer_due_summary(customer_id) = customers.due_balance

export type LedgerSale = {
  id: string;
  sale_date: string;
  invoice_no: string;
  total: number | null;
  paid: number | null;
  status?: string | null;
};
export type LedgerPayment = {
  id: string;
  payment_date: string;
  amount: number | null;
  reference: string | null;
  sale_id: string | null;
};
export type LedgerReturn = {
  id: string;
  return_date: string;
  return_no: string;
  total: number | null;
  refunded_amount?: number | null;
};

export type LedgerRow = {
  id: string;
  entry_date: string;
  entry_type: "opening" | "sale" | "collection" | "sales_return";
  ref_no: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export function buildCustomerLedger(args: {
  opening_balance: number;
  sales: LedgerSale[];
  payments: LedgerPayment[];     // pass ALL customer_payments; helper filters to standalone
  returns: LedgerReturn[];
  from?: string;                  // ISO date inclusive
  to?: string;                    // ISO date inclusive
}): { opening: number; entries: LedgerRow[]; closing: number } {
  const { opening_balance, sales, payments, returns, from, to } = args;
  const fromTs = from ? new Date(from).getTime() : -Infinity;
  const toTs = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;

  // Collect all entries with timestamps to compute opening (before window) and in-window rows.
  type Raw = LedgerRow & { ts: number };
  const all: Raw[] = [];

  for (const s of sales) {
    if (s.status === "void" || s.status === "draft") continue;
    all.push({
      id: `sale:${s.id}`,
      entry_date: s.sale_date,
      entry_type: "sale",
      ref_no: s.invoice_no,
      debit: Number(s.total ?? 0),
      credit: 0,
      balance: 0,
      ts: new Date(s.sale_date).getTime(),
    });
  }
  // Exclude payments tied to voided/draft sales so the running balance matches customer_due_summary.
  const voidedSaleIds = new Set(
    sales.filter((s) => s.status === "void" || s.status === "draft").map((s) => s.id),
  );
  for (const p of payments) {
    if (p.sale_id && voidedSaleIds.has(p.sale_id)) continue;
    all.push({
      id: `pay:${p.id}`,
      entry_date: p.payment_date,
      entry_type: "collection",
      ref_no: p.reference,
      debit: 0,
      credit: Number(p.amount ?? 0),
      balance: 0,
      ts: new Date(p.payment_date).getTime(),
    });
  }
  for (const r of returns) {
    const net = Math.max(Number(r.total ?? 0) - Number(r.refunded_amount ?? 0), 0);
    all.push({
      id: `ret:${r.id}`,
      entry_date: r.return_date,
      entry_type: "sales_return",
      ref_no: r.return_no,
      debit: 0,
      credit: net,
      balance: 0,
      ts: new Date(r.return_date).getTime(),
    });
  }

  all.sort((a, b) => a.ts - b.ts);

  // Opening = opening_balance + net of rows strictly BEFORE the window.
  let opening = opening_balance;
  const inWindow: Raw[] = [];
  for (const row of all) {
    if (row.ts < fromTs) {
      opening += row.debit - row.credit;
    } else if (row.ts <= toTs) {
      inWindow.push(row);
    }
  }

  // Prepend opening as its own row when there's a meaningful balance to display.
  let running = opening;
  const entries: LedgerRow[] = [];
  if (Math.abs(opening) > 0.0001) {
    entries.push({
      id: "opening",
      entry_date: from ?? (all[0]?.entry_date ?? new Date().toISOString()),
      entry_type: "opening",
      ref_no: null,
      debit: opening > 0 ? opening : 0,
      credit: opening < 0 ? -opening : 0,
      balance: opening,
    });
  }

  for (const row of inWindow) {
    running += row.debit - row.credit;
    entries.push({ ...row, balance: running });
  }

  return { opening, entries, closing: running };
}
