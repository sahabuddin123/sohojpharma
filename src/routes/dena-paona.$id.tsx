import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  FileText,
  Calendar,
  Zap,
  BarChart3,
  Receipt,
  Printer,
  Plus,
  CreditCard,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  getDenaPaonaDetails,
  addDenaPaonaTransaction,
} from "@/lib/api/dena-paona.functions";

export const Route = createFileRoute("/dena-paona/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "ঋণ হিসাব বিবরণী — SohojPharma" },
      { name: "description", content: "দেনা-পাওনা ও ঋণ খতিয়ান বিস্তারিত।" },
    ],
  }),
  component: DenaPaonaDetailsPage,
});

const formatCurrency = (val: number | string | null | undefined) => {
  const num = Number(val || 0);
  return new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 0 }).format(num);
};

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("bn-BD", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

function DenaPaonaDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  // Modal states
  const [isRepayOpen, setIsRepayOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Repayment form
  const [repayAmount, setRepayAmount] = useState("");
  const [repayNextDate, setRepayNextDate] = useState("");
  const [repayDescription, setRepayDescription] = useState("");

  // More transaction form
  const [moreAmount, setMoreAmount] = useState("");
  const [moreNextDate, setMoreNextDate] = useState("");
  const [moreDescription, setMoreDescription] = useState("");

  const detailsFn = useServerFn(getDenaPaonaDetails);
  const addTxFn = useServerFn(addDenaPaonaTransaction);

  const { data, isLoading } = useQuery({
    queryKey: ["dena-paona-details", tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: () => detailsFn({ data: { tenantId, id } }),
  });

  const loan = data?.loan;
  const transactions = data?.transactions || [];

  const remaining = Number(loan?.remaining_amount || 0);
  const total = Number(loan?.total_amount || 0);
  const paid = Number(loan?.paid_amount || 0);
  const progressPercent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  // Repayment mutation
  const repayMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(repayAmount);
      if (!amt || amt <= 0) throw new Error("সঠিক টাকার পরিমাণ লিখুন");
      if (amt > remaining) throw new Error("পরিশোধের পরিমাণ অবশিষ্ট বাকির চেয়ে বেশি হতে পারে না");

      return await addTxFn({
        data: {
          tenantId,
          loanId: id,
          actionType: "repayment",
          amount: amt,
          nextPaymentDate: repayNextDate || undefined,
          description: repayDescription.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("পরিশোধ সফলভাবে যোগ করা হয়েছে!");
      queryClient.invalidateQueries({ queryKey: ["dena-paona-details", tenantId, id] });
      queryClient.invalidateQueries({ queryKey: ["dena-paona-list"] });
      setIsRepayOpen(false);
      setRepayAmount("");
      setRepayNextDate("");
      setRepayDescription("");
    },
    onError: (err: any) => {
      toast.error(err.message || "সংরক্ষণ করতে সমস্যা হয়েছে");
    },
  });

  // More transaction mutation
  const moreMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(moreAmount);
      if (!amt || amt <= 0) throw new Error("সঠিক টাকার পরিমাণ লিখুন");

      return await addTxFn({
        data: {
          tenantId,
          loanId: id,
          actionType: "more",
          amount: amt,
          nextPaymentDate: moreNextDate || undefined,
          description: moreDescription.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("নতুন লেনদেন সফলভাবে যোগ করা হয়েছে!");
      queryClient.invalidateQueries({ queryKey: ["dena-paona-details", tenantId, id] });
      queryClient.invalidateQueries({ queryKey: ["dena-paona-list"] });
      setIsMoreOpen(false);
      setMoreAmount("");
      setMoreNextDate("");
      setMoreDescription("");
    },
    onError: (err: any) => {
      toast.error(err.message || "সংরক্ষণ করতে সমস্যা হয়েছে");
    },
  });

  const isGive = loan?.type === "give";

  if (isLoading) {
    return (
      <AppShell variant="store" title="দেনা-পাওনা বিস্তারিত">
        <div className="py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-[#007953] mb-3" />
          <p className="text-slate-500">তথ্য লোড হচ্ছে...</p>
        </div>
      </AppShell>
    );
  }

  if (!loan) {
    return (
      <AppShell variant="store" title="দেনা-পাওনা বিস্তারিত">
        <div className="py-16 text-center space-y-4">
          <p className="text-slate-500">হিসাব পাওয়া যায়নি</p>
          <Button onClick={() => navigate({ to: "/dena-paona" })} variant="outline">
            তালিকায় ফিরে যান
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell variant="store" title="দেনা-পাওনা বিস্তারিত">
      <div className="space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              to="/dena-paona"
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition"
              title="তালিকায় ফিরে যান"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {loan.person_name}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[#007953] transition"
              title="স্টেটমেন্ট প্রিন্ট করুন"
            >
              <Printer className="h-4.5 w-4.5" />
            </button>

            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                isGive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }`}
            >
              {isGive ? "আমার দেওয়া ঋণ" : "আমার নেওয়া ঋণ"}
            </span>
          </div>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 Cards) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Card 1: ব্যক্তিগত তথ্য */}
            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="py-3.5 px-5 border-b border-slate-100 flex flex-row items-center gap-2">
                <User className="h-4 w-4 text-[#007953]" />
                <CardTitle className="text-sm font-bold text-slate-900">ব্যক্তিগত তথ্য</CardTitle>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">নাম</span>
                  <p className="font-medium text-slate-800">{loan.person_name}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">ঠিকানা</span>
                  <p className="font-medium text-slate-800">{loan.address || "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">ফোন নম্বর</span>
                  <p className="font-medium text-slate-800">{loan.phone}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">বিবরণ</span>
                  <p className="font-medium text-slate-800">{loan.reason || "-"}</p>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: ঋণ বিবরণ */}
            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="py-3.5 px-5 border-b border-slate-100 flex flex-row items-center gap-2">
                <FileText className="h-4 w-4 text-[#007953]" />
                <CardTitle className="text-sm font-bold text-slate-900">ঋণ বিবরণ</CardTitle>
              </CardHeader>
              <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">ঋণের তারিখ</span>
                  <p className="font-medium text-slate-800">{formatDate(loan.transaction_date)}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">সাক্ষী ১</span>
                  <p className="font-medium text-slate-800">{loan.witness_1 || "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">পরিশোধের তারিখ</span>
                  <p className="font-medium text-slate-800">{formatDate(loan.repayment_date)}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block mb-0.5">সাক্ষী ২</span>
                  <p className="font-medium text-slate-800">{loan.witness_2 || "-"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column (2 Cards) */}
          <div className="space-y-6">
            {/* Card 3: দ্রুত পদক্ষেপ */}
            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="py-3.5 px-5 border-b border-slate-100 flex flex-row items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-600" />
                <CardTitle className="text-sm font-bold text-slate-900">দ্রুত পদক্ষেপ</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                <Button
                  onClick={() => setIsMoreOpen(true)}
                  className="w-full bg-[#088395] hover:bg-[#077080] text-white font-medium py-2.5 rounded-lg shadow-sm flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  নতুন লেনদেন
                </Button>
                <Button
                  onClick={() => setIsRepayOpen(true)}
                  disabled={remaining <= 0}
                  className="w-full bg-[#4d9b1c] hover:bg-[#3f8016] text-white font-medium py-2.5 rounded-lg shadow-sm flex items-center justify-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  ঋণ পরিশোধ
                </Button>
              </CardContent>
            </Card>

            {/* Card 4: আর্থিক সারাংশ */}
            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="py-3.5 px-5 border-b border-slate-100 flex flex-row items-center gap-2">
                <BarChart3 className="h-4 w-4 text-cyan-600" />
                <CardTitle className="text-sm font-bold text-slate-900">আর্থিক সারাংশ</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">মোট ঋণ:</span>
                  <span className="font-semibold text-slate-800">৳ {formatCurrency(total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">পরিশোধিত:</span>
                  <span className="font-semibold text-emerald-700">৳ {formatCurrency(paid)}</span>
                </div>

                <div className="pt-2 border-t border-slate-100 text-center">
                  <span className="text-xs text-slate-500 block mb-1">অবশিষ্ট</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-rose-600 tracking-tight">
                    ৳ {formatCurrency(remaining)}
                  </span>
                </div>

                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>অগ্রগতি</span>
                    <span className="font-semibold">{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2 bg-slate-100" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom Full-width Card: লেনদেনের ইতিহাস */}
        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="py-3.5 px-5 border-b border-slate-100 flex flex-row items-center gap-2">
            <Receipt className="h-4 w-4 text-[#007953]" />
            <CardTitle className="text-sm font-bold text-slate-900">লেনদেনের ইতিহাস</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-5 py-3">তারিখ</th>
                  <th className="px-5 py-3">বিবরণ</th>
                  <th className="px-5 py-3 text-right">দেওয়া</th>
                  <th className="px-5 py-3 text-right">নেওয়া</th>
                  <th className="px-5 py-3 text-right">পরিশোধ</th>
                  <th className="px-5 py-3 text-right">বাকি</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      কোনো লেনদেনের তথ্য পাওয়া যায়নি
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-5 py-3.5 whitespace-nowrap text-slate-700">
                        {formatDate(tx.transaction_date)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-800">{tx.description || "-"}</td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-800">
                        {Number(tx.given_amount) > 0 ? `৳ ${formatCurrency(tx.given_amount)}` : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-800">
                        {Number(tx.taken_amount) > 0 ? `৳ ${formatCurrency(tx.taken_amount)}` : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-emerald-700">
                        {Number(tx.paid_amount) > 0 ? `৳ ${formatCurrency(tx.paid_amount)}` : "-"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-bold text-slate-900">
                        ৳ {formatCurrency(tx.remaining_amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Modal 1: ঋণ পরিশোধ (Repayment) */}
      <Dialog open={isRepayOpen} onOpenChange={setIsRepayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {isGive ? "টাকা ফেরত পাওয়ার হিসাব" : "টাকা ফেরত দেওয়ার হিসাব"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* মোট পাওনা / বাকি */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                {isGive ? "টাকা পাবো" : "মোট টাকা পাওনা"}
              </Label>
              <Input
                type="text"
                disabled
                value={remaining}
                className="bg-slate-50 border-slate-200 text-slate-700 font-semibold"
              />
            </div>

            {/* ফেরত পরিমাণ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                {isGive ? "টাকা ফেরত পেলাম" : "টাকা ফেরত দিলাম"} <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="number"
                placeholder={isGive ? "টাকা ফেরত পেলাম" : "টাকা ফেরত দিলাম"}
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                className="bg-white border-slate-200"
              />
            </div>

            {/* বাকি রইল */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                পাওনা টাকা বাকি রইল
              </Label>
              <Input
                type="text"
                disabled
                value={Math.max(0, remaining - (Number(repayAmount) || 0))}
                className="bg-slate-50 border-slate-200 text-slate-700 font-semibold"
              />
            </div>

            {/* পরবর্তী পরিশোধের তারিখ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                পরবর্তী পরিশোধের তারিখ
              </Label>
              <Input
                type="date"
                value={repayNextDate}
                onChange={(e) => setRepayNextDate(e.target.value)}
                className="bg-white border-slate-200"
              />
            </div>

            {/* বর্ণনা */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                বর্ণনা
              </Label>
              <Textarea
                rows={3}
                placeholder={
                  isGive
                    ? "টাকা পাওয়ার সময়ের কিছু বর্ণনা লিখে রাখুন যা পরবর্তীতে আপনাকে মনে করিয়ে দিতে সাহায্য করবে"
                    : "টাকা পরিশোধ সংক্রান্ত কোনো নোট লিখে রাখুন"
                }
                value={repayDescription}
                onChange={(e) => setRepayDescription(e.target.value)}
                className="bg-white border-slate-200"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRepayAmount("");
                setRepayNextDate("");
                setRepayDescription("");
              }}
              className="text-slate-600 border-slate-200"
            >
              ক্লিয়ার
            </Button>
            <Button
              type="button"
              onClick={() => repayMutation.mutate()}
              disabled={repayMutation.isPending}
              className="bg-[#007953] hover:bg-[#006344] text-white font-medium px-6"
            >
              {repayMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  যোগ হচ্ছে...
                </>
              ) : (
                "যোগ করুন"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: + নতুন লেনদেন (More Loan) */}
      <Dialog open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {isGive ? "নতুন করে টাকা দেওয়ার হিসাব" : "নতুন করে টাকা নেওয়ার হিসাব"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* আগের বাকি / মোট পাওনা */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                {isGive ? "আগের বাকি" : "মোট টাকা পাওনা"}
              </Label>
              <Input
                type="text"
                disabled
                value={remaining}
                className="bg-slate-50 border-slate-200 text-slate-700 font-semibold"
              />
            </div>

            {/* নতুন পরিমাণ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                {isGive ? "নতুন করে টাকা দিলাম" : "নতুন করে টাকা নিলাম"} <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="number"
                placeholder={isGive ? "নতুন করে টাকা দিলাম" : "নতুন করে টাকা নিলাম"}
                value={moreAmount}
                onChange={(e) => setMoreAmount(e.target.value)}
                className="bg-white border-slate-200"
              />
            </div>

            {/* সর্বমোট পাবো / দেনা */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                {isGive ? "সর্বমোট টাকা পাবো" : "সর্বমোট টাকা পাবো"}
              </Label>
              <Input
                type="text"
                disabled
                value={remaining + (Number(moreAmount) || 0)}
                className="bg-slate-50 border-slate-200 text-slate-700 font-semibold"
              />
            </div>

            {/* পরবর্তী পরিশোধের তারিখ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                পরবর্তী পরিশোধের তারিখ
              </Label>
              <Input
                type="date"
                value={moreNextDate}
                onChange={(e) => setMoreNextDate(e.target.value)}
                className="bg-white border-slate-200"
              />
            </div>

            {/* বর্ণনা */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                বর্ণনা
              </Label>
              <Textarea
                rows={3}
                placeholder="নতুন লেনদেনের বিবরণ"
                value={moreDescription}
                onChange={(e) => setMoreDescription(e.target.value)}
                className="bg-white border-slate-200"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMoreAmount("");
                setMoreNextDate("");
                setMoreDescription("");
              }}
              className="text-slate-600 border-slate-200"
            >
              ক্লিয়ার
            </Button>
            <Button
              type="button"
              onClick={() => moreMutation.mutate()}
              disabled={moreMutation.isPending}
              className="bg-[#007953] hover:bg-[#006344] text-white font-medium px-6"
            >
              {moreMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  যোগ হচ্ছে...
                </>
              ) : (
                "যোগ করুন"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Printable Statement */}
      <div className="hidden print:block fixed inset-0 bg-white p-8 text-black z-50">
        <div className="text-center pb-4 border-b border-black">
          <h1 className="text-2xl font-bold">SohojPharma</h1>
          <p className="text-sm font-semibold mt-1">দেনা-পাওনা লেজার স্টেটমেন্ট</p>
          <p className="text-xs text-gray-500">তারিখ: {new Date().toLocaleDateString("bn-BD")}</p>
        </div>

        <div className="my-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p><span className="font-semibold">ব্যক্তির নাম:</span> {loan.person_name}</p>
            <p><span className="font-semibold">ফোন নম্বর:</span> {loan.phone}</p>
            <p><span className="font-semibold">ঠিকানা:</span> {loan.address || "-"}</p>
          </div>
          <div>
            <p><span className="font-semibold">লেনদেনের ধরন:</span> {isGive ? "আমার দেওয়া ঋণ" : "আমার নেওয়া ঋণ"}</p>
            <p><span className="font-semibold">ঋণের তারিখ:</span> {formatDate(loan.transaction_date)}</p>
            <p><span className="font-semibold">পরিশোধের তারিখ:</span> {formatDate(loan.repayment_date)}</p>
          </div>
        </div>

        <div className="border border-black p-4 rounded mb-6 flex justify-around text-sm font-semibold">
          <div>মোট ঋণ: ৳ {formatCurrency(total)}</div>
          <div>পরিশোধিত: ৳ {formatCurrency(paid)}</div>
          <div>অবশিষ্ট বাকি: ৳ {formatCurrency(remaining)}</div>
        </div>

        <h3 className="font-bold text-sm mb-2">লেনদেনের বিস্তারিত ইতিহাস:</h3>
        <table className="w-full text-xs text-left border border-black mb-8">
          <thead className="border-b border-black bg-gray-100">
            <tr>
              <th className="p-2 border-r border-black">তারিখ</th>
              <th className="p-2 border-r border-black">বিবরণ</th>
              <th className="p-2 border-r border-black text-right">দেওয়া</th>
              <th className="p-2 border-r border-black text-right">নেওয়া</th>
              <th className="p-2 border-r border-black text-right">পরিশোধ</th>
              <th className="p-2 text-right">বাকি</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-black">
                <td className="p-2 border-r border-black">{formatDate(tx.transaction_date)}</td>
                <td className="p-2 border-r border-black">{tx.description || "-"}</td>
                <td className="p-2 border-r border-black text-right">
                  {Number(tx.given_amount) > 0 ? `৳ ${formatCurrency(tx.given_amount)}` : "-"}
                </td>
                <td className="p-2 border-r border-black text-right">
                  {Number(tx.taken_amount) > 0 ? `৳ ${formatCurrency(tx.taken_amount)}` : "-"}
                </td>
                <td className="p-2 border-r border-black text-right">
                  {Number(tx.paid_amount) > 0 ? `৳ ${formatCurrency(tx.paid_amount)}` : "-"}
                </td>
                <td className="p-2 text-right">৳ {formatCurrency(tx.remaining_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-16 flex justify-between pt-8 text-xs font-semibold">
          <div className="text-center border-t border-black pt-1 w-36">
            দাতার স্বাক্ষর
          </div>
          <div className="text-center border-t border-black pt-1 w-36">
            গ্রহীতার স্বাক্ষর
          </div>
        </div>
      </div>
    </AppShell>
  );
}
