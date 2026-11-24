import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";
import { PhoneCard, PhoneEmpty, PhoneKpi, PhoneKpiGrid } from "@/components/mobile/phone-ui";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listProductGenerics,
  upsertProductGeneric,
  deleteProductGeneric,
} from "@/lib/api/product-management.functions";

export const Route = createFileRoute("/m/generics")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Generics — Pharmacy Phone App" },
      { name: "description", content: "Add, edit and search generic medicine names from your phone." },
      { property: "og:title", content: "Generics — Pharmacy Phone App" },
      { property: "og:description", content: "Manage generic names and active ingredients on mobile." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MobileGenerics,
});

type Row = { id: string; name: string; description: string | null; status: string };
const PAGE_SIZE = 25;

function MobileGenerics() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const list = useServerFn(listProductGenerics);
  const save = useServerFn(upsertProductGeneric);
  const remove = useServerFn(deleteProductGeneric);

  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);
  useEffect(() => setPage(1), [search]);

  const q = useQuery({
    queryKey: ["m-generics", tenantId, search, page],
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
    queryFn: () => list({ data: { tenantId, search: search || undefined, page, pageSize: PAGE_SIZE } }),
  });

  const rows = (q.data?.rows ?? []) as Row[];
  const total = q.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["m-generics"] });
    qc.invalidateQueries({ queryKey: ["product-generics-page"] });
    qc.invalidateQueries({ queryKey: ["product-generics-options"] });
  };

  const startNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setFormOpen(true);
  };
  const startEdit = (r: Row) => {
    setEditing(r);
    setName(r.name);
    setDescription(r.description ?? "");
    setFormOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      save({
        data: {
          tenantId,
          id: editing?.id,
          generic_name: name.trim(),
          description: description.trim() || null,
          status: "active" as const,
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Generic updated" : "Generic added");
      setFormOpen(false);
      setEditing(null);
      setName("");
      setDescription("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { tenantId, id } }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PhoneShell title="Generics" back contentClassName="sm:max-w-3xl">
      <PhoneKpiGrid>
        <PhoneKpi tone="sky" accent="info" value={total.toLocaleString()} label="Total generics" />
        <PhoneKpi tone="mint" accent="success" value={rows.length} label="On this page" />
      </PhoneKpiGrid>

      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-card px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search generic name…"
          className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {!formOpen ? (
        <Button className="mt-3 h-12 w-full rounded-2xl" onClick={startNew}>
          <Plus className="mr-2 h-4 w-4" /> New generic
        </Button>
      ) : (
        <PhoneCard className="mt-3 space-y-3">
          <p className="text-sm font-bold">{editing ? "Edit generic" : "New generic"}</p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Generic name *"
            className="h-11"
          />
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1"
              onClick={() => {
                setFormOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="h-11 flex-1"
              disabled={!name.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </PhoneCard>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {q.isLoading && (
          <p className="py-10 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">Loading…</p>
        )}
        {!q.isLoading && rows.length === 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
            <PhoneEmpty message="No generic found" />
          </div>
        )}
        {rows.map((r) => (
          <PhoneCard key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold leading-snug text-foreground">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.description || "—"}</p>
              </div>
              <Badge variant={r.status === "active" ? "default" : "secondary"} className="shrink-0">
                {r.status}
              </Badge>
            </div>
            <div className="mt-2 flex justify-end gap-2 border-t border-border pt-2">
              <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={delMut.isPending}
                onClick={() => {
                  if (confirm(`Delete ${r.name}?`)) delMut.mutate(r.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </PhoneCard>
        ))}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pages}
          </span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </PhoneShell>
  );
}
