import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { IdCard, Loader2, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { deleteStaff, listStaff, upsertStaff } from "@/lib/api/staff.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/staff")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "কর্মচারী — SohojPharma" },
      { name: "description", content: "কর্মচারী তালিকা, বেতন ও তথ্য পরিচালনা করুন।" },
    ],
  }),
  component: MobileStaff,
});

const DESIGNATIONS = [
  "Pharmacist",
  "Sales Associate",
  "Cashier",
  "Manager",
  "Stock Keeper",
  "Delivery",
] as const;

type StaffRow = {
  id: string;
  employee_code: string | null;
  full_name: string;
  designation: string | null;
  phone: string | null;
  email: string | null;
  join_date: string | null;
  basic_salary: number | null;
  status: "active" | "inactive" | "terminated";
};

function MobileStaff() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const listFn = useServerFn(listStaff);
  const saveFn = useServerFn(upsertStaff);
  const delFn = useServerFn(deleteStaff);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [delTarget, setDelTarget] = useState<StaffRow | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    designation: "Sales Associate",
    phone: "",
    email: "",
    basic_salary: "",
    join_date: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
    status: "active" as "active" | "inactive" | "terminated",
  });

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["m-staff", tenantId],
    enabled: !!tenantId,
    queryFn: async () => (await listFn({ data: { tenant_id: tenantId } })) as unknown as StaffRow[],
  });

  const activeSalary = useMemo(
    () =>
      staff
        .filter((s) => s.status === "active")
        .reduce((sum, s) => sum + Number(s.basic_salary ?? 0), 0),
    [staff],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (statusFilter === "active" && s.status !== "active") return false;
      if (statusFilter === "inactive" && s.status === "active") return false;
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        (s.designation?.toLowerCase().includes(q) ?? false) ||
        (s.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [staff, search, statusFilter]);

  const openNew = () => {
    setEditing(null);
    setForm({
      full_name: "",
      designation: "Sales Associate",
      phone: "",
      email: "",
      basic_salary: "",
      join_date: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: "active",
    });
    setFormOpen(true);
  };

  const openEdit = (s: StaffRow) => {
    setEditing(s);
    setForm({
      full_name: s.full_name,
      designation: s.designation || "Sales Associate",
      phone: s.phone ?? "",
      email: s.email ?? "",
      basic_salary: String(Number(s.basic_salary ?? 0)),
      join_date: s.join_date ?? new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: s.status,
    });
    setFormOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      if (!form.full_name.trim()) throw new Error("কর্মচারীর নাম দিন");
      return saveFn({
        data: {
          id: editing?.id,
          tenant_id: tenantId,
          full_name: form.full_name.trim(),
          designation: form.designation,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          basic_salary: Number(form.basic_salary) || 0,
          join_date: form.join_date || undefined,
          status: form.status,
        },
      });
    },
    onSuccess: () => {
      toast.success(editing ? "কর্মচারীর তথ্য আপডেট হয়েছে" : "নতুন কর্মচারী যোগ হয়েছে");
      qc.invalidateQueries({ queryKey: ["m-staff", tenantId] });
      qc.invalidateQueries({ queryKey: ["staff-list", tenantId] });
      setFormOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "সেভ করা যায়নি"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("কর্মচারী মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["m-staff", tenantId] });
      qc.invalidateQueries({ queryKey: ["staff-list", tenantId] });
      setDelTarget(null);
    },
    onError: (e: Error) => toast.error(e.message || "মুছে ফেলা যায়নি"),
  });

  return (
    <PhoneShell title="কর্মচারী" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="mint" value={staff.length} label="মোট কর্মচারী" />
        <PhoneKpi tone="sky" value={money(activeSalary)} label="মাসিক বেতন (সক্রিয়)" />
      </PhoneKpiGrid>

      <button
        type="button"
        onClick={openNew}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0d5c46] py-3 text-sm font-bold text-white shadow-xs hover:bg-[#094735] active:scale-[0.98] transition"
      >
        <Plus className="h-4 w-4" />
        নতুন কর্মচারী যোগ করুন
      </button>

      <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="নাম, পদবি বা ফোন খুঁজুন..."
            className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 text-xs"
          />
        </div>
        <div className="phone-grid-keep grid grid-cols-3 gap-1 rounded-full bg-[#e9eeea] p-1">
          {(
            [
              ["all", `সব (${staff.length})`],
              ["active", "সক্রিয়"],
              ["inactive", "নিষ্ক্রিয়"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={cn(
                "rounded-full py-1.5 text-[11px] font-semibold transition",
                statusFilter === key
                  ? "bg-white text-[#0d5c46] shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-2.5">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && filtered.length === 0 && (
          <PhoneEmpty message="কোনো কর্মচারী পাওয়া যায়নি" />
        )}
        {filtered.map((s) => (
          <div
            key={s.id}
            className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-700">
                  <IdCard className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-slate-900">{s.full_name}</p>
                  <p className="truncate text-xs text-slate-500">{s.designation ?? "—"}</p>
                  {s.phone && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#0d5c46]">
                      <Phone className="h-3 w-3" /> {s.phone}
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[10px] font-bold",
                    s.status === "active"
                      ? "bg-emerald-50 text-[#0d5c46]"
                      : "bg-rose-50 text-rose-600",
                  )}
                >
                  {s.status === "active" ? "সক্রিয়" : s.status === "terminated" ? "বাতিল" : "নিষ্ক্রিয়"}
                </span>
                <p className="mt-1 text-xs font-extrabold text-slate-900">
                  {money(s.basic_salary ?? 0)}
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => openEdit(s)}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Pencil className="h-3.5 w-3.5" /> এডিট
              </button>
              <button
                type="button"
                onClick={() => setDelTarget(s)}
                className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" /> মুছুন
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Staff Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing ? "কর্মচারী তথ্য এডিট" : "নতুন কর্মচারী যোগ করুন"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">পূর্ণ নাম *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="যেমন: মো. করিম"
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">পদবি</Label>
                <Select value={form.designation} onValueChange={(v) => setForm((f) => ({ ...f, designation: v }))}>
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESIGNATIONS.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">অবস্থা</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as any }))}>
                  <SelectTrigger className="h-10 rounded-xl text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">সক্রিয়</SelectItem>
                    <SelectItem value="inactive">নিষ্ক্রিয়</SelectItem>
                    <SelectItem value="terminated">বাতিল</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">মোবাইল</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="017..."
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">মাসিক বেতন (৳)</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.basic_salary}
                  onChange={(e) => setForm((f) => ({ ...f, basic_salary: e.target.value }))}
                  placeholder="0"
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">যোগদানের তারিখ</Label>
              <Input
                type="date"
                value={form.join_date}
                onChange={(e) => setForm((f) => ({ ...f, join_date: e.target.value }))}
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              বাতিল
            </Button>
            <Button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="bg-[#0d5c46] hover:bg-[#094735] text-white"
            >
              {saveMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {saveMut.isPending ? "সেভ হচ্ছে..." : "সেভ করুন"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent className="w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>কর্মচারী মুছে ফেলবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              "{delTarget?.full_name}" স্থায়ীভাবে মুছে ফেলা হবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>না</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => delTarget && delMut.mutate(delTarget.id)}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              হ্যাঁ, মুছুন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PhoneShell>
  );
}
