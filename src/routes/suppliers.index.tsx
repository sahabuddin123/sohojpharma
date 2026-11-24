import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Eye, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Suppliers — SohojPharma" },
      { name: "description", content: "Supplier directory, ledger and reorder management." },
    ],
  }),
  component: SuppliersPage,
});

type SupplierRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  due_balance: number | null;
};

function SuppliersPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "", email: "" });

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers-list", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<SupplierRow[]> => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id,name,address,phone,email,due_balance")
        .eq("tenant_id", tenantId)
        .order("name")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SupplierRow[];
    },
  });

  const filtered = suppliers.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.phone ?? "").toLowerCase().includes(q);
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error(t("cust.suppList.nameReq"));
      const { error } = await supabase.from("suppliers").insert({
        tenant_id: tenantId,
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("cust.suppList.added"));
      setForm({ name: "", address: "", phone: "", email: "" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["suppliers-list", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell variant="store" title={t("nav.suppliers")}>
      <PageHeader
        title={t("cust.suppList.title")}
        description={t("cust.suppList.desc")}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" /> {t("cust.suppList.add")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("cust.suppList.newSupplier")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("cust.suppList.name")}</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("cust.suppList.address")}</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("cust.suppList.phone")}</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("cust.suppList.email")}</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t("common.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="shadow-card">
        <CardContent className="space-y-4 p-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("cust.suppList.searchPh")}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("cust.suppList.supplier")}</TableHead>
                  <TableHead>{t("cust.suppList.address")}</TableHead>
                  <TableHead>{t("cust.suppList.phone")}</TableHead>
                  <TableHead>{t("cust.suppList.email")}</TableHead>
                  <TableHead className="text-right">{t("cust.suppList.balance")}</TableHead>
                  <TableHead className="text-right">{t("cust.suppList.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("cust.suppList.none")}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((s) => {
                  const bal = Number(s.due_balance ?? 0);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.address ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.phone ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{s.email ?? "—"}</TableCell>
                      <TableCell className={`text-right font-semibold ${bal > 0 ? "text-destructive" : "text-success"}`}>
                        ৳ {bal.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" asChild>
                          <Link to="/suppliers/$id" params={{ id: s.id }}>
                            <Eye className="mr-1 h-4 w-4" /> {t("cust.suppList.view")}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
