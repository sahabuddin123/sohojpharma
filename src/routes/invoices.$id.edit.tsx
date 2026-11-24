import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { RouteErrorPanel, RouteNotFoundPanel } from "@/components/route-error";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Save } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { getInvoice, updateSaleInvoice } from "@/lib/api/invoices.functions";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/invoices/$id/edit")({
  head: () => ({ meta: [{ title: "Edit Invoice — SohojPharma" }] }),
  component: EditInvoicePage,
  errorComponent: (props) => <RouteErrorPanel {...props} />,
  notFoundComponent: () => <RouteNotFoundPanel label="Invoice" />,
});

type Line = { id: string; product_id: string; name: string; qty: number; unit_price: number; discount: number; vat: number };

function EditInvoicePage() {

  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const get = useServerFn(getInvoice);
  const update = useServerFn(updateSaleInvoice);

  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [locked, setLocked] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id, "sale", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => get({ data: { tenantId: currentTenantId!, kind: "sale", id } }),
  });

  useEffect(() => {
    if (!data) return;
    const inv = data.invoice as Record<string, unknown>;
    setNotes((inv.notes as string) ?? "");
    const items = (inv.items as Array<Record<string, unknown>>) ?? [];
    setLines(items.map((it) => ({
      id: it.id as string,
      product_id: it.product_id as string,
      name: (it.name as string) ?? (it.product_name as string) ?? ((it.product as { name?: string } | null)?.name) ?? "Item",
      qty: Number(it.qty ?? 0),
      unit_price: Number(it.unit_price ?? 0),
      discount: Number(it.discount ?? 0),
      vat: Number(it.vat ?? 0),
    })));
    if (inv.is_return) setLocked(t("ipos.lockedReturn"));
    else if (inv.status === "void") setLocked(t("ipos.lockedCancelled"));
    else if (inv.status === "completed" && Number(inv.paid) >= Number(inv.total))
      setLocked(t("ipos.lockedPaid"));
    else setLocked(null);
  }, [data, t]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const totalDiscount = lines.reduce((s, l) => s + l.discount, 0);
  const totalVat = lines.reduce((s, l) => s + l.vat, 0);
  const total = Math.max(0, subtotal - totalDiscount + totalVat);
  const paid = data ? Number((data.invoice as Record<string, unknown>).paid ?? 0) : 0;
  const due = Math.max(0, total - paid);

  const save = useMutation({
    mutationFn: () => update({ data: {
      tenantId: currentTenantId!, branchId: branchId!, id,
      notes: notes || null,
      items: lines.map((l) => ({
        id: l.id, qty: l.qty, unit_price: l.unit_price, discount: l.discount, vat: l.vat,
      })),
    }}),
    onSuccess: () => {
      toast.success(t("toast.invoiceUpdated"));
      navigate({ to: "/invoices/$id", params: { id }, search: { kind: "sale" } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = (i: number, key: keyof Line, v: number) =>
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [key]: v } : l));

  if (isLoading || !data) {
    return <AppShell variant="store" title={t("ipos.editTitle", { no: "" })}><div className="p-6 text-muted-foreground">{t("ipos.loading")}</div></AppShell>;
  }

  const inv = data.invoice as Record<string, unknown>;

  return (
    <AppShell variant="store" title={t("ipos.editTitle", { no: inv.invoice_no as string })}>
      <PageHeader
        title={t("ipos.editTitle", { no: inv.invoice_no as string })}
        description={t("ipos.editDesc")}
        actions={
          <Button asChild variant="outline">
            <Link to="/invoices/$id" params={{ id }} search={{ kind: "sale" }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> {t("ipos.backToView")}
            </Link>
          </Button>
        }
      />

      {locked && (
        <Card className="mb-4 border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{locked}</CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>{t("ipos.customerLbl")}</Label>
            <Input value={((inv.customer as Record<string, unknown> | null)?.name as string) ?? t("ipos.walkIn")} disabled />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>{t("ipos.notesLbl")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={!!locked} />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 shadow-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("ipos.th_item")}</TableHead>
                <TableHead className="w-24 text-right">{t("ipos.th_qty")}</TableHead>
                <TableHead className="w-28 text-right">{t("ipos.th_price")}</TableHead>
                <TableHead className="w-28 text-right">{t("ipos.th_discount")}</TableHead>
                <TableHead className="w-28 text-right">{t("ipos.th_vat")}</TableHead>
                <TableHead className="w-28 text-right">{t("ipos.th_lineTotal")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => {
                const lt = Math.max(0, l.qty * l.unit_price - l.discount + l.vat);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell><Input type="number" step="0.01" className="text-right" value={l.qty}
                      onChange={(e) => patch(i, "qty", Number(e.target.value))} disabled={!!locked} /></TableCell>
                    <TableCell><Input type="number" step="0.01" className="text-right" value={l.unit_price}
                      onChange={(e) => patch(i, "unit_price", Number(e.target.value))} disabled={!!locked} /></TableCell>
                    <TableCell><Input type="number" step="0.01" className="text-right" value={l.discount}
                      onChange={(e) => patch(i, "discount", Number(e.target.value))} disabled={!!locked} /></TableCell>
                    <TableCell><Input type="number" step="0.01" className="text-right" value={l.vat}
                      onChange={(e) => patch(i, "vat", Number(e.target.value))} disabled={!!locked} /></TableCell>
                    <TableCell className="text-right tabular-nums">৳ {lt.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardContent className="grid gap-1 p-4 sm:max-w-sm sm:ml-auto text-sm">
          <Row label={t("ipos.subtotalLbl")} value={subtotal} />
          <Row label={t("ipos.discountLbl")} value={totalDiscount} />
          <Row label={t("ipos.vatLbl")} value={totalVat} />
          <Row label={t("ipos.totalLbl")} value={total} bold />
          <Row label={t("ipos.paidLbl")} value={paid} />
          <Row label={t("ipos.dueLbl")} value={due} bold />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/invoices/$id", params: { id }, search: { kind: "sale" } })}>
          {t("ipos.cancelBtn")}
        </Button>
        <Button onClick={() => save.mutate()} disabled={!!locked || save.isPending || lines.length === 0}>
          <Save className="mr-1.5 h-4 w-4" /> {save.isPending ? t("ipos.savingChanges") : t("ipos.saveChanges")}
        </Button>
      </div>
    </AppShell>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span><span className="tabular-nums">৳ {value.toFixed(2)}</span>
    </div>
  );
}
