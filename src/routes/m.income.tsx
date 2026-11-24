import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import {
  PhoneCard,
  PhoneChip,
  PhoneChipRow,
  PhoneEmpty,
  PhoneKpi,
  PhoneKpiGrid,
  PhoneRow,
  money,
} from "@/components/mobile/phone-ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { listIncomes, createIncome, listAccounts } from "@/lib/api/finance.functions";

export const Route = createFileRoute("/m/income")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Income — Pharmacy Phone App" },
      { name: "description", content: "Record and review non-sales income from your phone." },
      { property: "og:title", content: "Income — Pharmacy Phone App" },
      { property: "og:description", content: "Add income entries and track today's and monthly receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileIncome,
});

const METHODS = ["cash", "bank", "bkash", "nagad", "card"] as const;
type Method = (typeof METHODS)[number];

function MobileIncome() {
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const listFn = useServerFn(listIncomes);
  const listAccFn = useServerFn(listAccounts);
  const createFn = useServerFn(createIncome);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    income_no: `INC-${Date.now().toString().slice(-6)}`,
    income_date: new Date().toISOString().slice(0, 10),
    account_code: "4100",
    amount: "",
    payment_method: "cash" as Method,
    source: "",
    notes: "",
  });

  const { data: incomes = [], isLoading } = useQuery({
    queryKey: ["m-incomes", tenantId],
    enabled: !!tenantId,
    queryFn: () => listFn({ data: { tenant_id: tenantId, limit: 200 } }),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["m-income-accounts", tenantId],
    enabled: !!tenantId && showForm,
    queryFn: () => listAccFn({ data: { tenant_id: tenantId, type: "income" } }),
  });

  const totals = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    let t = 0;
    let m = 0;
    for (const r of incomes) {
      const amt = Number(r.amount ?? 0);
      if (r.income_date === today) t += amt;
      if ((r.income_date ?? "").startsWith(month)) m += amt;
    }
    return { today: t, month: m, count: incomes.length };
  }, [incomes]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("প্রথমে একটি শাখা নির্বাচন করুন।");
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("সঠিক পরিমাণ লিখুন");
      return createFn({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          income_no: form.income_no,
          income_date: form.income_date,
          account_code: form.account_code,
          amount,
          payment_method: form.payment_method,
          source: form.source || undefined,
          notes: form.notes || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("আয় রেকর্ড হয়েছে");
      setShowForm(false);
      setForm((f) => ({
        ...f,
        income_no: `INC-${Date.now().toString().slice(-6)}`,
        amount: "",
        source: "",
        notes: "",
      }));
      void qc.invalidateQueries({ queryKey: ["m-incomes", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PhoneShell title="Income" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="mint" accent="success" value={money(totals.today)} label="Today" />
        <PhoneKpi tone="sky" accent="info" value={money(totals.month)} label="This month" />
        <PhoneKpi tone="lilac" wide value={String(totals.count)} label="Entries" />
      </PhoneKpiGrid>

      <Button
        className="mt-4 h-12 w-full rounded-2xl text-base font-bold"
        onClick={() => setShowForm((v) => !v)}
      >
        {showForm ? <X className="mr-2 h-5 w-5" /> : <Plus className="mr-2 h-5 w-5" />}
        {showForm ? "Cancel" : "New income"}
      </Button>

      {showForm && (
        <PhoneCard className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">No.</label>
              <Input
                value={form.income_no}
                onChange={(e) => setForm({ ...form, income_no: e.target.value })}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Date</label>
              <Input
                type="date"
                value={form.income_date}
                onChange={(e) => setForm({ ...form, income_date: e.target.value })}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Amount</label>
            <Input
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              className="mt-1 h-12 rounded-xl text-lg font-bold"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground">Method</p>
            <PhoneChipRow>
              {METHODS.map((m) => (
                <PhoneChip
                  key={m}
                  active={form.payment_method === m}
                  onClick={() => setForm({ ...form, payment_method: m })}
                >
                  {m}
                </PhoneChip>
              ))}
            </PhoneChipRow>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground">Income account</p>
            <PhoneChipRow>
              {accounts.map((a) => (
                <PhoneChip
                  key={a.code}
                  active={form.account_code === a.code}
                  onClick={() => setForm({ ...form, account_code: a.code })}
                >
                  {a.code} · {a.name}
                </PhoneChip>
              ))}
            </PhoneChipRow>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Source</label>
            <Input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="mt-1 h-11 rounded-xl"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Notes</label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 rounded-xl"
            />
          </div>

          <Button
            className="h-12 w-full rounded-2xl text-base font-bold"
            disabled={mutation.isPending || !branchId}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save income"}
          </Button>
          {!branchId && (
            <p className="text-center text-xs text-muted-foreground">শাখা নির্বাচন করুন</p>
          )}
        </PhoneCard>
      )}

      <div className="mt-4 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && incomes.length === 0 && <PhoneEmpty message="এখনো কোনো আয় রেকর্ড করা হয়নি।" />}
        {incomes.map((r) => {
          const acc = (r as unknown as { chart_of_accounts: { code: string; name: string } | null })
            .chart_of_accounts;
          return (
            <PhoneCard key={r.id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="font-semibold text-primary">{r.income_date}</p>
                <p className="text-base font-extrabold text-success">{money(r.amount)}</p>
              </div>
              <div className="mt-2 border-t border-border pt-2">
                <PhoneRow label="No." value={r.income_no} />
                <PhoneRow label="Account" value={acc ? `${acc.code} · ${acc.name}` : "-"} />
                <PhoneRow label="Source" value={r.source ?? r.notes ?? "-"} />
                <PhoneRow label="Method" value={<span className="capitalize">{r.payment_method}</span>} />
              </div>
            </PhoneCard>
          );
        })}
      </div>
    </PhoneShell>
  );
}
