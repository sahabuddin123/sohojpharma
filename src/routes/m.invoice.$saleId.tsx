import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/m/invoice/$saleId")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Invoice Preview — Pharmacy Phone App" },
      { name: "description", content: "Thermal invoice preview with one-tap printing from your phone." },
      { property: "og:title", content: "Invoice Preview — Pharmacy Phone App" },
      { property: "og:description", content: "Preview and print the receipt right after billing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileInvoicePreview,
});

type SaleRow = {
  id: string;
  invoice_no: string | null;
  created_at: string;
  total: number | null;
  paid: number | null;
  due: number | null;
  status: string | null;
  customers: { name: string | null } | null;
  sale_items: Array<{ qty: number; unit_price: number; line_total: number; products: { name: string | null } | null }>;
};

function MobileInvoicePreview() {
  const { saleId } = Route.useParams();
  const { memberships, currentTenantId } = useAuth();
  const shopName = memberships.find((m) => m.tenant_id === currentTenantId)?.tenants?.name ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["m-invoice", saleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id,invoice_no,created_at,total,paid,due,status,customers(name),sale_items(qty,unit_price,line_total,products(name))",
        )
        .eq("id", saleId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as SaleRow | null;
    },
  });

  function print() {
    const node = document.getElementById("m-receipt");
    if (!node) return;
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.write(
      `<html><head><style>@page{size:80mm auto;margin:3mm}body{font-family:monospace;font-size:12px;color:#000}pre{white-space:pre-wrap;margin:0}</style></head><body>${node.innerHTML}</body></html>`,
    );
    doc.close();
    frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true });
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  }

  return (
    <PhoneShell
      title="Invoice Preview"
      back
      help={
        <button type="button" onClick={print} aria-label="Print invoice" className="text-primary">
          <Printer className="h-6 w-6" />
        </button>
      }
    >
      {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && !data && <p className="py-10 text-center text-sm text-muted-foreground">Invoice not found</p>}
      {data && (
        <div className="mt-2 rounded-xl bg-card p-4 font-mono text-[13px] text-foreground shadow-sm" id="m-receipt">
          {shopName && <p className="mb-3 text-center text-base font-bold">{shopName}</p>}
          <p className="text-muted-foreground">------------------------------</p>
          <Line label="Invoice No:" value={data.invoice_no ?? data.id.slice(0, 8)} />
          <Line label="Sale Date:" value={new Date(data.created_at).toISOString().slice(0, 10)} />
          <Line label="Customer:" value={data.customers?.name ?? "Walk-in"} />
          <Line label="Payment Status:" value={(data.status ?? "").toUpperCase()} />
          <p className="text-muted-foreground">------------------------------</p>
          <div className="flex justify-between font-bold">
            <span>Item Name</span>
            <span className="flex gap-4">
              <span>Qty.</span>
              <span>Total</span>
            </span>
          </div>
          <p className="text-muted-foreground">------------------------------</p>
          <div className="space-y-2 py-2">
            {data.sale_items.map((it, i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1">{it.products?.name ?? "—"}</span>
                <span className="w-10 text-right">{Number(it.qty).toFixed(1)}</span>
                <span className="w-16 text-right">{Number(it.line_total).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground">------------------------------</p>
          <Line label="Total Price:" value={Number(data.total ?? 0).toFixed(2)} />
          <Line label="Paid :" value={Number(data.paid ?? 0).toFixed(2)} />
          <Line label="Due :" value={Number(data.due ?? 0).toFixed(2)} />
        </div>
      )}
    </PhoneShell>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 font-bold">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
