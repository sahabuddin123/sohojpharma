import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/ops/audit")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: AuditPage });

interface AuditRow {
  id: string;
  user_id: string | null;
  action: string;
  entity_table: string | null;
  entity_id: string | null;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
  device: string | null;
  browser: string | null;
}

const toneFor = (a: string) =>
  a.includes("delete") || a.includes("cancel") ? "bg-rose-500/10 text-rose-600"
  : a.includes("create") || a.includes("insert") ? "bg-emerald-500/10 text-emerald-600"
  : "bg-blue-500/10 text-blue-600";

function AuditPage() {
  const { currentTenantId } = useAuth();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["audit", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id,user_id,action,entity_table,entity_id,created_at,ip_address,user_agent,device,browser")
        .eq("tenant_id", currentTenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as AuditRow[];
    },
  });

  const filtered = rows.filter((r) =>
    `${r.action} ${r.entity_table ?? ""} ${r.entity_id ?? ""}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Audit Log</h2>
          <p className="text-sm text-muted-foreground">Every user action with device & IP.</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-64 rounded-md border bg-card px-3 py-2 text-sm"
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">User</th>
              <th className="px-4 py-2.5">Action</th>
              <th className="px-4 py-2.5">Entity</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Device</th>
              <th className="px-4 py-2.5">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No audit entries yet.</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-4 py-2.5 font-mono text-xs">{r.user_id?.slice(0, 8) ?? "system"}</td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${toneFor(r.action)}`}>{r.action}</span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {r.entity_table}
                  {r.entity_id && <span className="ml-1 font-mono text-xs">#{r.entity_id.slice(0, 8)}</span>}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.device ?? r.browser ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{r.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
