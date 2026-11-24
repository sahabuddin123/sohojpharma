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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Landmark, Loader2, Plus, Wallet } from "lucide-react";
import { getPaymentAccountBalances, addBankDeposit, upsertAccount } from "@/lib/api/finance.functions";
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
  const qc = useQueryClient();

  const [depositOpen, setDepositOpen] = useState(false);
  const [newAccOpen, setNewAccOpen] = useState(false);
  const [depForm, setDepForm] = useState({
    account_code: "1000",
    amount: 0,
    deposit_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [newAccName, setNewAccName] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["payment-account-balances", tenantId, from, to],
    enabled: !!tenantId,
    queryFn: () => balFn({ data: { tenant_id: tenantId, from, to } }),
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
      qc.invalidateQueries({ queryKey: ["account-balances", tenantId] });
      setDepositOpen(false);
      setDepForm({ account_code: "1000", amount: 0, deposit_date: new Date().toISOString().slice(0, 10), notes: "" });
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
    onSuccess: () => {
      toast.success("নতুন ব্যাংক / নগদ অ্যাকাউন্ট যোগ হয়েছে");
      qc.invalidateQueries({ queryKey: ["payment-account-balances", tenantId] });
      qc.invalidateQueries({ queryKey: ["accounts", tenantId, "asset"] });
      setNewAccName("");
      setNewAccOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalCash = accounts.reduce((s, b) => s + Number(b.balance ?? 0), 0);

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
            <Button disabled={!tenantId || !branchId} onClick={() => setDepositOpen(true)}>
              <Wallet className="mr-1.5 h-4 w-4" /> ব্যালেন্স জমা দিন
            </Button>
          </div>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("acct.banks.totalCashBank")} value={`৳ ${totalCash.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`} icon={Landmark} tone="primary" />
        <StatCard label={t("acct.banks.accounts")} value={String(accounts.length)} icon={Landmark} tone="secondary" />
        <StatCard label={t("acct.banks.withBalance")} value={String(accounts.filter((b) => b.balance !== 0).length)} icon={Landmark} tone="success" />
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
              <TableHeader><TableRow><TableHead>{t("acct.banks.code")}</TableHead><TableHead>{t("acct.banks.account")}</TableHead><TableHead className="text-right">{t("acct.banks.balance")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {accounts.map((b) => (
                  <TableRow key={b.code}>
                    <TableCell className="font-mono text-xs">{b.code}</TableCell>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className={`text-right font-semibold ${b.balance < 0 ? "text-destructive" : ""}`}>
                      ৳ {Number(b.balance).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
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
                  {accounts.map((a) => (
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
