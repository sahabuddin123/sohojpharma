import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Webhook, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/developer/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks — Developer" }] }),
  component: WebhooksPage,
  errorComponent: ({ error, reset }) => (
    <div className="rounded-2xl border bg-card p-6 text-sm">
      <p className="font-semibold text-rose-600">Failed to load webhooks</p>
      <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : "Something went wrong"}</p>
      <button onClick={reset} className="mt-3 rounded-md border px-3 py-1.5">Retry</button>
    </div>
  ),
});

const ALL_EVENTS = [
  "sale.created", "sale.updated", "sale.deleted",
  "purchase.created", "purchase.updated",
  "stock.low", "stock.expired",
  "customer.created",
  "subscription.expired", "payment.completed",
];

interface Hook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

interface Delivery {
  id: string;
  event: string;
  status_code: number | null;
  latency_ms: number | null;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function WebhooksPage() {
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const { data: hooks = [], isLoading } = useQuery({
    queryKey: ["webhooks", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhooks")
        .select("id,url,events,active,created_at")
        .eq("tenant_id", currentTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Hook[];
    },
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["webhook_deliveries", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("id,event,status_code,latency_ms,created_at")
        .eq("tenant_id", currentTenantId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
  });

  const addHook = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error("No store selected");
      if (!/^https?:\/\//.test(url.trim())) throw new Error("URL must start with http(s)://");
      if (picked.length === 0) throw new Error("Pick at least one event");
      const { error } = await supabase.from("webhooks").insert({
        tenant_id: currentTenantId,
        url: url.trim(),
        events: picked,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setUrl(""); setPicked([]);
      qc.invalidateQueries({ queryKey: ["webhooks", currentTenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (h: Hook) => {
      const { error } = await supabase.from("webhooks").update({ active: !h.active }).eq("id", h.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", currentTenantId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", currentTenantId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Add endpoint</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.com/webhooks/pharma" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
          <button
            onClick={() => addHook.mutate()}
            disabled={addHook.isPending || !currentTenantId}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {addHook.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Subscribe
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ALL_EVENTS.map((e) => {
            const on = picked.includes(e);
            return (
              <button key={e} onClick={() => setPicked((p) => on ? p.filter((x) => x !== e) : [...p, e])} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                {e}
              </button>
            );
          })}
        </div>
      </div>

      <section className="rounded-2xl border bg-card">
        <header className="flex items-center gap-2 border-b px-4 py-3"><Webhook className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Endpoints</h3></header>
        <ul className="divide-y">
          {isLoading && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></li>
          )}
          {!isLoading && hooks.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">No endpoints yet — add one above.</li>
          )}
          {hooks.map((h) => (
            <li key={h.id} className="flex items-start gap-3 p-4">
              <div className="flex-1">
                <p className="font-mono text-sm break-all">{h.url}</p>
                <div className="mt-1 flex flex-wrap gap-1">{h.events.map((e) => <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{e}</span>)}</div>
              </div>
              <button
                onClick={() => toggle.mutate(h)}
                className={`rounded-full px-2 py-0.5 text-xs ${h.active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}
              >
                {h.active ? "active" : "paused"}
              </button>
              <button onClick={() => { if (confirm("Delete endpoint?")) remove.mutate(h.id); }} className="rounded-md border p-1.5 text-rose-600 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card">
        <header className="border-b px-4 py-3"><h3 className="text-sm font-semibold">Recent deliveries</h3></header>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Event</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Latency</th><th className="px-4 py-2">When</th></tr>
          </thead>
          <tbody className="divide-y">
            {deliveries.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No deliveries yet.</td></tr>
            )}
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 font-mono text-xs">{d.event}</td>
                <td className="px-4 py-2">
                  {d.status_code != null && d.status_code < 300
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"><Check className="h-3 w-3" /> {d.status_code}</span>
                    : <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-600"><X className="h-3 w-3" /> {d.status_code ?? "—"}</span>}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{d.latency_ms != null ? `${d.latency_ms} ms` : "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{timeAgo(d.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
