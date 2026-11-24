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
import { listProductGenerics, upsertProductGeneric, deleteProductGeneric } from "@/lib/api/product-management.functions";
import { ExportCatalogButton } from "@/components/catalog/export-catalog-button";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/products/generics")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Generics — SohojPharma" }, { name: "description", content: "Manage generic medicine names and active ingredients." }] }),
  component: GenericsPage,
});

type Row = { id: string; name: string; description: string | null; status: string };
const PAGE = 25;

function GenericsPage() {

  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const list = useServerFn(listProductGenerics);
  const remove = useServerFn(deleteProductGeneric);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["product-generics-page", tenantId, search, page],
    enabled: !!tenantId,
    queryFn: () => list({ data: { tenantId, search: search || undefined, page, pageSize: PAGE } }),
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { tenantId, id } }),
    onSuccess: () => { toast.success(t("toast.deleted")); qc.invalidateQueries({ queryKey: ["product-generics-page"] }); qc.invalidateQueries({ queryKey: ["product-generics-options"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data?.rows ?? []) as Row[];
  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <AppShell variant="store" title={t("pinv.genericsTitle")}>
      <PageHeader title={t("pinv.genericsTitle")} description={t("pinv.genericsDescTpl", { n: total })} actions={<div className="flex items-center gap-2"><ExportCatalogButton kind="generics" tenantId={tenantId} /><Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />{t("pinv.newGeneric")}</Button></div>} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={t("pinv.searchGenericPh")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          {/* Mobile card list */}
          <div className="space-y-3 md:hidden">
            {q.isLoading ? (
              <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("pinv.noGenericsFound")}</p>
            ) : rows.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug break-words">{r.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground break-words">{r.description || "—"}</p>
                  </div>
                  <Badge variant={r.status === "active" ? "default" : "secondary"} className="shrink-0">{r.status}</Badge>
                </div>
                <div className="mt-2 flex justify-end gap-1 border-t pt-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="mr-1 h-3.5 w-3.5" />{t("pinv.editGeneric")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm(t("pinv.confirmDelete", { name: r.name }))) del.mutate(r.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader><TableRow><TableHead>{t("pinv.colGenericName")}</TableHead><TableHead>{t("pinv.colDescription")}</TableHead><TableHead>{t("pinv.colStatus")}</TableHead><TableHead className="w-24 text-right">{t("pinv.colActions")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">{t("pinv.noGenericsFound")}</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">{r.description || "—"}</TableCell>
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
      <GenericDialog open={open} onOpenChange={setOpen} tenantId={tenantId} initial={editing} onSaved={() => { qc.invalidateQueries({ queryKey: ["product-generics-page"] }); qc.invalidateQueries({ queryKey: ["product-generics-options"] }); }} />
    </AppShell>
  );
}

function GenericDialog({ open, onOpenChange, tenantId, initial, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string; initial: Row | null; onSaved: () => void }) {
  const { t } = useTranslation();
  const save = useServerFn(upsertProductGeneric);
  const [form, setForm] = useState(() => initial
    ? { generic_name: initial.name, description: initial.description ?? "", status: (initial.status === "inactive" ? "inactive" : "active") as "active" | "inactive" }
    : { generic_name: "", description: "", status: "active" as "active" | "inactive" });
  useEffect(() => {
    if (open) setForm(initial
      ? { generic_name: initial.name, description: initial.description ?? "", status: initial.status === "inactive" ? "inactive" : "active" }
      : { generic_name: "", description: "", status: "active" });
  }, [initial, open]);

  const m = useMutation({
    mutationFn: () => save({ data: { tenantId, id: initial?.id, generic_name: form.generic_name.trim(), description: form.description || null, status: form.status } }),
    onSuccess: () => { toast.success(initial ? t("pinv.updatedToast") : t("pinv.createdToast")); onSaved(); onOpenChange(false); setForm({ generic_name: "", description: "", status: "active" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? t("pinv.editGeneric") : t("pinv.newGeneric")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label>{t("pinv.genericNameStar")}</Label><Input value={form.generic_name} onChange={(e) => setForm({ ...form, generic_name: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t("pinv.descriptionLbl")}</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t("pinv.statusLbl")}</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">{t("pinv.activeOpt")}</SelectItem><SelectItem value="inactive">{t("pinv.inactiveOpt")}</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("pinv.cancelBtn")}</Button>
          <Button disabled={!form.generic_name.trim() || m.isPending} onClick={() => m.mutate()}>{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("pinv.saveBtn")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
