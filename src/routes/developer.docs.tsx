import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { Play } from "lucide-react";

export const Route = createFileRoute("/developer/docs")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: DocsPage });

type Method = "GET" | "POST" | "PUT" | "DELETE";
type EP = { method: Method; path: string; summary: string };

const groups: { name: string; eps: EP[] }[] = [
  { name: "Authentication", eps: [
    { method: "POST", path: "/auth/login", summary: "Email/password → access + refresh token" },
    { method: "POST", path: "/auth/refresh", summary: "Exchange refresh for access token" },
    { method: "POST", path: "/auth/logout", summary: "Invalidate current session" },
    { method: "POST", path: "/auth/forgot-password", summary: "Send password reset email" },
    { method: "POST", path: "/auth/reset-password", summary: "Reset password with token" },
    { method: "POST", path: "/auth/verify-otp", summary: "Verify SMS/email OTP" },
  ]},
  { name: "Products", eps: [
    { method: "GET", path: "/products", summary: "List & search by brand/generic/manufacturer" },
    { method: "POST", path: "/products", summary: "Create product" },
    { method: "GET", path: "/products/{id}", summary: "Get product by ID" },
    { method: "PUT", path: "/products/{id}", summary: "Update product" },
    { method: "DELETE", path: "/products/{id}", summary: "Delete product" },
  ]},
  { name: "Inventory", eps: [
    { method: "GET", path: "/inventory", summary: "Stock levels per batch" },
    { method: "POST", path: "/inventory/stock-in", summary: "Receive stock" },
    { method: "POST", path: "/inventory/stock-out", summary: "Issue stock" },
    { method: "GET", path: "/inventory/report", summary: "Inventory snapshot report" },
  ]},
  { name: "Sales", eps: [
    { method: "GET", path: "/sales", summary: "List sales (paginated)" },
    { method: "POST", path: "/sales", summary: "Create sale invoice" },
    { method: "GET", path: "/sales/{id}", summary: "Get sale by ID" },
    { method: "POST", path: "/sales/return", summary: "Create sale return" },
  ]},
  { name: "Purchases", eps: [
    { method: "GET", path: "/purchases", summary: "List purchases" },
    { method: "POST", path: "/purchases", summary: "Create purchase" },
    { method: "POST", path: "/purchase-return", summary: "Create purchase return" },
  ]},
  { name: "Customers", eps: [
    { method: "GET", path: "/customers", summary: "List customers" },
    { method: "POST", path: "/customers", summary: "Create customer" },
    { method: "PUT", path: "/customers/{id}", summary: "Update customer" },
    { method: "DELETE", path: "/customers/{id}", summary: "Delete customer" },
  ]},
  { name: "Suppliers", eps: [
    { method: "GET", path: "/suppliers", summary: "List suppliers" },
    { method: "POST", path: "/suppliers", summary: "Create supplier" },
    { method: "PUT", path: "/suppliers/{id}", summary: "Update supplier" },
    { method: "DELETE", path: "/suppliers/{id}", summary: "Delete supplier" },
  ]},
  { name: "Reports", eps: [
    { method: "GET", path: "/reports/sales", summary: "Sales report (date range)" },
    { method: "GET", path: "/reports/purchase", summary: "Purchase report" },
    { method: "GET", path: "/reports/profit-loss", summary: "P&L report" },
    { method: "GET", path: "/reports/stock", summary: "Stock report" },
    { method: "GET", path: "/reports/customer-ledger", summary: "Customer ledger" },
    { method: "GET", path: "/reports/supplier-ledger", summary: "Supplier ledger" },
  ]},
];

const methodTone: Record<Method, string> = {
  GET: "bg-blue-500/10 text-blue-600",
  POST: "bg-emerald-500/10 text-emerald-600",
  PUT: "bg-amber-500/10 text-amber-600",
  DELETE: "bg-rose-500/10 text-rose-600",
};

const sampleResponse = `{
  "success": true,
  "message": "OK",
  "data": [
    { "id": "p_1", "brand": "Napa", "generic": "Paracetamol", "price": 1.5 }
  ],
  "pagination": { "current_page": 1, "per_page": 20, "total": 1 }
}`;

function DocsPage() {
  const [selected, setSelected] = useState<EP>(groups[1].eps[0]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        {groups.map((g) => (
          <div key={g.name}>
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</p>
            <ul className="mt-1 space-y-0.5">
              {g.eps.map((e) => (
                <li key={e.method + e.path}>
                  <button onClick={() => setSelected(e)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted ${selected.path === e.path && selected.method === e.method ? "bg-muted" : ""}`}>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${methodTone[e.method]}`}>{e.method}</span>
                    <span className="font-mono">{e.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <section className="space-y-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${methodTone[selected.method]}`}>{selected.method}</span>
            <code className="text-sm">/api/v1{selected.path}</code>
            <span className="ml-auto text-xs text-muted-foreground">{selected.summary}</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
            <div className="rounded-md bg-muted/40 p-3">
              <p className="font-semibold text-muted-foreground">Headers</p>
              <pre className="mt-1">Authorization: Bearer &lt;token&gt;
X-Store-Id: store_123
Accept: application/json</pre>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="font-semibold text-muted-foreground">Rate limit</p>
              <pre className="mt-1">60 requests / minute
per API key + IP</pre>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Playground</h3>
            <button className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Play className="h-3.5 w-3.5" /> Send</button>
          </div>
          <textarea defaultValue={`{\n  "page": 1,\n  "per_page": 20\n}`} rows={4} className="mt-3 w-full rounded-md border bg-background p-3 font-mono text-xs" />
          <p className="mt-3 text-xs font-semibold text-muted-foreground">Response (200)</p>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs">{sampleResponse}</pre>
        </div>
      </section>
    </div>
  );
}
