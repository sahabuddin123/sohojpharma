import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Copy, Trash2, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/developer/keys")({
  head: () => ({ meta: [{ title: "API Keys — Developer" }] }),
  component: KeysPage,
  errorComponent: ({ error, reset }) => (
    <div className="rounded-2xl border bg-card p-6 text-sm">
      <p className="font-semibold text-rose-600">Failed to load API keys</p>
      <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : "Something went wrong"}</p>
      <button onClick={reset} className="mt-3 rounded-md border px-3 py-1.5">Retry</button>
    </div>
  ),
});

type Scope = "read" | "read_write" | "full";
interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scope: Scope;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const scopeTone: Record<Scope, string> = {
  read: "bg-blue-500/10 text-blue-600",
  read_write: "bg-emerald-500/10 text-emerald-600",
  full: "bg-rose-500/10 text-rose-600",
};

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genKey() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  const body = Array.from(arr).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
  return `pk_live_${body}`;
}

function KeysPage() {
  const { currentTenantId } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("read");
  const [revealed, setRevealed] = useState<{ id: string; full: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api_keys", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id,name,prefix,scope,created_at,last_used_at,revoked_at")
        .eq("tenant_id", currentTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKey[];
    },
  });

  const createKey = useMutation({
    mutationFn: async () => {
      if (!currentTenantId) throw new Error("No store selected");
      if (!name.trim()) throw new Error("Name is required");
      const full = genKey();
      const prefix = full.slice(0, 12) + "…" + full.slice(-4);
      const hash = await sha256Hex(full);
      const { data, error } = await supabase
        .from("api_keys")
        .insert({ tenant_id: currentTenantId, name: name.trim(), prefix, hash, scope })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id, full };
    },
    onSuccess: (r) => {
      setRevealed(r);
      setName("");
      qc.invalidateQueries({ queryKey: ["api_keys", currentTenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api_keys", currentTenantId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = (id: string, val: string) => {
    navigator.clipboard?.writeText(val);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Create API key</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name (e.g. Mobile POS)" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
          <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className="rounded-md border bg-background px-3 py-2 text-sm">
            <option value="read">Read only</option>
            <option value="read_write">Read + Write</option>
            <option value="full">Full access</option>
          </select>
          <button
            onClick={() => createKey.mutate()}
            disabled={createKey.isPending || !currentTenantId}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {createKey.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Generate
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">The full key is shown once on generation — store it securely.</p>

        {revealed && (
          <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
            <p className="text-xs font-semibold text-emerald-700">Your new API key (copy now — it won't be shown again):</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1 text-xs">{revealed.full}</code>
              <button onClick={() => copy(revealed.id, revealed.full)} className="rounded-md border p-1.5 hover:bg-muted">
                {copiedId === revealed.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setRevealed(null)} className="rounded-md border px-2 py-1 text-xs">Dismiss</button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Key</th><th className="px-4 py-2">Scope</th><th className="px-4 py-2">Created</th><th className="px-4 py-2">Last used</th><th className="px-4 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
            )}
            {!isLoading && keys.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No API keys yet — generate one above.</td></tr>
            )}
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="px-4 py-2.5 font-medium">{k.name}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{k.prefix}</td>
                <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs ${scopeTone[k.scope]}`}>{k.scope.replace("_", " + ")}</span></td>
                <td className="px-4 py-2.5 text-muted-foreground">{new Date(k.created_at).toISOString().slice(0, 10)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => { if (confirm(`Revoke "${k.name}"?`)) revoke.mutate(k.id); }}
                    className="rounded-md border p-1.5 text-rose-600 hover:bg-rose-500/10"
                    title="Revoke"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
