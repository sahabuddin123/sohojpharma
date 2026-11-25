import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Printer,
  Trash2,
  AlertTriangle,
  FastForward,
  User,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  getDenaPaonaList,
  createDenaPaonaEntry,
  deleteDenaPaona,
} from "@/lib/api/dena-paona.functions";
import { printDenaPaonaSlip } from "@/lib/print/dena-paona-print";

export const Route = createFileRoute("/dena-paona/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "দেনা-পাওনা — SohojPharma" },
      { name: "description", content: "দেনা-পাওনা এবং ঋণ হিসাব খতিয়ান।" },
    ],
  }),
  component: DenaPaonaListPage,
});

const formatCurrency = (val: number | string | null | undefined) => {
  const num = Number(val || 0);
  return new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 0 }).format(num);
};

function DenaPaonaListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deletePhase, setDeletePhase] = useState<"confirm" | "countdown">("confirm");
  const [countdown, setCountdown] = useState(10);

  // Form State
  const initialForm = {
    type: "give" as "give" | "take",
    amount: "",
    person_name: "",
    transaction_date: new Date().toISOString().slice(0, 10),
    address: "",
    repayment_date: "",
    phone: "",
    witness_1: "",
    witness_2: "",
    reason: "",
  };
  const [formData, setFormData] = useState(initialForm);

  const listFn = useServerFn(getDenaPaonaList);
  const createFn = useServerFn(createDenaPaonaEntry);
  const deleteFn = useServerFn(deleteDenaPaona);

  const { data, isLoading } = useQuery({
    queryKey: ["dena-paona-list", tenantId, searchTerm],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenantId, search: searchTerm } }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!formData.person_name.trim()) throw new Error("ব্যক্তির নাম লিখুন");
      if (!formData.phone.trim()) throw new Error("ফোন নম্বর লিখুন");
      if (!formData.amount || Number(formData.amount) <= 0) throw new Error("সঠিক টাকার পরিমাণ লিখুন");
      if (!formData.witness_1.trim()) throw new Error("সাক্ষী ১-এর নাম লিখুন");
      if (!formData.witness_2.trim()) throw new Error("সাক্ষী ২-এর নাম লিখুন");
      if (!formData.reason.trim()) throw new Error("লেনদেনের কারণ লিখুন");

      return await createFn({
        data: {
          tenantId,
          type: formData.type,
          person_name: formData.person_name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim() || undefined,
          amount: Number(formData.amount),
          transaction_date: formData.transaction_date,
          repayment_date: formData.repayment_date || undefined,
          witness_1: formData.witness_1.trim(),
          witness_2: formData.witness_2.trim(),
          reason: formData.reason.trim(),
        },
      });
    },
    onSuccess: (res) => {
      toast.success("লেনদেনের হিসাব সফলভাবে তৈরি হয়েছে!");
      queryClient.invalidateQueries({ queryKey: ["dena-paona-list"] });
      setIsCreateOpen(false);
      setFormData(initialForm);
      if (res?.id) {
        navigate({ to: `/dena-paona/${res.id}` });
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "সংরক্ষণ করতে সমস্যা হয়েছে");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await deleteFn({ data: { tenantId, id } });
    },
    onSuccess: () => {
      toast.success("হিসাব সফলভাবে ডিলিট হয়েছে!");
      queryClient.invalidateQueries({ queryKey: ["dena-paona-list"] });
      setDeleteTarget(null);
      setDeletePhase("confirm");
      setCountdown(10);
    },
    onError: (err: any) => {
      toast.error(err.message || "ডিলিট করতে সমস্যা হয়েছে");
      setDeleteTarget(null);
      setDeletePhase("confirm");
      setCountdown(10);
    },
  });

  useEffect(() => {
    if (!deleteTarget || deletePhase !== "countdown") return;
    if (countdown <= 0) {
      if (!deleteMutation.isPending) {
        deleteMutation.mutate(deleteTarget.id);
      }
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [deleteTarget, deletePhase, countdown, deleteMutation.isPending]);

  const handlePrint = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    printDenaPaonaSlip(item);
  };

  const handleDeleteClick = (item: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(item);
    setDeletePhase("confirm");
    setCountdown(10);
  };

  const closeDeleteDialog = () => {
    if (deleteMutation.isPending) return;
    setDeleteTarget(null);
    setDeletePhase("confirm");
    setCountdown(10);
  };

  const givingList = data?.givingList || [];
  const takingList = data?.takingList || [];
  const givingSummary = data?.givingSummary || { totalGiven: 0, totalRemaining: 0, count: 0 };
  const takingSummary = data?.takingSummary || { totalTaken: 0, totalRemaining: 0, count: 0 };

  return (
    <AppShell variant="store" title="দেনা-পাওনা">
      <div className="space-y-6">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-[#007953] hover:bg-[#006344] text-white font-medium px-6 py-2.5 rounded-lg shadow-sm transition flex items-center gap-2 self-start"
          >
            দেনা-পাওনা
          </Button>

          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="নাম, ফোন বা ঠিকানা দিয়ে খুঁজুন..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-[#007953] focus:ring-1 focus:ring-[#007953]"
            />
          </div>
        </div>

        {/* Two Columns Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Column 1: টাকা দেওয়ার লিস্ট */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="text-base font-semibold text-[#007953]">
                টাকা দেওয়ার লিস্ট <span className="font-normal text-slate-600">({givingSummary.count})</span>
              </h2>
              <div className="flex items-center gap-4 text-sm font-medium">
                <span className="text-emerald-700">মোট দেওয়া: ৳ {formatCurrency(givingSummary.totalGiven)}</span>
                <span className="text-rose-600 font-semibold">মোট বাকি: ৳ {formatCurrency(givingSummary.totalRemaining)}</span>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#007953] text-white font-medium">
                  <tr>
                    <th className="px-4 py-3">নাম, ঠিকানা</th>
                    <th className="px-4 py-3 text-right">টাকা দিয়েছি</th>
                    <th className="px-4 py-3 text-right">বর্তমান বাকি</th>
                    <th className="px-4 py-3 text-center w-24">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[#007953]" />
                        তথ্য লোড হচ্ছে...
                      </td>
                    </tr>
                  ) : givingList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-normal">
                        কোনো তথ্য পাওয়া যায়নি
                      </td>
                    </tr>
                  ) : (
                    givingList.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => navigate({ to: `/dena-paona/${item.id}` })}
                        className="hover:bg-slate-50/80 cursor-pointer transition"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                              <User className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate leading-snug">{item.person_name}</p>
                              {item.address && (
                                <p className="text-xs text-slate-500 truncate leading-tight uppercase mt-0.5">{item.address}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-slate-800">
                          ৳ {formatCurrency(item.total_amount)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-rose-600">
                          ৳ {formatCurrency(item.remaining_amount)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="inline-flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handlePrint(item, e)}
                              className="p-1.5 rounded hover:bg-slate-100 text-[#007953] transition"
                              title="প্রিন্ট স্লিপ"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteClick(item, e)}
                              className="p-1.5 rounded hover:bg-rose-50 text-rose-600 transition"
                              title="হিসাব ডিলিট করুন"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Column 2: টাকা নেওয়ার লিস্ট */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="text-base font-semibold text-[#007953]">
                টাকা নেওয়ার লিস্ট <span className="font-normal text-slate-600">({takingSummary.count})</span>
              </h2>
              <div className="flex items-center gap-4 text-sm font-medium">
                <span className="text-emerald-700">মোট নেওয়া: ৳ {formatCurrency(takingSummary.totalTaken)}</span>
                <span className="text-rose-600 font-semibold">মোট বাকি: ৳ {formatCurrency(takingSummary.totalRemaining)}</span>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#007953] text-white font-medium">
                  <tr>
                    <th className="px-4 py-3">নাম, ঠিকানা</th>
                    <th className="px-4 py-3 text-right">টাকা নিয়েছি</th>
                    <th className="px-4 py-3 text-right">বর্তমান বাকি</th>
                    <th className="px-4 py-3 text-center w-24">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-[#007953]" />
                        তথ্য লোড হচ্ছে...
                      </td>
                    </tr>
                  ) : takingList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-normal">
                        কোনো তথ্য পাওয়া যায়নি
                      </td>
                    </tr>
                  ) : (
                    takingList.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => navigate({ to: `/dena-paona/${item.id}` })}
                        className="hover:bg-slate-50/80 cursor-pointer transition"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                              <User className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate leading-snug">{item.person_name}</p>
                              {item.address && (
                                <p className="text-xs text-slate-500 truncate leading-tight uppercase mt-0.5">{item.address}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-slate-800">
                          ৳ {formatCurrency(item.total_amount)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-rose-600">
                          ৳ {formatCurrency(item.remaining_amount)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="inline-flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handlePrint(item, e)}
                              className="p-1.5 rounded hover:bg-slate-100 text-[#007953] transition"
                              title="প্রিন্ট স্লিপ"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteClick(item, e)}
                              className="p-1.5 rounded hover:bg-rose-50 text-rose-600 transition"
                              title="হিসাব ডিলিট করুন"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: লেনদেনের নতুন হিসাব */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              লেনদেনের নতুন হিসাব
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {/* লেনদেনের ধরন */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                লেনদেনের ধরন <span className="text-rose-500">*</span>
              </Label>
              <Select
                value={formData.type}
                onValueChange={(val: "give" | "take") => setFormData((prev) => ({ ...prev, type: val }))}
              >
                <SelectTrigger className="w-full bg-white border-slate-200">
                  <SelectValue placeholder="লেনদেনের ধরন নির্বাচন করুন" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="give">টাকা দেওয়া (আমার দেওয়া ঋণ)</SelectItem>
                  <SelectItem value="take">টাকা নেওয়া (আমার নেওয়া ঋণ)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* টাকার পরিমাণ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                টাকার পরিমাণ <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="number"
                placeholder="টাকার পরিমাণ লিখুন"
                value={formData.amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>

            {/* নাম */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                নাম <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="text"
                placeholder="ব্যক্তির নাম লিখুন"
                value={formData.person_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, person_name: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>

            {/* লেনদেনের তারিখ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                লেনদেনের তারিখ <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="date"
                value={formData.transaction_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, transaction_date: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>

            {/* ঠিকানা */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                ঠিকানা <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="text"
                placeholder="ঠিকানা লিখুন"
                value={formData.address}
                onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>

            {/* পরিশোধের তারিখ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                পরিশোধের তারিখ <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="date"
                value={formData.repayment_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, repayment_date: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>

            {/* ফোন নম্বর */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                ফোন নম্বর <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="tel"
                placeholder="ফোন নম্বর লিখুন"
                value={formData.phone}
                onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>

            {/* সাক্ষী ১ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                সাক্ষী ১ <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="text"
                placeholder="সাক্ষী ১-এর নাম লিখুন"
                value={formData.witness_1}
                onChange={(e) => setFormData((prev) => ({ ...prev, witness_1: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>

            {/* সাক্ষী ২ */}
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">
                সাক্ষী ২ <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="text"
                placeholder="সাক্ষী ২-এর নাম লিখুন"
                value={formData.witness_2}
                onChange={(e) => setFormData((prev) => ({ ...prev, witness_2: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>

            {/* লেনদেনের কারণ */}
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">
                লেনদেনের কারণ <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                rows={3}
                placeholder="লেনদেনের কারণ বিস্তারিত লিখুন"
                value={formData.reason}
                onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                className="bg-white border-slate-200"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormData(initialForm)}
              className="text-slate-600 border-slate-200"
            >
              ক্লিয়ার
            </Button>
            <Button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="bg-[#007953] hover:bg-[#006344] text-white font-medium px-6"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  সংরক্ষণ হচ্ছে...
                </>
              ) : (
                "অ্যাড করুন"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: ডিলিট কনফার্মেশন ও ১০ সেকেন্ড ডিলে */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              হিসাব ডিলিট নিশ্চিতকরণ
            </DialogTitle>
          </DialogHeader>

          {deleteTarget && deletePhase === "confirm" && (
            <div className="space-y-3 py-2 text-sm text-slate-700">
              <p>
                আপনি কি নিশ্চিত যে{" "}
                <span className="font-bold text-slate-900">{deleteTarget.person_name}</span>-এর
                দেনা-পাওনা হিসাবটি ডিলিট করতে চান?
              </p>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">ধরন:</span>
                  <span className="font-medium">
                    {deleteTarget.type === "give" ? "টাকা দেওয়া" : "টাকা নেওয়া"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">মোট পরিমাণ:</span>
                  <span className="font-semibold">৳ {formatCurrency(deleteTarget.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">বর্তমান বাকি:</span>
                  <span className="font-bold text-rose-600">৳ {formatCurrency(deleteTarget.remaining_amount)}</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                নিশ্চিত করার পর ১০ সেকেন্ড সময় দেওয়া হবে (চাইলে স্কিপ করতে পারবেন)।
              </p>
            </div>
          )}

          {deleteTarget && deletePhase === "countdown" && (
            <div className="space-y-4 py-3 text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-rose-50 border-2 border-rose-500 flex items-center justify-center">
                <span className="text-2xl font-bold text-rose-600 tabular-nums">
                  {countdown}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {deleteMutation.isPending
                    ? "হিসাব ডিলিট হচ্ছে..."
                    : `${countdown} সেকেন্ড পর "${deleteTarget.person_name}"-এর হিসাব ডিলিট হবে`}
                </p>
                <p className="text-xs text-slate-500">
                  ভুল হলে এখনই বাতিল করতে পারেন অথবা অপেক্ষা না করে স্কিপ করে ডিলিট করতে পারেন।
                </p>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-rose-500 h-full transition-all duration-1000 ease-linear"
                  style={{ width: `${((10 - countdown) / 10) * 100}%` }}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={closeDeleteDialog}
              disabled={deleteMutation.isPending}
              className="text-slate-600 border-slate-200"
            >
              বাতিল করুন
            </Button>

            {deletePhase === "confirm" ? (
              <Button
                type="button"
                onClick={() => {
                  setCountdown(10);
                  setDeletePhase("countdown");
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium"
              >
                হ্যাঁ, ডিলিট করুন
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  if (deleteTarget && !deleteMutation.isPending) {
                    deleteMutation.mutate(deleteTarget.id);
                  }
                }}
                disabled={deleteMutation.isPending}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium flex items-center gap-1.5"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    ডিলিট হচ্ছে...
                  </>
                ) : (
                  <>
                    <FastForward className="h-4 w-4" />
                    স্কিপ করে এখনই ডিলিট করুন
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
