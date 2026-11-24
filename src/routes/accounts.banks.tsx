import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Loader2, Plus, Wallet, BookOpen, Power } from "lucide-react";
import { getPaymentAccountBalances, addBankDeposit, upsertAccount, getAccountLedger } from "@/lib/api/finance.functions";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { useAccountsDateFilter } from "@/components/accounts/accounts-date-filter";
import { toast } from "sonner";

export const Route = createFileRoute("/accounts/banks")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Bank & Cash — SohojPharma" }] }),
  component: BanksPage,
});

function BanksPage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const { from, to } = useAccountsDateFilter();
  const tenantId = currentTenantId ?? "";
  const balFn = useServerFn(getPaymentAccountBalances);
  const depositFn = useServerFn(addBankDeposit);
  const upsertAccFn = useServerFn(upsertAccount);
  const ledgerFn = useServerFn(getAccountLedger);
  const qc = useQueryClient();

  const [selectedCode, setSelectedCode] = useState<string>("1010");
  const [depositOpen, setDepositOpen] = useState(false);
  const [newAccOpen, setNewAccOpen] = useState(false);
  const [depForm, setDepForm] = useState({
    account_code: "1010",
    amount: 0,
    deposit_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [newAccName, setNewAccName] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["payment-account-balances", tenantId, from, to, "with-inactive"],
    enabled: !!tenantId,
    queryFn: () => balFn({ data: { tenant_id: tenantId, from, to, include_inactive: true } }),
  });

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ["bank-account-ledger", tenantId, selectedCode, from, to],
    enabled: !!tenantId && !!selectedCode,
    queryFn: () => ledgerFn({ data: { tenant_id: tenantId, account_code: selectedCode, from, to } }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (acc: { id: string; code: string; name: string; is_active: boolean }) =>
      upsertAccFn({
        data: {
          id: acc.id,
          tenant_id: tenantId,
          code: acc.code,
          name: acc.name,
          type: "asset",
          is_active: !acc.is_active,
        },
      }),
    onSuccess: (_res, acc) => {
      toast.success(acc.is_active ? `${acc.name} ডিঅ্যাক্টিভ করা হয়েছে` : `${acc.name} অ্যাক্টিভ করা হয়েছে`);
      qc.invalidateQueries({ queryKey: ["payment-account-balances", tenantId] });
      qc.invalidateQueries({ queryKey: ["accounts", tenantId, "asset"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const depositMutation = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("প্রথমে একটি শাখা নির্বাচন করুন।");
      return depositFn({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          account_code: depForm.account_code,
          amount: Number(depForm.amount),
          deposit_date: depForm.deposit_date,
          notes: depForm.notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("ব্যালেন্স সফলভাবে জমা হয়েছে");
      qc.invalidateQueries({ queryKey: ["payment-account-balances", tenantId] });
      qc.invalidateQueries({ queryKey: ["bank-account-ledger", tenantId] });
      qc.invalidateQueries({ queryKey: ["account-balances", tenantId] });
      setDepositOpen(false);
      setDepForm({ account_code: selectedCode || "1010", amount: 0, deposit_date: new Date().toISOString().slice(0, 10), notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const newAccMutation = useMutation({
    mutationFn: () => {
      const name = newAccName.trim();
      if (!name) throw new Error("অ্যাকাউন্টের নাম লিখুন");
      const nums = accounts.map((a) => parseInt(a.code, 10)).filter((n) => !Number.isNaN(n) && n >= 1000 && n < 1100);
      const nextCode = String(nums.length > 0 ? Math.max(...nums) + 10 : 1060);
      return upsertAccFn({
        data: {
          tenant_id: tenantId,
          code: nextCode,
          name,
          type: "asset",
          is_active: true,
        },
      });
    },
    onSuccess: (created) => {
      toast.success("নতুন ব্যাংক / নগদ অ্যাকাউন্ট যোগ হয়েছে");
      qc.invalidateQueries({ queryKey: ["payment-account-balances", tenantId] });
      qc.invalidateQueries({ queryKey: ["accounts", tenantId, "asset"] });
      if (created?.code) setSelectedCode(created.code);
      setNewAccName("");
      setNewAccOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeAccounts = accounts.filter((a) => a.is_active);
  const totalCash = activeAccounts.reduce((s, b) => s + Number(b.balance ?? 0), 0);

  type LedgerLine = {
    debit: number;
    credit: number;
    description: string | null;
    running_balance: number;
    journal_entries: { entry_no: string; entry_date: string; ref_no: string | null };
  };
  const ledgerLines: LedgerLine[] = (ledgerData?.lines as LedgerLine[] | undefined) ?? [];
  const totalDeposit = ledgerLines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
  const totalExpenseOut = ledgerLines.reduce((s, l) => s + Number(l.credit ?? 0), 0);

  return (
    <>
      <PageHeader
        title={t("acct.banks.title")}
        description={t("acct.banks.desc")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!tenantId} onClick={() => setNewAccOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> নতুন অ্যাকাউন্ট
            </Button>
            <Button
              disabled={!tenantId || !branchId}
              onClick={() => {
                setDepForm((p) => ({ ...p, account_code: selectedCode || "1010" }));
                setDepositOpen(true);
              }}
            >
              <Wallet className="mr-1.5 h-4 w-4" /> ব্যালেন্স জমা দিন
            </Button>
          </div>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("acct.banks.totalCashBank")} value={`৳ ${totalCash.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} icon={Landmark} tone="primary" />
        <StatCard label={t("acct.banks.accounts")} value={`${activeAccounts.length} / ${accounts.length}`} icon={Landmark} tone="secondary" />
        <StatCard label={t("acct.banks.withBalance")} value={String(activeAccounts.filter((b) => b.balance !== 0).length)} icon={Landmark} tone="success" />
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">{t("acct.banks.accounts")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}</div>
          ) : accounts.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("acct.banks.noAccounts")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("acct.banks.code")}</TableHead>
                  <TableHead>{t("acct.banks.account")}</TableHead>
                  <TableHead>অবস্থা</TableHead>
                  <TableHead className="text-right">{t("acct.banks.balance")}</TableHead>
                  <TableHead className="text-right">অ্যাকশন</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((b) => {
                  const isSel = selectedCode === b.code;
                  return (
                    <TableRow
                      key={b.code}
                      className={`cursor-pointer transition-colors ${isSel ? "bg-primary/5" : ""} ${!b.is_active ? "opacity-60" : ""}`}
                      onClick={() => setSelectedCode(b.code)}
                    >
                      <TableCell className="font-mono text-xs">{b.code}</TableCell>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>
                        <Badge variant={b.is_active ? "outline" : "secondary"} className="text-xs">
                          {b.is_active ? "Active" : "Deactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${b.balance < 0 ? "text-destructive" : ""}`}>
                        ৳ {Number(b.balance).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant={isSel ? "default" : "outline"}
                            className="h-7 px-2 text-xs"
                            onClick={() => setSelectedCode(b.code)}
                          >
                            <BookOpen className="mr-1 h-3 w-3" /> লেজার
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`h-7 px-2 text-xs ${b.is_active ? "text-destructive hover:text-destructive" : "text-success hover:text-success"}`}
                            disabled={toggleActiveMutation.isPending}
                            onClick={() => toggleActiveMutation.mutate(b)}
                          >
                            <Power className="mr-1 h-3 w-3" /> {b.is_active ? "Deactive" : "Active"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Account Ledger Section */}
      <Card className="mt-6 shadow-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              অ্যাকাউন্ট লেজার: {ledgerData?.account ? `${ledgerData.account.code} · ${ledgerData.account.name}` : selectedCode}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              সময়কাল: {from} → {to} · মোট জমা: <span className="font-semibold text-success">৳ {totalDeposit.toLocaleString("en-IN")}</span> · মোট খরচ/উত্তোলন: <span className="font-semibold text-warning">৳ {totalExpenseOut.toLocaleString("en-IN")}</span> · ব্যালেন্স: <span className="font-semibold text-foreground">৳ {Number(ledgerData?.closing_balance ?? 0).toLocaleString("en-IN")}</span>
            </p>
          </div>
          <Select value={selectedCode} onValueChange={setSelectedCode}>
            <SelectTrigger className="h-8 w-[240px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.code} value={a.code}>
                  {a.code} · {a.name} (৳ {Number(a.balance).toLocaleString("en-IN")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {ledgerLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("acct.common.loading")}
            </div>
          ) : ledgerLines.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">এই অ্যাকাউন্টে নির্বাচিত তারিখের মধ্যে কোনো লেনদেন নেই।</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>তারিখ</TableHead>
                  <TableHead>এন্ট্রি / রেফ</TableHead>
                  <TableHead>বিবরণ</TableHead>
                  <TableHead className="text-right">জমা (In / Debit)</TableHead>
                  <TableHead className="text-right">খরচ (Out / Credit)</TableHead>
                  <TableHead className="text-right">ব্যালেন্স</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerLines.map((l, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{l.journal_entries.entry_date}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.journal_entries.entry_no}
                      {l.journal_entries.ref_no ? <span className="ml-1 text-muted-foreground">({l.journal_entries.ref_no})</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{l.description ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium text-success">
                      {Number(l.debit) > 0 ? `+ ৳ ${Number(l.debit).toLocaleString("en-IN")}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-warning">
                      {Number(l.credit) > 0 ? `- ৳ ${Number(l.credit).toLocaleString("en-IN")}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ৳ {Number(l.running_balance).toLocaleString("en-IN")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>ব্যাংক / ক্যাশে ব্যালেন্স জমা দিন</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>অ্যাকাউন্ট নির্বাচন করুন</Label>
              <Select value={depForm.account_code} onValueChange={(v) => setDepForm({ ...depForm, account_code: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.name} — ৳ {Number(a.balance).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>পরিমাণ (৳)</Label>
                <Input type="number" value={depForm.amount} onChange={(e) => setDepForm({ ...depForm, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>তারিখ</Label>
                <Input type="date" value={depForm.deposit_date} onChange={(e) => setDepForm({ ...depForm, deposit_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>নোট (ঐচ্ছিক)</Label>
              <Input placeholder="যেমন: ওপেনিং ব্যালেন্স / ব্যাংক জমা" value={depForm.notes} onChange={(e) => setDepForm({ ...depForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => depositMutation.mutate()} disabled={!depForm.amount || depForm.amount <= 0 || depositMutation.isPending}>
              {depositMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} জমা করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newAccOpen} onOpenChange={setNewAccOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>নতুন ব্যাংক / মোবাইল ব্যাংকিং অ্যাকাউন্ট যোগ</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>অ্যাকাউন্টের নাম</Label>
              <Input placeholder="যেমন: Islami Bank, Dutch-Bangla Bank, Personal bKash" value={newAccName} onChange={(e) => setNewAccName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => newAccMutation.mutate()} disabled={!newAccName.trim() || newAccMutation.isPending}>
              {newAccMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} অ্যাকাউন্ট তৈরি করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
