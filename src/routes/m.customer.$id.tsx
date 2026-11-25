import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Phone, RotateCcw } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { buildUnifiedCustomerLedger } from "@/lib/api/customer-ledger-unified";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/m/customer/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "গ্রাহক লেজার — SohojPharma" },
      { name: "description", content: "গ্রাহকের বিক্রি, কালেকশন ও রিটার্ন লেজার।" },
    ],
  }),
  component: MobileCustomerLedger,
});

function MobileCustomerLedger() {
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["m-customer-ledger", tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async () => {
      const [{ data: cust, error: cErr }, { data: sales }, { data: pays }, { data: rets }] = await Promise.all([
        supabase
          .from("customers")
          .select("id,name,phone,due_balance,opening_balance")
          .eq("tenant_id", tenantId)
          .eq("id", id)
          .single(),
        supabase
          .from("sales")
          .select("id,invoice_no,sale_date,created_at,total,paid,due,status,is_return")
          .eq("tenant_id", tenantId)
          .eq("customer_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("customer_payments")
          .select("id,payment_no,payment_date,created_at,amount,method,sale_id,notes")
          .eq("tenant_id", tenantId)
          .eq("customer_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("sales_returns")
          .select("id,return_no,return_date,created_at,total,refunded_amount")
          .eq("tenant_id", tenantId)
          .eq("customer_id", id)
          .order("created_at", { ascending: true }),
      ]);
      if (cErr) throw cErr;
      return {
        customer: cust as { id: string; name: string; phone: string | null; due_balance: number | null; opening_balance: number | null },
        sales: (sales ?? []) as any[],
        payments: (pays ?? []) as any[],
        returns: (rets ?? []) as any[],
      };
    },
  });

  const ledger = useMemo(() => {
    if (!data) return { entries: [], totalDebit: 0, totalCredit: 0, closing: 0 };
    return buildUnifiedCustomerLedger({
      openingBalance: Number(data.customer.opening_balance ?? 0),
      sales: data.sales,
      payments: data.payments,
      returns: data.returns,
    });
  }, [data]);

  const dueBal = Number(data?.customer.due_balance ?? 0);

  return (
    <PhoneShell title={data?.customer.name ?? "গ্রাহক লেজার"} back>
      {data?.customer.phone && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs shadow-xs">
          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
            <Phone className="h-3.5 w-3.5 text-[#0d5c46]" />
            {data.customer.phone}
          </span>
          {dueBal > 0 && (
            <Link
              to={"/m/collect" as never}
              className="rounded-xl bg-[#0d5c46] px-3 py-1.5 text-[11px] font-bold text-white"
            >
              বাকি আদায় করুন
            </Link>
          )}
        </div>
      )}

      <PhoneKpiGrid>
        <PhoneKpi
          tone={dueBal > 0 ? "rose" : "mint"}
          accent={dueBal > 0 ? "danger" : "success"}
          value={money(Math.abs(dueBal))}
          label={dueBal > 0 ? "বর্তমান বাকি" : dueBal < 0 ? "অগ্রিম" : "পরিশোধিত"}
        />
        <PhoneKpi tone="sky" value={money(ledger.totalDebit)} label="মোট বিক্রি" />
      </PhoneKpiGrid>

      <div className="mt-3 space-y-2">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">লোড হচ্ছে…</p>}
        {!isLoading && ledger.entries.length === 0 && (
          <PhoneEmpty message="এই গ্রাহকের কোনো লেনদেন পাওয়া যায়নি" />
        )}
        {[...ledger.entries].reverse().map((e) => {
          const isSale = e.entry_type === "sale";
          const isReturn = e.entry_type === "sales_return";
          const label =
            e.entry_type === "opening"
              ? "শুরুর ব্যালেন্স"
              : isSale
                ? "বিক্রি"
                : isReturn
                  ? "বিক্রি রিটার্ন"
                  : "আদায় (Collection)";
          return (
            <div
              key={e.id}
              className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className={cn(
                      "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                      isSale
                        ? "bg-amber-50 text-amber-700"
                        : isReturn
                          ? "bg-rose-50 text-rose-600"
                          : "bg-emerald-50 text-[#0d5c46]",
                    )}
                  >
                    {isSale ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : isReturn ? (
                      <RotateCcw className="h-4 w-4" />
                    ) : (
                      <ArrowDownLeft className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900">{label}</p>
                    <p className="truncate text-[11px] text-slate-500">{e.ref_no || "—"}</p>
                    <p className="text-[10px] text-slate-400">
                      {new Date(e.date).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {e.debit > 0 && (
                    <p className="text-xs font-bold text-amber-700">+{money(e.debit)}</p>
                  )}
                  {e.credit > 0 && (
                    <p className="text-xs font-bold text-[#0d5c46]">−{money(e.credit)}</p>
                  )}
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                    জের: {money(e.running_balance)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PhoneShell>
  );
}
