import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";
import {
  listExpenses,
  listIncomes,
  listAccounts,
  getPaymentAccountBalances,
  getDayClosingSummary,
  closeDayWithReconciliation,
} from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { useAccountsDateFilter } from "@/components/accounts/accounts-date-filter";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/accounts/day-closing")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Day Closing — SohojPharma" }] }),
  component: DayClosingPage,
});

type AllocType = "bank_transfer" | "owner_drawing" | "cash_expense" | "owner_injection" | "other_income";

type AllocRow = {
  type: AllocType;
  account_code: string;
  amount: number;
  note: string;
};

const fmt = (n: number) => `৳ ${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function DayClosingPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const { to } = useAccountsDateFilter();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const [date, setDate] = useState(to || new Date().toISOString().slice(0, 10));
  useEffect(() => {
    if (to) setDate(to);
  }, [to]);

  const [counted, setCounted] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<AllocRow[]>([]);

  const expFn = useServerFn(listExpenses);
  const incFn = useServerFn(listIncomes);
  const sumFn = useServerFn(getDayClosingSummary);
  const payBalFn = useServerFn(getPaymentAccountBalances);
  const listAccFn = useServerFn(listAccounts);
  const closeFn = useServerFn(closeDayWithReconciliation);

  const { data: sales = [] } = useQuery({
    queryKey: ["dc-sales", tenantId, date],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total, paid, status")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .gte("sale_date", date)
        .lte("sale_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ["dc-purchases", tenantId, date],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("total, paid, status")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .gte("purchase_date", date)
        .lte("purchase_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["dc-exp", tenantId, date],
    enabled: !!tenantId,
    queryFn: () => expFn({ data: { tenant_id: tenantId, from: date, to: date } }),
  });

  const { data: incomes = [] } = useQuery({
    queryKey: ["dc-inc", tenantId, date],
    enabled: !!tenantId,
    queryFn: () => incFn({ data: { tenant_id: tenantId, from: date, to: date } }),
  });

  const { data: dcSummary, isLoading: sumLoading } = useQuery({
    queryKey: ["dc-summary", tenantId, date],
    enabled: !!tenantId,
    queryFn: () => sumFn({ data: { tenant_id: tenantId, date } }),
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["payment-account-balances", tenantId],
    enabled: !!tenantId,
    queryFn: () => payBalFn({ data: { tenant_id: tenantId } }),
  });

  const { data: expenseHeads = [] } = useQuery({
    queryKey: ["accounts", tenantId, "expense"],
    enabled: !!tenantId,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "expense" } }),
  });

  const { data: incomeHeads = [] } = useQuery({
    queryKey: ["accounts", tenantId, "income"],
    enabled: !!tenantId,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "income" } }),
  });

  const nonCashBanks = useMemo(() => bankAccounts.filter((a) => a.code !== "1000"), [bankAccounts]);

  const summary = useMemo(() => {
    const salesTotal = (sales as Array<{ total: number }>).reduce((s, r) => s + Number(r.total ?? 0), 0);
    const purTotal = (purchases as Array<{ paid: number }>).reduce((s, r) => s + Number(r.paid ?? 0), 0);
    const expTotal = (expenses as Array<{ amount: number }>).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const incTotal = (incomes as Array<{ amount: number }>).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const expectedCash = Number(dcSummary?.expectedCash ?? 0);
    const openingCash = Number(dcSummary?.prevClosing?.counted_cash ?? 0);
    return { salesTotal, purTotal, expTotal, incTotal, expectedCash, openingCash };
  }, [sales, purchases, expenses, incomes, dcSummary]);

  const countedNum = counted === "" ? summary.expectedCash : Number(counted);
  const difference = Number((countedNum - summary.expectedCash).toFixed(2));
  const absDiff = Math.abs(difference);
  const needsReconciliation = counted !== "" && absDiff > 0.009;

  // Auto-seed one allocation row when user enters a different counted cash
  useEffect(() => {
    if (!needsReconciliation) {
      setAllocations([]);
      return;
    }
    setAllocations((prev) => {
      if (prev.length === 0) {
        if (difference < 0) {
          return [{
            type: "bank_transfer",
            account_code: nonCashBanks[0]?.code || "1010",
            amount: absDiff,
            note: "",
          }];
        }
        return [{
          type: "owner_injection",
          account_code: "3000",
          amount: absDiff,
          note: "",
        }];
      }
      if (prev.length === 1) {
        return [{ ...prev[0], amount: absDiff }];
      }
      return prev;
    });
  }, [needsReconciliation, difference, absDiff, nonCashBanks]);

  const allocatedSum = Number(allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0).toFixed(2));
  const unallocated = Number((absDiff - allocatedSum).toFixed(2));
  const canClose = counted !== "" && (!needsReconciliation || Math.abs(unallocated) <= 0.01);

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("প্রথমে একটি শাখা নির্বাচন করুন।");
      const enrichedAllocs = allocations.map((a) => {
        const bank = nonCashBanks.find((b) => b.code === a.account_code);
        const exp = expenseHeads.find((e) => e.code === a.account_code);
        const inc = incomeHeads.find((i) => i.code === a.account_code);
        return {
          ...a,
          account_name: bank?.name || exp?.name || inc?.name || undefined,
        };
      });
      return closeFn({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          closing_date: date,
          opening_cash: summary.openingCash,
          expected_cash: summary.expectedCash,
          counted_cash: countedNum,
          allocations: needsReconciliation ? enrichedAllocs : [],
          notes: notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("দিন বন্ধ ও ১ পয়সার হিসাবসহ ক্যাশ রিকনসিলিয়েশন সংরক্ষণ হয়েছে!");
      qc.invalidateQueries({ queryKey: ["dc-summary", tenantId] });
      qc.invalidateQueries({ queryKey: ["payment-account-balances", tenantId] });
      qc.invalidateQueries({ queryKey: ["expenses", tenantId] });
      setCounted("");
      setNotes("");
      setAllocations([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSplitRow = () => {
    const rem = Math.max(0, Number((absDiff - allocatedSum).toFixed(2)));
    setAllocations((prev) => [
      ...prev,
      difference < 0
        ? { type: "owner_drawing", account_code: "3000", amount: rem, note: "" }
        : { type: "other_income", account_code: "4100", amount: rem, note: "" },
    ]);
  };

  const summaryRows = [
    { label: "আগের দিনের সমাপনী ক্যাশ (Opening Cash)", value: summary.openingCash, tone: "text-muted-foreground" },
    { label: t("acct.dayClose.salesTotal"), value: summary.salesTotal, tone: "text-success" },
    { label: "নগদ পণ্য ক্রয় (Cash Purchase)", value: summary.purTotal, tone: "text-warning" },
    { label: t("acct.dayClose.expensesTotal"), value: summary.expTotal, tone: "text-warning" },
    { label: t("acct.dayClose.incomeOther"), value: summary.incTotal, tone: "text-success" },
    { label: "হাতে থাকার কথা (Expected Hand Cash)", value: summary.expectedCash, tone: "text-primary font-bold text-base" },
  ];

  const allocLabel = (type: string) => {
    switch (type) {
      case "bank_transfer": return "ব্যাংক / বিকাশে জমা";
      case "owner_drawing": return "মালিকের ব্যক্তিগত উত্তোলন";
      case "cash_expense": return "দোকানের নগদ ব্যয়";
      case "owner_injection": return "মালিকের ক্যাশ জমা";
      case "other_income": return "অন্যান্য আয়";
      default: return type;
    }
  };

  return (
    <>
      <PageHeader
        title={t("acct.dayClose.title")}
        description="১ পয়সারও হিসাব — হাতে থাকা ক্যাশ, ব্যাংক জমা ও ব্যক্তিগত খরচের সম্পূর্ণ রিকনসিলিয়েশন।"
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Label>{t("acct.common.date")}</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        {dcSummary?.currentClosing && (
          <Badge variant="outline" className="border-success/40 bg-success/10 text-success px-3 py-1">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> এই দিনটি ইতিমধ্যে বন্ধ করা হয়েছে ({date})
          </Badge>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">{t("acct.dayClose.dayEndSummary")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sumLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> লোড হচ্ছে...
              </div>
            ) : (
              summaryRows.map((s) => (
                <div key={s.label} className="flex justify-between border-b border-border/40 py-2">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className={s.tone}>{fmt(s.value)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">ক্যাশ যাচাই ও A-Z হিসাব মেলানো (Cash Reconciliation)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>হাতে থাকা কথা (Expected)</Label>
                <Input value={fmt(summary.expectedCash)} readOnly className="bg-muted/40 font-semibold" />
              </div>
              <div>
                <Label>আসল হাতে থাকা ক্যাশ / পরের দিন ওপেনিং (৳)</Label>
                <Input
                  type="number"
                  placeholder={String(summary.expectedCash)}
                  value={counted}
                  onChange={(e) => setCounted(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div>
                <Label>পার্থক্য (Difference)</Label>
                <Input
                  value={counted === "" ? "৳ 0" : `${difference > 0 ? "+" : ""}${fmt(difference)}`}
                  readOnly
                  className={`font-bold ${difference < 0 ? "text-destructive border-destructive/50" : difference > 0 ? "text-primary border-primary/50" : "text-success"}`}
                />
              </div>
            </div>

            {needsReconciliation && (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 space-y-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {difference < 0 ? (
                      <span>বাকি <strong>{fmt(absDiff)}</strong> কোথায় গেছে? (১ পয়সাও বাদ না রেখে হিসাব দিন)</span>
                    ) : (
                      <span>অতিরিক্ত <strong>{fmt(absDiff)}</strong> কোথা থেকে এসেছে? (হিসাব দিন)</span>
                    )}
                  </div>
                  <Badge variant={Math.abs(unallocated) <= 0.01 ? "outline" : "destructive"}>
                    {Math.abs(unallocated) <= 0.01 ? "১০০% মিলেছে ✓" : `বাকি আছে: ${fmt(unallocated)}`}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {allocations.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-2 rounded-md border border-border bg-background p-2.5 sm:grid-cols-12 sm:items-end">
                      <div className="sm:col-span-4">
                        <Label className="text-xs">হিসাবের ধরন</Label>
                        <Select
                          value={row.type}
                          onValueChange={(v) => {
                            const tVal = v as AllocType;
                            const defCode =
                              tVal === "bank_transfer" ? (nonCashBanks[0]?.code || "1010") :
                              tVal === "cash_expense" ? (expenseHeads[0]?.code || "6900") :
                              tVal === "other_income" ? (incomeHeads[0]?.code || "4100") : "3000";
                            setAllocations((prev) => prev.map((r, i) => i === idx ? { ...r, type: tVal, account_code: defCode } : r));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {difference < 0 ? (
                              <>
                                <SelectItem value="bank_transfer">ব্যাংক / বিকাশ / নগদে জমা</SelectItem>
                                <SelectItem value="owner_drawing">মালিকের ব্যক্তিগত খরচ / উত্তোলন</SelectItem>
                                <SelectItem value="cash_expense">দোকানের নগদ ব্যয় (Expense)</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="owner_injection">মালিকের ক্যাশ জমা (Capital)</SelectItem>
                                <SelectItem value="other_income">অন্যান্য আয় (Income)</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {(row.type === "bank_transfer" || row.type === "cash_expense" || row.type === "other_income") && (
                        <div className="sm:col-span-3">
                          <Label className="text-xs">
                            {row.type === "bank_transfer" ? "কোন ব্যাংক/অ্যাকাউন্টে?" : row.type === "cash_expense" ? "ব্যয়ের খাত" : "আয়ের খাত"}
                          </Label>
                          <Select
                            value={row.account_code}
                            onValueChange={(v) => setAllocations((prev) => prev.map((r, i) => i === idx ? { ...r, account_code: v } : r))}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {row.type === "bank_transfer" && nonCashBanks.map((b) => (
                                <SelectItem key={b.code} value={b.code}>{b.name} ({fmt(b.balance)})</SelectItem>
                              ))}
                              {row.type === "cash_expense" && expenseHeads.map((e) => (
                                <SelectItem key={e.code} value={e.code}>{e.code} · {e.name}</SelectItem>
                              ))}
                              {row.type === "other_income" && incomeHeads.map((i) => (
                                <SelectItem key={i.code} value={i.code}>{i.code} · {i.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className={row.type === "owner_drawing" || row.type === "owner_injection" ? "sm:col-span-5" : "sm:col-span-2"}>
                        <Label className="text-xs">পরিমাণ (৳)</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={row.amount}
                          onChange={(e) => setAllocations((prev) => prev.map((r, i) => i === idx ? { ...r, amount: Number(e.target.value) } : r))}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Label className="text-xs">নোট</Label>
                        <Input
                          className="h-8 text-xs"
                          placeholder="কারণ..."
                          value={row.note}
                          onChange={(e) => setAllocations((prev) => prev.map((r, i) => i === idx ? { ...r, note: e.target.value } : r))}
                        />
                      </div>

                      {allocations.length > 1 && (
                        <div className="sm:col-span-1 flex justify-end">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setAllocations((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Button type="button" size="sm" variant="outline" onClick={addSplitRow} className="h-7 text-xs">
                  <Plus className="mr-1 h-3 w-3" /> একাধিক ভাগে ভাগ করুন (যেমন: ব্যাংক + ব্যক্তিগত)
                </Button>
              </div>
            )}

            <div>
              <Label>{t("acct.common.notes")}</Label>
              <Input placeholder="দিন বন্ধের সাধারণ নোট (ঐচ্ছিক)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <Button
              className="w-full"
              disabled={!canClose || closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              {closeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              দিন বন্ধ ও হিসাব সংরক্ষণ করুন
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card className="mt-6 shadow-card">
        <CardHeader>
          <CardTitle className="text-base">দিন বন্ধ ও ক্যাশ রিকনসিলিয়েশন ইতিহাস (A-Z Audit)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!dcSummary?.history?.length ? (
            <div className="py-10 text-center text-sm text-muted-foreground">এখনো কোনো দিন বন্ধ রেকর্ড করা হয়নি।</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>তারিখ</TableHead>
                  <TableHead className="text-right">প্রত্যাশিত ক্যাশ</TableHead>
                  <TableHead className="text-right">হাতে থাকা / ওপেনিং</TableHead>
                  <TableHead className="text-right">পার্থক্য</TableHead>
                  <TableHead>বিস্তারিত হিসাব (কোথায় গেছে / এসেছে)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dcSummary.history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.closing_date}</TableCell>
                    <TableCell className="text-right">{fmt(h.expected_cash)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(h.counted_cash)}</TableCell>
                    <TableCell className={`text-right font-semibold ${Number(h.difference) < 0 ? "text-destructive" : Number(h.difference) > 0 ? "text-primary" : "text-success"}`}>
                      {Number(h.difference) === 0 ? "মিলেছে (৳ 0)" : fmt(h.difference)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Array.isArray(h.allocations) && h.allocations.length > 0 ? (
                        <div className="space-y-0.5">
                          {h.allocations.map((a, i) => (
                            <div key={i}>
                              <span className="font-medium text-foreground">{allocLabel(a.type)}</span>
                              {a.account_name ? ` (${a.account_name})` : ""}: {fmt(a.amount)}
                              {a.note ? ` — ${a.note}` : ""}
                            </div>
                          ))}
                        </div>
                      ) : (
                        h.notes || "কোনো গরমিল নেই"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
