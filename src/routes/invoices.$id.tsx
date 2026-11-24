import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel, RouteNotFoundPanel } from "@/components/route-error";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, Download, Share2, Ban, ArrowLeft, History, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import {
  getInvoice, getInvoiceSettings, cancelInvoice, getInvoiceHistory,
  type InvoiceEditHistoryRow, type HistoryItem,
} from "@/lib/api/invoices.functions";
import { InvoiceShareDialog } from "@/components/invoice/invoice-share-dialog";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/invoices/$id")({
  validateSearch: z.object({ kind: z.enum(["sale", "purchase"]).default("sale") }),
  head: () => ({ meta: [{ title: "Invoice — SohojPharma" }] }),
  component: InvoiceDetailsPage,
  errorComponent: (props) => <RouteErrorPanel {...props} />,
  notFoundComponent: () => <RouteNotFoundPanel label="Invoice" />,
});

type AnyRec = Record<string, unknown>;

function InvoiceDetailsPage() {

  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { kind } = Route.useSearch();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const get = useServerFn(getInvoice);
  const getSettings = useServerFn(getInvoiceSettings);
  const cancelFn = useServerFn(cancelInvoice);
  const getHistory = useServerFn(getInvoiceHistory);
  const [shareOpen, setShareOpen] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["invoice", id, kind, currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => get({ data: { tenantId: currentTenantId!, kind, id } }),
  });
  const { data: settings } = useQuery({
    queryKey: ["invoice-settings", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => getSettings({ data: { tenantId: currentTenantId! } }),
  });
  const { data: history } = useQuery({
    queryKey: ["invoice-history", id, currentTenantId],
    enabled: !!currentTenantId && kind === "sale",
    queryFn: () => getHistory({ data: { tenantId: currentTenantId!, saleId: id } }),
  });

  if (!data || !settings) {
    return <AppShell variant="store" title={t("ipos.invoiceLbl")}><div className="p-6 text-muted-foreground">{t("ipos.loading")}</div></AppShell>;
  }

  const inv = data.invoice as AnyRec;
  const items: AnyRec[] = Array.isArray(inv.items) ? (inv.items as AnyRec[]) : [];
  const party = (data.kind === "sale" ? inv.customer : inv.supplier) as AnyRec | null;
  const payments: AnyRec[] = Array.isArray(inv.payments) ? (inv.payments as AnyRec[]) : [];
  const date = (inv.sale_date ?? inv.purchase_date) as string;
  const historyList: InvoiceEditHistoryRow[] = Array.isArray(history) ? history : [];
  const editCount = historyList.length;

  const handleCancel = async () => {
    if (data.kind !== "sale") return;
    const reason = window.prompt(t("ipos.promptCancelReason"));
    if (!reason || reason.trim().length < 3) {
      toast.error(t("toast.reasonRequired"));
      return;
    }
    try {
      await cancelFn({ data: { tenantId: currentTenantId!, branchId: branchId!, id, reason: reason.trim(), reverseStock: true } });
      toast.success(t("toast.invoiceCancelled"));
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const paperClass = settings.paper === "38mm" ? "w-[38mm]" : settings.paper === "58mm" ? "w-[58mm]" : settings.paper === "80mm" ? "w-[80mm]" : "w-[210mm] max-w-full";

  return (
    <AppShell variant="store" title={inv.invoice_no as string}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/invoices" })}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> {t("ipos.backBtn")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> {t("ipos.printBtn")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="mr-1.5 h-4 w-4" /> {t("ipos.pdfBtn")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="mr-1.5 h-4 w-4" /> {t("ipos.shareBtn")}
          </Button>
          {data.kind === "sale" && inv.status !== "void" && (
            <Button variant="destructive" size="sm" onClick={handleCancel}>
              <Ban className="mr-1.5 h-4 w-4" /> {t("ipos.cancelLabel")}
            </Button>
          )}
        </div>
      </div>

      {inv.status === "void" && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm print:hidden">
          <div className="font-semibold text-destructive">{t("ipos.invoiceCancelled")}</div>
          <div className="mt-1 grid gap-0.5 text-muted-foreground sm:grid-cols-3">
            <div><span className="font-medium text-foreground">{t("ipos.reasonLbl")}</span> {(inv.cancellation_reason as string) ?? "—"}</div>
            <div><span className="font-medium text-foreground">{t("ipos.byLbl")}</span> {(inv.cancelled_by as string) ?? "—"}</div>
            <div><span className="font-medium text-foreground">{t("ipos.atLbl")}</span> {inv.cancelled_at ? new Date(inv.cancelled_at as string).toLocaleString() : "—"}</div>
          </div>
        </div>
      )}

      {data.kind === "sale" ? (
        <>
        <div className="hidden print:block">
          <InvoiceReceipt
            paperClass={paperClass}
            settings={settings}
            inv={inv}
            items={items}
            party={party}
            payments={payments}
            date={date}
            kind={data.kind}
          />
        </div>

        <Tabs defaultValue="details" className="w-full print:hidden">
          <TabsList className="print:hidden">
            <TabsTrigger value="details">{t("ipos.tabDetails")}</TabsTrigger>
            <TabsTrigger value="payments">{t("ipos.tabPayments")}</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              {t("ipos.tabHistory")}
              {editCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{editCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4">
            <InvoiceReceipt
              paperClass={paperClass}
              settings={settings}
              inv={inv}
              items={items}
              party={party}
              payments={payments}
              date={date}
              kind={data.kind}
            />
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <PaymentsTab payments={payments} total={Number(inv.total)} paid={Number(inv.paid)} due={Number(inv.due)} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistoryTab
              createdAt={(inv.created_at as string) ?? date}
              cashierName={null}
              history={historyList}
            />
          </TabsContent>
        </Tabs>
        </>
      ) : (
        <InvoiceReceipt
          paperClass={paperClass}
          settings={settings}
          inv={inv}
          items={items}
          party={party}
          payments={payments}
          date={date}
          kind={data.kind}
        />
      )}

      <InvoiceShareDialog
        open={shareOpen} onOpenChange={setShareOpen}
        invoiceNo={inv.invoice_no as string}
        total={Number(inv.total)}
        phone={(party?.phone as string) ?? ""}
        url={typeof window !== "undefined" ? window.location.href : ""}
      />
    </AppShell>
  );
}

function InvoiceReceipt({
  paperClass, settings, inv, items, party, payments, date, kind,
}: {
  paperClass: string;
  settings: { showLogo: boolean; logoUrl: string; pharmacyName: string; address: string; mobile: string; header: string; thankYou: string; terms: string; footer: string };
  inv: AnyRec; items: AnyRec[]; party: AnyRec | null; payments: AnyRec[]; date: string; kind: "sale" | "purchase";
}) {
  return (
    <div className="invoice-print-area flex justify-center">
      <Card className={`${paperClass} shadow-card print:shadow-none print:border-0`}>
        <CardContent className="space-y-3 p-4 font-mono text-xs">
          <div className="text-center">
            {settings.showLogo && settings.logoUrl && (
              <img src={settings.logoUrl} alt="" className="mx-auto mb-1 h-12 object-contain" />
            )}
            <div className="text-sm font-bold">{settings.pharmacyName}</div>
            {settings.address && <div>{settings.address}</div>}
            {settings.mobile && <div>Mobile: {settings.mobile}</div>}
            {settings.header && <div className="mt-1">{settings.header}</div>}
          </div>
          <div className="border-t border-dashed pt-2">
            <div className="flex justify-between"><span>Invoice:</span><span>{inv.invoice_no as string}</span></div>
            <div className="flex justify-between"><span>Date:</span><span>{new Date(date).toLocaleString()}</span></div>
            {party && (
              <>
                <div className="flex justify-between"><span>{kind === "sale" ? "Customer" : "Supplier"}:</span><span>{party.name as string}</span></div>
                {party.phone ? <div className="flex justify-between"><span>Mobile:</span><span>{party.phone as string}</span></div> : null}
              </>
            )}
          </div>
          <div className="border-t border-dashed pt-2">
            <div className="flex justify-between font-bold"><span>Item</span><span>Total</span></div>
            {items.map((it, i) => (
              <div key={i} className="mt-1">
                <div>{(it.name as string) ?? (it.product_name as string) ?? `Item ${i + 1}`}</div>
                <div className="flex justify-between">
                  <span>{Number(it.qty ?? 0)} × ৳{Number(it.rate ?? it.unit_price ?? 0).toFixed(2)}</span>
                  <span>৳{(Number(it.qty ?? 0) * Number(it.rate ?? it.unit_price ?? 0)).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed pt-2 space-y-0.5">
            <div className="flex justify-between"><span>Subtotal</span><span>৳{Number(inv.subtotal).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>৳{Number(inv.discount).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>VAT</span><span>৳{Number(inv.vat).toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-sm"><span>Total</span><span>৳{Number(inv.total).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Paid</span><span>৳{Number(inv.paid).toFixed(2)}</span></div>
            {Number(inv.due) > 0 && <div className="flex justify-between text-destructive"><span>Due</span><span>৳{Number(inv.due).toFixed(2)}</span></div>}
          </div>
          {payments.length > 0 && (
            <div className="border-t border-dashed pt-2">
              <div className="font-bold">Payments</div>
              {payments.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span>{p.method as string}{p.reference ? ` (${p.reference as string})` : ""}</span>
                  <span>৳{Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-dashed pt-2 text-left">
            {settings.terms && <div className="mt-1 whitespace-pre-line opacity-70">{settings.terms}</div>}
            {settings.footer && <div className="mt-2 whitespace-pre-line pt-2">{settings.footer}</div>}
            <div className="mt-2 text-center"><Badge variant="outline">{inv.status as string}</Badge></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentsTab({ payments, total, paid, due }: { payments: AnyRec[]; total: number; paid: number; due: number }) {
  const { t } = useTranslation();
  return (
    <Card className="mx-auto max-w-2xl">
      <CardContent className="space-y-4 p-6 text-sm">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">{t("ipos.totalLbl")}</div>
            <div className="text-lg font-bold">৳ {total.toFixed(2)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">{t("ipos.paidLbl")}</div>
            <div className="text-lg font-bold text-success">৳ {paid.toFixed(2)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">{t("ipos.dueLbl")}</div>
            <div className={`text-lg font-bold ${due > 0 ? "text-destructive" : ""}`}>৳ {due.toFixed(2)}</div>
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground">{t("ipos.noPayments")}</div>
        ) : (
          <div className="divide-y rounded-md border">
            {payments.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-medium capitalize">{p.method as string}</div>
                  {p.reference ? <div className="text-xs text-muted-foreground">{t("ipos.refLbl")} {p.reference as string}</div> : null}
                  {p.created_at ? <div className="text-xs text-muted-foreground">{new Date(p.created_at as string).toLocaleString()}</div> : null}
                </div>
                <div className="font-mono font-semibold">৳ {Number(p.amount).toFixed(2)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryTab({
  createdAt, cashierName, history,
}: { createdAt: string; cashierName: string | null; history: InvoiceEditHistoryRow[] }) {
  const { t } = useTranslation();
  return (
    <Card className="mx-auto max-w-3xl">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" />
          <span>{t("ipos.historyDesc")}</span>
        </div>
        <ol className="relative ml-3 space-y-6 border-l pl-6">
          <TimelineDot tone="success" />
          <li className="-mt-6 ml-0">
            <div className="text-sm font-semibold">{t("ipos.invoiceCreated")}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(createdAt).toLocaleString()}
              {cashierName ? t("ipos.byPrefix", { name: cashierName }) : ""}
            </div>
          </li>
          {history.length === 0 ? (
            <li className="ml-0 text-sm text-muted-foreground">{t("ipos.noEdits")}</li>
          ) : (
            history.map((h) => <HistoryEntry key={h.id} entry={h} />)
          )}
        </ol>
      </CardContent>
    </Card>
  );
}

function TimelineDot({ tone }: { tone: "success" | "warning" }) {
  const cls = tone === "success" ? "bg-success" : "bg-amber-500";
  return (
    <span className={`absolute -left-[7px] mt-1 inline-block h-3 w-3 rounded-full ring-4 ring-background ${cls}`} />
  );
}

function HistoryEntry({ entry }: { entry: InvoiceEditHistoryRow }) {
  const { t } = useTranslation();
  const totalDelta = entry.new_total - entry.old_total;
  const dueDelta = entry.new_due - entry.old_due;
  return (
    <li className="relative ml-0">
      <span className="absolute -left-[31px] mt-1 inline-block h-3 w-3 rounded-full bg-amber-500 ring-4 ring-background" />
      <div className="text-sm font-semibold">
        {entry.editor_name ? t("ipos.editedBy", { name: entry.editor_name }) : t("ipos.edited")}
      </div>
      <div className="text-xs text-muted-foreground">{new Date(entry.edited_at).toLocaleString()}</div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        <Delta label={t("ipos.totalLbl")} oldVal={entry.old_total} newVal={entry.new_total} delta={totalDelta} />
        <Delta label={t("ipos.paidLbl")} oldVal={entry.old_paid} newVal={entry.new_paid} delta={entry.new_paid - entry.old_paid} />
        <Delta label={t("ipos.dueLbl")} oldVal={entry.old_due} newVal={entry.new_due} delta={dueDelta} invertGood />
      </div>
      {entry.reason && (
        <div className="mt-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs">
          <span className="font-medium">{t("ipos.noteLbl")}</span>{entry.reason}
        </div>
      )}
      <ItemsDiff oldItems={entry.old_items} newItems={entry.new_items} />
    </li>
  );
}

function Delta({ label, oldVal, newVal, delta, invertGood }: { label: string; oldVal: number; newVal: number; delta: number; invertGood?: boolean }) {
  const good = invertGood ? delta < 0 : delta > 0;
  const bad = invertGood ? delta > 0 : delta < 0;
  const tone = delta === 0 ? "text-muted-foreground" : good ? "text-success" : bad ? "text-destructive" : "";
  const Icon = delta === 0 ? null : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1 font-mono text-sm">
        <span className="text-muted-foreground line-through">৳{oldVal.toFixed(2)}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-semibold">৳{newVal.toFixed(2)}</span>
      </div>
      {delta !== 0 && Icon && (
        <div className={`flex items-center gap-0.5 text-xs ${tone}`}>
          <Icon className="h-3 w-3" />
          ৳{Math.abs(delta).toFixed(2)}
        </div>
      )}
    </div>
  );
}

function ItemsDiff({ oldItems, newItems }: { oldItems: HistoryItem[]; newItems: HistoryItem[] }) {
  const sigOld = JSON.stringify(oldItems.map((i) => [i.product_id, i.qty, i.unit_price]));
  const sigNew = JSON.stringify(newItems.map((i) => [i.product_id, i.qty, i.unit_price]));
  if (sigOld === sigNew) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        View item changes ({oldItems.length} → {newItems.length})
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-2">
        <ItemList title="Before" items={oldItems} />
        <ItemList title="After" items={newItems} />
      </div>
    </details>
  );
}

function ItemList({ title, items }: { title: string; items: HistoryItem[] }) {
  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/40 px-3 py-1.5 font-medium">{title}</div>
      {items.length === 0 ? (
        <div className="px-3 py-2 text-muted-foreground">—</div>
      ) : (
        <ul className="divide-y">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2 px-3 py-1.5">
              <span className="truncate">{it.product_name ?? "Item"}</span>
              <span className="font-mono whitespace-nowrap">
                {Number(it.qty)} × ৳{Number(it.unit_price).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
