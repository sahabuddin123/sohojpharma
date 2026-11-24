import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { listProductCompanies, upsertProductCompany, deleteProductCompany } from "@/lib/api/product-management.functions";
import { ExportCatalogButton } from "@/components/catalog/export-catalog-button";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/products/companies")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Companies — SohojPharma" }, { name: "description", content: "Manage pharmaceutical companies and manufacturers." }] }),
  component: CompaniesPage,
});

type Row = { id: string; name: string; code: string | null; country: string | null; address: string | null; phone: string | null; email: string | null; status: string };
const PAGE = 25;

function CompaniesPage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const list = useServerFn(listProductCompanies);
  const remove = useServerFn(deleteProductCompany);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["product-companies", tenantId, search, page],
    enabled: !!tenantId,
    queryFn: () => list({ data: { tenantId, search: search || undefined, page, pageSize: PAGE } }),
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { tenantId, id } }),
    onSuccess: () => { toast.success(t("toast.deleted")); qc.invalidateQueries({ queryKey: ["product-companies"] }); qc.invalidateQueries({ queryKey: ["product-companies-options"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data?.rows ?? []) as Row[];
  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <AppShell variant="store" title={t("pinv.companiesTitle")}>
      <PageHeader title={t("pinv.companiesTitle")} description={t("pinv.companiesDescTpl", { n: total })} actions={<div className="flex items-center gap-2"><ExportCatalogButton kind="companies" tenantId={tenantId} /><Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t("pinv.newCompany")}</Button></div>} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={t("pinv.searchCompanyPh")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader><TableRow><TableHead>{t("pinv.colName")}</TableHead><TableHead>{t("pinv.colCode")}</TableHead><TableHead>{t("pinv.colCountry")}</TableHead><TableHead>{t("pinv.colPhone")}</TableHead><TableHead>{t("pinv.colEmail")}</TableHead><TableHead>{t("pinv.colStatus")}</TableHead><TableHead className="w-24 text-right">{t("pinv.colActions")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">{t("pinv.noCompaniesFound")}</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{r.code || "—"}</TableCell>
                    <TableCell>{r.country || "—"}</TableCell>
                    <TableCell>{r.phone || "—"}</TableCell>
                    <TableCell>{r.email || "—"}</TableCell>
                    <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(t("pinv.confirmDelete", { name: r.name }))) del.mutate(r.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{t("pinv.pageOf", { p: page, n: pages })}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("pinv.prev")}</Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>{t("pinv.next")}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <CompanyDialog open={open} onOpenChange={setOpen} tenantId={tenantId} initial={editing} onSaved={() => { qc.invalidateQueries({ queryKey: ["product-companies"] }); qc.invalidateQueries({ queryKey: ["product-companies-options"] }); }} />
    </AppShell>
  );
}

function CompanyDialog({ open, onOpenChange, tenantId, initial, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; initial: Row | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const save = useServerFn(upsertProductCompany);
  const [form, setForm] = useState(() => initial
    ? { name: initial.name, code: initial.code ?? "", country: initial.country ?? "", address: initial.address ?? "", phone: initial.phone ?? "", email: initial.email ?? "", status: (initial.status === "inactive" ? "inactive" : "active") as "active" | "inactive" }
    : { name: "", code: "", country: "", address: "", phone: "", email: "", status: "active" as "active" | "inactive" });
  useEffect(() => {
    if (open) setForm(initial
      ? { name: initial.name, code: initial.code ?? "", country: initial.country ?? "", address: initial.address ?? "", phone: initial.phone ?? "", email: initial.email ?? "", status: initial.status === "inactive" ? "inactive" : "active" }
      : { name: "", code: "", country: "", address: "", phone: "", email: "", status: "active" });
  }, [initial, open]);
  const m = useMutation({
    mutationFn: () => save({ data: { tenantId, id: initial?.id, name: form.name.trim(), code: form.code || null, country: form.country || null, address: form.address || null, phone: form.phone || null, email: form.email || null, status: form.status } }),
    onSuccess: () => { toast.success(initial ? t("pinv.updatedToast") : t("pinv.createdToast")); onSaved(); onOpenChange(false); setForm({ name: "", code: "", country: "", address: "", phone: "", email: "", status: "active" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? t("pinv.editCompany") : t("pinv.newCompany")}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1"><Label>{t("pinv.nameStar")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t("pinv.codeLbl")}</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t("pinv.countryLbl")}</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t("pinv.phoneLbl")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t("pinv.emailLbl")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="col-span-2 space-y-1"><Label>{t("pinv.addressLbl")}</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t("pinv.statusLbl")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">{t("pinv.activeOpt")}</SelectItem><SelectItem value="inactive">{t("pinv.inactiveOpt")}</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("pinv.cancelBtn")}</Button>
          <Button disabled={!form.name.trim() || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("pinv.saveBtn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
