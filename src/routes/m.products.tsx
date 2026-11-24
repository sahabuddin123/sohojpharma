import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneCard, PhoneChip, PhoneChipRow, PhoneEmpty, PhoneKpi, PhoneKpiGrid, money } from "@/components/mobile/phone-ui";
import { listProductsForManagement } from "@/lib/api/product-management.functions";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/m/products")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Products — Pharmacy Phone App" },
      { name: "description", content: "Browse medicine stock, prices and status from your phone." },
      { property: "og:title", content: "Products — Pharmacy Phone App" },
      { property: "og:description", content: "Search products, check stock and prices on your phone." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileProducts,
});

type StatusFilter = "all" | "in" | "low" | "out" | "neg";
const PAGE_SIZE = 30;

function MobileProducts() {
  const { currentTenantId } = useAuth();
  const listProducts = useServerFn(listProductsForManagement);
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setSearch(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => setPage(1), [search, status]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["m-products", currentTenantId, search, status, page],
    enabled: !!currentTenantId,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      listProducts({
        data: {
          tenantId: currentTenantId!,
          search: search || undefined,
          statusFilter: status === "all" ? undefined : status,
          page,
          pageSize: PAGE_SIZE,
          withCount: true,
        },
      }),
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const inStock = useMemo(
    () => rows.filter((r) => Number(r.batches?.[0]?.qty_on_hand ?? 0) > 0).length,
    [rows],
  );

  return (
    <PhoneShell title="Product" back>
      <PhoneKpiGrid>
        <PhoneKpi tone="sky" accent="info" value={total.toLocaleString()} label="Total Product" />
        <PhoneKpi tone="mint" accent="success" value={inStock} label="In Stock (this page)" />
      </PhoneKpiGrid>

      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-card px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search medicine, generic, brand…"
          className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      <PhoneChipRow>
        {(["all", "in", "low", "out", "neg"] as StatusFilter[]).map((s) => (
          <PhoneChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "All" : s === "in" ? "In stock" : s === "low" ? "Low" : s === "out" ? "Out" : "Negative"}
          </PhoneChip>
        ))}
      </PhoneChipRow>

      <div className="mt-3 space-y-3">
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows.length === 0 && <PhoneEmpty message="No product found for this filter" />}
        {rows.map((r) => {
          const qty = Number(r.batches?.[0]?.qty_on_hand ?? 0);
          const tone =
            qty <= 0 ? "text-destructive" : qty <= Number(r.reorder_level ?? 0) ? "text-warning" : "text-success";
          return (
            <PhoneCard key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold leading-snug text-foreground">{r.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[r.generics?.name, r.manufacturers?.name].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-extrabold ${tone}`}>{qty}</p>
                  <p className="text-[11px] text-muted-foreground">pcs</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">
                  Buy <span className="font-semibold text-foreground">{money(r.purchase_price)}</span>
                </span>
                <span className="font-bold text-primary">MRP {money(r.retail_price)}</span>
              </div>
            </PhoneCard>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button variant="outline" disabled={page >= pages || isFetching} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </PhoneShell>
  );
}
