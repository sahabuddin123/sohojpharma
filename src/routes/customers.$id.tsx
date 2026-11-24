import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { ArrowLeft, Wallet, Phone, MapPin, Mail, ShoppingCart, Loader2, Pencil, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { buildCustomerLedger } from "@/lib/api/customer-ledger-unified";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { CollectPaymentDialog } from "@/components/pos/customer-due-dialogs";
import { useState } from "react";


export const Route = createFileRoute("/customers/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer — SohojPharma" }] }),
  component: CustomerDetailsPage,
});

const fmt = (n: number | null | undefined) => `৳ ${Number(n ?? 0).toLocaleString()}`;
const dateOnly = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString() : "—");

function CustomerDetailsPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const enabled = !!tenantId && !!id;
  const [editOpen, setEditOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);


  const customerQ = useQuery({
    queryKey: ["customer", tenantId, id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_customer_due")
        .select("id:customer_id,customer_code,name,phone,email,address,area,district,division,postal_code,country,type,credit_limit,due_balance,opening_balance,payment_terms_days,created_at,is_active,date_of_birth,gender,blood_group,allergies,chronic_diseases,doctor_reference,nid_passport,notes")
        .eq("tenant_id", tenantId)
        .eq("customer_id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const salesQ = useQuery({
    queryKey: ["customer-sales", tenantId, id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,invoice_no,sale_date,total,paid,due,status")
        .eq("tenant_id", tenantId)
        .eq("customer_id", id)
        .order("sale_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const returnsQ = useQuery({
    queryKey: ["customer-returns", tenantId, id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select("id,return_no,return_date,total,refunded_amount")
        .eq("tenant_id", tenantId)
        .eq("customer_id", id)
        .order("return_date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const tenantQ = useQuery({
    queryKey: ["tenant-print-header", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("name,owner_name,address_line,area,district,phone,mobile")
        .eq("id", tenantId)
        .maybeSingle();
      return data;
    },
  });

  const paymentsQ = useQuery({
    queryKey: ["customer-payments", tenantId, id],
    enabled,
    queryFn: async () => {
      const [cpRes, spRes] = await Promise.all([
        supabase
          .from("customer_payments")
          .select("id,payment_date,amount,method,reference,notes,collected_by,sale_id")
          .eq("tenant_id", tenantId)
          .eq("customer_id", id)
          .order("payment_date", { ascending: false })
          .limit(500),
        supabase
          .from("sale_payments")
          .select("id,paid_at,amount,method,reference,sale_id,sales!inner(customer_id,invoice_no,status)")
          .eq("tenant_id", tenantId)
          .eq("sales.customer_id", id)
          .order("paid_at", { ascending: false })
          .limit(500),
      ]);
      if (cpRes.error) throw cpRes.error;
      if (spRes.error) throw spRes.error;

      const cpRows = (cpRes.data ?? []).map((p) => ({
        ...p,
        source: "customer_payment" as const,
      }));
      const cpKeys = new Set(
        cpRows
          .filter((p) => p.sale_id)
          .map((p) => `${p.sale_id}:${Number(p.amount ?? 0).toFixed(2)}`),
      );

      const spRows = (spRes.data ?? [])
        .filter((sp) => {
          const sale = sp.sales as { status?: string | null } | null;
          if (sale?.status === "void" || sale?.status === "draft") return false;
          const key = `${sp.sale_id}:${Number(sp.amount ?? 0).toFixed(2)}`;
          return !cpKeys.has(key);
        })
        .map((sp) => {
          const sale = sp.sales as { invoice_no?: string | null } | null;
          return {
            id: sp.id,
            payment_date: sp.paid_at,
            amount: sp.amount,
            method: sp.method,
            reference: sp.reference ?? sale?.invoice_no ?? null,
            notes: sale?.invoice_no ? `Invoice ${sale.invoice_no}` : null,
            collected_by: null as string | null,
            sale_id: sp.sale_id,
            source: "sale_payment" as const,
          };
        });

      return [...cpRows, ...spRows].sort(
        (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime(),
      );
    },
  });

  const loading = customerQ.isLoading || salesQ.isLoading || paymentsQ.isLoading || returnsQ.isLoading;
  const customer = customerQ.data;
  const sales = salesQ.data ?? [];
  const payments = paymentsQ.data ?? [];
  const returns = returnsQ.data ?? [];

  const totalSpend = sales.reduce((a, s) => a + Number(s.total ?? 0), 0);
  const totalOrders = sales.length;
  const lastVisit = sales[0]?.sale_date ?? null;

  // Unified ledger reconciles to customers.due_balance
  const { entries: rawLedgerRows } = buildCustomerLedger({
    opening_balance: Number(customer?.opening_balance ?? 0),
    sales: sales.map((s) => ({ id: s.id, sale_date: s.sale_date, invoice_no: s.invoice_no, total: s.total, paid: s.paid, status: s.status })),
    payments: payments.map((p) => ({ id: p.id, payment_date: p.payment_date, amount: p.amount, reference: p.reference, sale_id: p.sale_id })),
    returns: returns.map((r) => ({ id: r.id, return_date: r.return_date, return_no: r.return_no, total: r.total, refunded_amount: r.refunded_amount })),
  });
  const ledgerRows = rawLedgerRows.map((row, index) => (
    index === rawLedgerRows.length - 1 ? { ...row, balance: Number(customer?.due_balance ?? row.balance) } : row
  ));

  if (loading) {
    return (
      <AppShell variant="store" title={t("cust.customer.shellTitle")}>
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }

  if (!customer) {
    return (
      <AppShell variant="store" title={t("cust.customer.shellTitle")}>
        <Card><CardContent className="py-10 text-center text-muted-foreground">Customer not found.</CardContent></Card>
      </AppShell>
    );
  }

  const typeLower = (customer.type ?? "retail").toLowerCase();

  const printLedgerA4 = () => {
    const shop = tenantQ.data;
    const shopAddr = [shop?.address_line, shop?.area, shop?.district].filter(Boolean).join(", ");
    const shopPhone = shop?.phone || shop?.mobile || "";
    const custAddr = [customer.address, customer.area, customer.district, customer.division, customer.postal_code, customer.country].filter(Boolean).join(", ");
    const totalDebit = ledgerRows.reduce((s, r) => s + Number(r.debit ?? 0), 0);
    const totalCredit = ledgerRows.reduce((s, r) => s + Number(r.credit ?? 0), 0);
    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fmtNum = (n: number) => `৳ ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const rowsHtml = ledgerRows.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:16px;color:#666;">No ledger entries.</td></tr>`
      : ledgerRows.map((l) => `
        <tr>
          <td>${esc(dateOnly(l.entry_date))}</td>
          <td style="font-family:monospace;">${esc(l.ref_no ?? "—")}</td>
          <td style="text-transform:capitalize;">${esc(l.entry_type)}</td>
          <td style="text-align:right;">${Number(l.debit) ? fmtNum(l.debit) : "—"}</td>
          <td style="text-align:right;color:#15803d;">${Number(l.credit) ? fmtNum(l.credit) : "—"}</td>
          <td style="text-align:right;font-weight:600;">${fmtNum(l.balance)}</td>
        </tr>
      `).join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Customer Ledger — ${esc(customer.name)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #111; margin: 0; font-size: 12px; line-height: 1.45; }
    .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 14px; }
    .shop-name { font-size: 20px; font-weight: 700; color: #0f766e; }
    .shop-meta { font-size: 11px; color: #444; margin-top: 2px; }
    .doc-title { font-size: 15px; font-weight: 700; margin-top: 8px; letter-spacing: 0.5px; text-transform: uppercase; }
    .info-grid { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; }
    .info-col p { margin: 2px 0; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
    .sum-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
    .sum-lbl { font-size: 10px; color: #64748b; text-transform: uppercase; }
    .sum-val { font-size: 14px; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; font-size: 11px; text-transform: uppercase; }
    tfoot td { background: #f8fafc; font-weight: 700; }
    .footer { margin-top: 28px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
    .sig { border-top: 1px solid #94a3b8; padding-top: 4px; width: 160px; text-align: center; color: #334155; }
  </style>
</head>
<body>
  <div class="header">
    <div class="shop-name">${esc(shop?.name ?? "SohojPharma")}</div>
    ${shop?.owner_name ? `<div class="shop-meta">Owner: ${esc(shop.owner_name)}</div>` : ""}
    ${shopAddr ? `<div class="shop-meta">${esc(shopAddr)}</div>` : ""}
    ${shopPhone ? `<div class="shop-meta">Mobile: ${esc(shopPhone)}</div>` : ""}
    <div class="doc-title">Customer Ledger Statement</div>
  </div>

  <div class="info-grid">
    <div class="info-col">
      <p><strong>Customer:</strong> ${esc(customer.name)}</p>
      <p><strong>Code:</strong> ${esc(customer.customer_code ?? "—")}</p>
      <p><strong>Mobile:</strong> ${esc(customer.phone ?? "—")}</p>
      ${custAddr ? `<p><strong>Address:</strong> ${esc(custAddr)}</p>` : ""}
    </div>
    <div class="info-col" style="text-align:right;">
      <p><strong>Print Date:</strong> ${esc(new Date().toLocaleDateString())}</p>
      <p><strong>Total Orders:</strong> ${totalOrders}</p>
      <p><strong>Current Due:</strong> <span style="color:${Number(customer.due_balance) > 0 ? "#dc2626" : "#15803d"};font-weight:700;">${fmtNum(Number(customer.due_balance ?? 0))}</span></p>
    </div>
  </div>

  <div class="summary">
    <div class="sum-box"><div class="sum-lbl">Opening Balance</div><div class="sum-val">${fmtNum(Number(customer.opening_balance ?? 0))}</div></div>
    <div class="sum-box"><div class="sum-lbl">Total Debit (Sales)</div><div class="sum-val">${fmtNum(totalDebit)}</div></div>
    <div class="sum-box"><div class="sum-lbl">Total Credit (Paid)</div><div class="sum-val" style="color:#15803d;">${fmtNum(totalCredit)}</div></div>
    <div class="sum-box"><div class="sum-lbl">Closing Due</div><div class="sum-val" style="color:${Number(customer.due_balance) > 0 ? "#dc2626" : "#15803d"};">${fmtNum(Number(customer.due_balance ?? 0))}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Reference</th>
        <th>Type</th>
        <th style="text-align:right;">Debit</th>
        <th style="text-align:right;">Credit</th>
        <th style="text-align:right;">Balance</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="text-align:right;">Total</td>
        <td style="text-align:right;">${fmtNum(totalDebit)}</td>
        <td style="text-align:right;color:#15803d;">${fmtNum(totalCredit)}</td>
        <td style="text-align:right;">${fmtNum(Number(customer.due_balance ?? 0))}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div>Generated by SohojPharma · ${esc(new Date().toLocaleString())}</div>
    <div class="sig">Authorized Signature</div>
  </div>
</body>
</html>`;

    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true });
    setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    }, 150);
  };

  return (
    <AppShell variant="store" title={t("cust.customer.shellTitle")}>
      <PageHeader
        title={customer.name ?? "Customer"}
        description={`Code: ${customer.customer_code ?? "—"}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/customers"><ArrowLeft className="mr-1.5 h-4 w-4" /> {t("cust.back")}</Link>
            </Button>
            <Button variant="outline" onClick={printLedgerA4}>
              <Printer className="mr-1.5 h-4 w-4" /> Print Ledger (A4)
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
            <Button onClick={() => setCollectOpen(true)}>
              <Wallet className="mr-1.5 h-4 w-4" /> {t("cust.customer.collectDue")}
            </Button>

          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("cust.customer.lifetimeSpend")} value={fmt(totalSpend)} icon={ShoppingCart} tone="primary" />
        <StatCard label={t("cust.customer.totalOrders")} value={String(totalOrders)} icon={ShoppingCart} tone="secondary" />
        <StatCard label={t("cust.customer.outstandingDue")} value={fmt(customer.due_balance)} icon={Wallet} tone="warning" />
        <StatCard label={t("cust.customer.lastVisit")} value={dateOnly(lastVisit)} icon={ShoppingCart} tone="success" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">{t("cust.customer.profile")}</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            {/* Contact */}
            <div className="space-y-2">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {customer.phone ?? "—"}</p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {customer.email ?? "—"}</p>
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span>
                  {[customer.address, customer.area, customer.district, customer.division, customer.postal_code, customer.country].filter(Boolean).join(", ") || "—"}
                </span>
              </p>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary capitalize">{typeLower}</Badge>
            </div>

            {/* Financial */}
            <div className="border-t border-border pt-3 space-y-1 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold uppercase tracking-wider text-foreground">Financial</p>
              <p>Credit Limit: <span className="font-semibold text-foreground">{fmt(customer.credit_limit)}</span></p>
              <p>Payment Terms: <span className="font-semibold text-foreground">{Number(customer.payment_terms_days ?? 0)} days</span></p>
              <p>Opening Balance: <span className="font-semibold text-foreground">{fmt(customer.opening_balance)}</span></p>
              <p>Current Due: <span className={`font-semibold ${Number(customer.due_balance) > 0 ? "text-destructive" : "text-success"}`}>{fmt(customer.due_balance)}</span></p>
            </div>

            {/* Pharmacy / Medical */}
            <div className="border-t border-border pt-3 space-y-1 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold uppercase tracking-wider text-foreground">Pharmacy</p>
              <p>Date of Birth: <span className="font-semibold text-foreground">{dateOnly(customer.date_of_birth)}</span></p>
              <p>Gender: <span className="font-semibold capitalize text-foreground">{customer.gender ?? "—"}</span></p>
              <p>Blood Group: <span className="font-semibold text-foreground">{customer.blood_group ?? "—"}</span></p>
              <p>Allergies: <span className="font-semibold text-foreground">{customer.allergies ?? "—"}</span></p>
              <p>Chronic Diseases: <span className="font-semibold text-foreground">{customer.chronic_diseases ?? "—"}</span></p>
              <p>Doctor Reference: <span className="font-semibold text-foreground">{customer.doctor_reference ?? "—"}</span></p>
            </div>

            {/* Additional */}
            <div className="border-t border-border pt-3 space-y-1 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold uppercase tracking-wider text-foreground">Additional</p>
              <p>NID / Passport: <span className="font-semibold text-foreground">{customer.nid_passport ?? "—"}</span></p>
              <p>Notes: <span className="font-semibold text-foreground">{customer.notes ?? "—"}</span></p>
              <p>Created: {dateOnly(customer.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card lg:col-span-2">
          <CardHeader><CardTitle className="text-base">{t("cust.history")}</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="ledger">
              <TabsList>
                <TabsTrigger value="ledger">{t("cust.ledger")}</TabsTrigger>
                <TabsTrigger value="sales">{t("cust.customer.salesHistory")}</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
              </TabsList>

              <TabsContent value="ledger" className="mt-4">
                {ledgerRows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No ledger entries.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("cust.table.date")}</TableHead>
                      <TableHead>{t("cust.table.ref")}</TableHead>
                      <TableHead>{t("cust.table.type")}</TableHead>
                      <TableHead className="text-right">{t("cust.table.debit")}</TableHead>
                      <TableHead className="text-right">{t("cust.table.credit")}</TableHead>
                      <TableHead className="text-right">{t("cust.table.balance")}</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {ledgerRows.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>{dateOnly(l.entry_date)}</TableCell>
                          <TableCell className="font-mono text-xs">{l.ref_no ?? "—"}</TableCell>
                          <TableCell className="capitalize">{l.entry_type}</TableCell>
                          <TableCell className="text-right">{Number(l.debit) ? fmt(l.debit) : "-"}</TableCell>
                          <TableCell className="text-right text-success">{Number(l.credit) ? fmt(l.credit) : "-"}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(l.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="sales" className="mt-4">
                {sales.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("cust.table.invoice")}</TableHead>
                      <TableHead>{t("cust.table.date")}</TableHead>
                      <TableHead className="text-right">{t("cust.table.total")}</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {sales.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.invoice_no}</TableCell>
                          <TableCell>{dateOnly(s.sale_date)}</TableCell>
                          <TableCell className="text-right font-semibold">{fmt(s.total)}</TableCell>
                          <TableCell className="text-right">{fmt(s.paid)}</TableCell>
                          <TableCell className={`text-right ${Number(s.due) > 0 ? "text-destructive" : ""}`}>{fmt(s.due)}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                {payments.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>{t("cust.table.date")}</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{dateOnly(p.payment_date)}</TableCell>
                          <TableCell className="text-right font-semibold text-success">{fmt(p.amount)}</TableCell>
                          <TableCell className="capitalize">{p.method}</TableCell>
                          <TableCell className="font-mono text-xs">{p.reference ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.notes ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <EditCustomerDialog
        customerId={id}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <CollectPaymentDialog
        open={collectOpen}
        onOpenChange={setCollectOpen}
        customer={customer?.id && customer.name ? {
          customer_id: customer.id,
          name: customer.name,
          phone: customer.phone,
          net_due: Number(customer.due_balance ?? 0),
          open_invoice_due: Number(customer.due_balance ?? 0),
          code: customer.customer_code,
        } : null}
      />

    </AppShell>
  );
}
