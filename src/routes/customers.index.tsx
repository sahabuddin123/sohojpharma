import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Phone, Mail, Search, Loader2, MoreVertical, Eye, Pencil,
  FileText, BookOpen, Wallet, Trash2, Share2, MessageCircle, AlertCircle, CheckCircle2
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cacheCustomers, listCachedCustomers } from "@/lib/offline/db";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";
import { toast } from "sonner";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { CollectPaymentDialog, type DueCustomer } from "@/components/pos/customer-due-dialogs";


export const Route = createFileRoute("/customers/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Customers — SohojPharma" },
      { name: "description", content: "Customer directory, loyalty and prescription history." },
    ],
  }),
  component: CustomersPage,
});

type CustomerRow = {
  id: string;
  customer_code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  nid_passport: string | null;
  type: string | null;
  due_balance: number | null;
  credit_limit: number | null;
  is_active: boolean | null;
};

const TYPE_STYLES: Record<string, string> = {
  retail: "border-primary/30 bg-primary/10 text-primary",
  dealer: "border-secondary/30 bg-secondary/10 text-secondary",
  wholesale: "border-success/30 bg-success/10 text-success",
};

function CustomersPage() {
  const { t } = useTranslation();
  const { currentTenantId, user } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [dueFilter, setDueFilter] = useState<"all" | "due" | "inactive_30">("all");
  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [collectFor, setCollectFor] = useState<DueCustomer | null>(null);

  const getInactivityDays = (lastDateStr: string | null) => {
    if (!lastDateStr) return null;
    const last = new Date(lastDateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - last.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const sendWhatsAppReminder = (c: CustomerRow) => {
    const raw = (c.phone || "").replace(/[^0-9]/g, "");
    if (!raw) {
      toast.error("কাস্টমারের কোনো ফোন নম্বর নেই");
      return;
    }
    const formatted = raw.startsWith("88") ? raw : raw.startsWith("0") ? "88" + raw : "880" + raw;
    const due = Number(c.due_balance || 0);
    const msg = encodeURIComponent(`আসসালামু আলাইকুম ${c.name}, আপনার ফার্মেসি বকেয়া পাওনা ৳${due.toLocaleString("en-IN")} টাকা। অনুগ্রহ করে পরিশোধের অনুরোধ জানাচ্ছি। ধন্যবাদ!`);
    window.open(`https://wa.me/${formatted}?text=${msg}`, "_blank");
  };


  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers-list", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<CustomerRow[]> => {
      const loadCached = async (): Promise<CustomerRow[]> =>
        (await listCachedCustomers(tenantId)).map((c) => ({
          id: c.id,
          customer_code: c.customer_code ?? null,
          name: c.name,
          phone: c.phone,
          email: c.email ?? null,
          nid_passport: null,
          type: c.type ?? "retail",
          due_balance: c.due_balance,
          credit_limit: c.credit_limit ?? 0,
          is_active: true,
        }));

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await loadCached();
      }
      try {
        const { data, error } = await supabase
          .from("v_customer_due")
          .select("id:customer_id,customer_code,name,phone,email,nid_passport,type,due_balance,credit_limit,is_active")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("name")
          .limit(500);
        if (error) throw error;
        const rows = (data ?? [])
          .filter((c) => c.id && c.name)
          .map((c) => ({
            id: c.id!,
            customer_code: c.customer_code,
            name: c.name!,
            phone: c.phone,
            email: c.email,
            nid_passport: c.nid_passport,
            type: c.type,
            due_balance: c.due_balance,
            credit_limit: c.credit_limit,
            is_active: c.is_active,
          }));
        void cacheCustomers(
          tenantId,
          rows.map((c) => ({
            id: c.id,
            customer_code: c.customer_code,
            name: c.name,
            phone: c.phone,
            email: c.email,
            type: c.type,
            due_balance: Number(c.due_balance ?? 0),
            credit_limit: c.credit_limit != null ? Number(c.credit_limit) : null,
          })),
        ).catch(() => {});

        const cached = await listCachedCustomers(tenantId).catch(() => []);
        const pendingLocal: CustomerRow[] = cached
          .filter((c) => c.pendingSync)
          .map((c) => ({
            id: c.id,
            customer_code: c.customer_code ?? null,
            name: c.name,
            phone: c.phone,
            email: c.email ?? null,
            nid_passport: null,
            type: c.type ?? "retail",
            due_balance: c.due_balance,
            credit_limit: c.credit_limit ?? 0,
            is_active: true,
          }));
        const seen = new Set(rows.map((r) => r.id));
        return [...pendingLocal.filter((p) => !seen.has(p.id)), ...rows];
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await loadCached();
        }
        throw err;
      }
    },
  });

  const { data: salesAgg = {} } = useQuery({
    queryKey: ["customers-sales-agg", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Record<string, { count: number; total: number; last: string | null }>> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return {};
      try {
        const { data, error } = await supabase
          .from("sales")
          .select("customer_id,total,sale_date,status")
          .eq("tenant_id", tenantId)
          .not("customer_id", "is", null)
          .neq("status", "void")
          .limit(20000);
        if (error) throw error;
        const map: Record<string, { count: number; total: number; last: string | null }> = {};
        for (const r of data ?? []) {
          const cid = r.customer_id as string;
          if (!map[cid]) map[cid] = { count: 0, total: 0, last: null };
          map[cid].count += 1;
          map[cid].total += Number(r.total ?? 0);
          if (!map[cid].last || (r.sale_date && r.sale_date > map[cid].last)) {
            map[cid].last = r.sale_date as string;
          }
        }
        return map;
      } catch {
        return {};
      }
    },
  });

  const kpis = useMemo(() => ({
    total: customers.length,
    retail: customers.filter((c) => (c.type ?? "retail") === "retail").length,
    dealer: customers.filter((c) => c.type === "dealer").length,
    wholesale: customers.filter((c) => c.type === "wholesale").length,
    withDue: customers.filter((c) => Number(c.due_balance ?? 0) > 0).length,
    inactive: customers.filter((c) => c.is_active === false).length,
  }), [customers]);

  const softDelete = useMutation({
    mutationFn: async (id: string) => {
      const before = customers.find((c) => c.id === id);
      const { error } = await supabase
        .from("customers")
        .update({ is_active: false })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      await supabase.from("audit_log").insert({
        tenant_id: tenantId,
        user_id: user?.id ?? null,
        action: "customer.deleted",
        entity_table: "customers",
        entity_id: id,
        before_data: before ? (before as never) : null,
        after_data: { is_active: false } as never,
      });
    },
    onSuccess: () => {
      toast.success(t("cust.custList.deleted", { defaultValue: "Customer deleted" }));
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["customers-list", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const totalDueSum = useMemo(() => {
    return customers.reduce((sum, c) => sum + Math.max(0, Number(c.due_balance) || 0), 0);
  }, [customers]);

  const dueCustomersCount = useMemo(() => {
    return customers.filter((c) => (Number(c.due_balance) || 0) > 0).length;
  }, [customers]);

  const filtered = customers.filter((c) => {
    if (filter !== "all" && (c.type ?? "retail") !== filter) return false;
    const due = Number(c.due_balance || 0);
    const last = salesAgg[c.id]?.last ?? null;
    const inactDays = getInactivityDays(last);

    if (dueFilter === "due" && due <= 0) return false;
    if (dueFilter === "inactive_30") {
      if (inactDays === null || inactDays < 30) return false;
    }

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.customer_code ?? "").toLowerCase().includes(q) ||
      (c.nid_passport ?? "").toLowerCase().includes(q)
    );
  });


  return (
    <AppShell variant="store" title={t("nav.customers")}>
      <PageHeader
        title={t("cust.custList.title")}
        description={t("cust.custList.desc")}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> {t("cust.custList.add")}
          </Button>
        }
      />

      {/* Baki Khata Summary Banner */}
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-center gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-lg font-bold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-900/60 dark:text-emerald-300">
            ৳
          </div>
          <div>
            <span className="block text-xs font-medium text-emerald-700 dark:text-emerald-300">
              বাকির খাতা (Due Book Summary)
            </span>
            <span className="mt-0.5 block text-2xl font-bold tracking-tight tabular-nums text-emerald-950 dark:text-emerald-100">
              ৳ {totalDueSum.toLocaleString("en-IN")} পাওনা · {dueCustomersCount} জনের বাকি
            </span>
          </div>
        </div>

        {/* 3 Baki Filter Pills: [সব] [বাকি] [৩০+ দিন আসেনি] */}
        <div className="inline-flex self-start rounded-xl border border-slate-200/80 bg-white/90 p-1 text-xs font-medium dark:border-slate-800 dark:bg-slate-900 sm:self-auto">
          <button
            type="button"
            onClick={() => setDueFilter("all")}
            className={`rounded-lg px-3 py-1.5 transition-all ${dueFilter === "all" ? "bg-emerald-700 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"}`}
          >
            সব ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => setDueFilter("due")}
            className={`rounded-lg px-3 py-1.5 transition-all ${dueFilter === "due" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"}`}
          >
            বাকি ({dueCustomersCount})
          </button>
          <button
            type="button"
            onClick={() => setDueFilter("inactive_30")}
            className={`rounded-lg px-3 py-1.5 transition-all ${dueFilter === "inactive_30" ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-950/60 dark:text-rose-300" : "text-slate-600 hover:text-slate-900 dark:text-slate-400"}`}
          >
            ৩০+ দিন আসেনি
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total", value: kpis.total, tone: "text-foreground" },
          { label: "Retail", value: kpis.retail, tone: "text-primary" },
          { label: "Dealer", value: kpis.dealer, tone: "text-secondary" },
          { label: "Wholesale", value: kpis.wholesale, tone: "text-success" },
          { label: "With Due", value: kpis.withDue, tone: "text-destructive" },
          { label: "Inactive", value: kpis.inactive, tone: "text-muted-foreground" },
        ].map((k) => (
          <Card key={k.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
              <p className={`mt-1 text-2xl font-bold ${k.tone}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-5 shadow-card">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("cust.custList.searchPh")}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="all">{t("cust.custList.all")}</TabsTrigger>
              <TabsTrigger value="retail">{t("cust.custList.retail")}</TabsTrigger>
              <TabsTrigger value="dealer">{t("cust.custList.dealer")}</TabsTrigger>
              <TabsTrigger value="wholesale">{t("cust.custList.wholesale")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">{t("cust.custList.none")}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => {
            const type = (c.type ?? "retail").toLowerCase();
            const due = Number(c.due_balance ?? 0);
            const agg = salesAgg[c.id] ?? { count: 0, total: 0, last: null };
            const code = c.customer_code ?? "—";
            return (
              <Card key={c.id} className="shadow-card transition-shadow hover:shadow-elevated">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Link to="/customers/$id" params={{ id: c.id }} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar className="h-11 w-11">
                        <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                          {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.name}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{code}</p>
                      </div>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}>
                          <Eye className="mr-2 h-4 w-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditId(c.id)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/customers/$id/statement", params: { id: c.id } })}>
                          <FileText className="mr-2 h-4 w-4" /> Statement
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/accounts/ledger" })}>
                          <BookOpen className="mr-2 h-4 w-4" /> Ledger
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setCollectFor({
                          customer_id: c.id, name: c.name, phone: c.phone,
                          net_due: Number(c.due_balance ?? 0), open_invoice_due: Number(c.due_balance ?? 0),
                          code: c.customer_code,
                        })}>
                          <Wallet className="mr-2 h-4 w-4" /> Collect Payment
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(c.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={TYPE_STYLES[type] ?? TYPE_STYLES.retail}>
                      {type}
                    </Badge>
                    {due > 0 ? (
                      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive font-bold">৳{due.toLocaleString()} বাকি</Badge>
                    ) : (
                      <Badge className="bg-success text-success-foreground hover:bg-success">পরিশোধিত</Badge>
                    )}
                    {(() => {
                      const inactDays = getInactivityDays(agg.last);
                      if (inactDays === null) return <Badge variant="outline" className="text-[10px]">নতুন কাস্টমার</Badge>;
                      if (inactDays === 0) return <Badge className="bg-emerald-600 text-white text-[10px]">আজ লেনদেন</Badge>;
                      if (inactDays < 30) return <Badge variant="secondary" className="text-[10px]">{inactDays} দিন আগে</Badge>;
                      return (
                        <Badge className="bg-rose-600 text-white text-[10px] font-bold">
                          {inactDays} দিন আসেনি
                        </Badge>
                      );
                    })()}
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {c.phone ?? "—"}</p>
                      {due > 0 && c.phone && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendWhatsAppReminder(c)}
                          className="h-6 text-[10px] font-bold gap-1 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-50 px-2"
                          title="হোয়াটসঅ্যাপে তাগাদা পাঠান"
                        >
                          <MessageCircle className="h-3 w-3" /> তাগাদা
                        </Button>
                      )}
                    </div>
                    <p className="flex items-center gap-2 truncate"><Mail className="h-3.5 w-3.5" /> {c.email ?? "—"}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("cust.custList.credit")}</p>
                      <p className="text-base font-bold">৳ {Number(c.credit_limit ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t("cust.custList.due")}</p>
                      <p className={`text-base font-bold ${due > 0 ? "text-destructive" : "text-success"}`}>
                        ৳ {due.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Orders</p>
                      <p className="text-sm font-semibold">{agg.count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Purchased</p>
                      <p className="text-sm font-semibold">৳ {Math.round(agg.total).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last</p>
                      <p className="text-sm font-semibold">{agg.last ? new Date(agg.last).toLocaleDateString() : "—"}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-0 text-xs"
                      title="View"
                      onClick={() => navigate({ to: "/customers/$id", params: { id: c.id } })}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-0 text-xs"
                      title="Edit"
                      onClick={() => setEditId(c.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-0 text-xs"
                      title="Statement"
                      onClick={() => navigate({ to: "/customers/$id/statement", params: { id: c.id } })}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-0 text-xs"
                      title="Collect Payment"
                      onClick={() => setCollectFor({
                        customer_id: c.id, name: c.name, phone: c.phone,
                        net_due: Number(c.due_balance ?? 0), open_invoice_due: Number(c.due_balance ?? 0),
                        code: c.customer_code,
                      })}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                    </Button>

                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this customer?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer will be soft-deleted and hidden from the list. Their ledger, sales
              and audit history remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && softDelete.mutate(deleteId)}
              disabled={softDelete.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {softDelete.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerFormDialog
        mode="create"
        open={open}
        onOpenChange={setOpen}
      />

      <EditCustomerDialog
        customerId={editId}
        open={!!editId}
        onOpenChange={(o) => !o && setEditId(null)}
      />

      <CollectPaymentDialog
        open={!!collectFor}
        onOpenChange={(o) => !o && setCollectFor(null)}
        customer={collectFor}
      />

    </AppShell>

  );
}
