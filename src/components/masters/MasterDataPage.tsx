/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Loader2, Upload, Download, GitMerge, RotateCcw, History } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import {
  listMasters, upsertMaster, setMasterActive, mergeMasters,
  getMasterStats, listMasterAudit, previewMasterImport, commitMasterImport,
  type MasterKind, type MasterRow, type ImportPreviewRow,
} from "@/lib/api/masters.functions";
import { exportCatalogData } from "@/lib/api/catalog-export.functions";

const PAGE = 25;

export function MasterDataPage({ kind, title, description }: { kind: MasterKind; title: string; description: string }) {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const list = useServerFn(listMasters);
  const upsert = useServerFn(upsertMaster);
  const setActive = useServerFn(setMasterActive);
  const merge = useServerFn(mergeMasters);
  const statsFn = useServerFn(getMasterStats);
  const auditFn = useServerFn(listMasterAudit);
  const previewFn = useServerFn(previewMasterImport);
  const commitFn = useServerFn(commitMasterImport);
  const exportCatalog = useServerFn(exportCatalogData);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive" | "deleted">("active");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const q = useQuery({
    queryKey: ["masters", kind, tenantId, search, status, page],
    enabled: !!tenantId,
    queryFn: () => list({ data: { kind, tenant_id: tenantId, search: search || undefined, status, page, pageSize: PAGE } }),
  });
  const stats = useQuery({
    queryKey: ["masters-stats", kind, tenantId],
    enabled: !!tenantId,
    queryFn: () => statsFn({ data: { kind, tenant_id: tenantId } }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["masters", kind] });
    qc.invalidateQueries({ queryKey: ["masters-stats", kind] });
  };

  const setActiveM = useMutation({
    mutationFn: (vars: { ids: string[]; op: "delete" | "restore" | "activate" | "deactivate" }) =>
      setActive({ data: { kind, tenant_id: tenantId, ids: vars.ids, op: vars.op } }),
    onSuccess: (r) => { toast.success(`${r.updated} updated`); setSelected({}); invalidateAll(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data?.rows ?? []) as MasterRow[];
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => k), [selected]);

  const exportCsv = async () => {
    // Full-dataset export for kinds supported by the catalog exporter; others export the current page.
    const fullKind = kind === "category" ? "categories" : kind === "generic" ? "generics" : kind === "manufacturer" ? "companies" : null;
    if (fullKind) {
      try {
        const { header, rows: fullRows } = await exportCatalog({ data: { tenantId, kind: fullKind } });
        const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lines = [header.map(esc).join(","), ...fullRows.map((r) => r.map(esc).join(","))];
        const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${fullKind}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${fullRows.length} rows`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Export failed");
      }
      return;
    }
    const header = ["name", "code", "status", "aliases", "description"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [r.name, r.code ?? "", r.status, (r.aliases ?? []).join(";"), (r as any).description ?? ""];
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${kind}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell variant="store" title={title}>
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAuditOpen(true)}><History className="mr-2 h-4 w-4" />History</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export</Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Import</Button>
            <Button onClick={() => { setEditing(null); setEditOpen(true); }}><Plus className="mr-2 h-4 w-4" />New</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-5 mb-4">
        <StatCard label="Total" value={stats.data?.total ?? "—"} />
        <StatCard label="Active" value={stats.data?.active ?? "—"} />
        <StatCard label="Inactive" value={stats.data?.inactive ?? "—"} />
        <StatCard label="Deleted" value={stats.data?.deleted ?? "—"} />
        <StatCard label="Duplicates" value={stats.data?.duplicates ?? "—"} tone={(stats.data?.duplicates ?? 0) > 0 ? "warn" : "ok"} />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search by name or code…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Tabs value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
              <TabsList>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="inactive">Inactive</TabsTrigger>
                <TabsTrigger value="deleted">Deleted</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            {selectedIds.length > 0 && (
              <div className="ml-auto flex gap-2">
                <Badge variant="secondary">{selectedIds.length} selected</Badge>
                {status !== "deleted" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setActiveM.mutate({ ids: selectedIds, op: "deactivate" })}>Deactivate</Button>
                    <Button size="sm" variant="outline" onClick={() => setActiveM.mutate({ ids: selectedIds, op: "activate" })}>Activate</Button>
                    <Button size="sm" variant="outline" onClick={() => setMergeOpen(true)} disabled={selectedIds.length < 2}><GitMerge className="mr-2 h-4 w-4" />Merge</Button>
                    <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Delete ${selectedIds.length} item(s)?`)) setActiveM.mutate({ ids: selectedIds, op: "delete" }); }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setActiveM.mutate({ ids: selectedIds, op: "restore" })}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button>
                )}
              </div>
            )}
          </div>

          {/* Mobile card list */}
          <div className="space-y-3 md:hidden">
            {q.isLoading ? (
              <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No records found.</p>
            ) : rows.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Checkbox className="mt-1 shrink-0" checked={!!selected[r.id]} onCheckedChange={(v) => setSelected({ ...selected, [r.id]: !!v })} />
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug break-words">{r.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground break-words">
                        {r.code ? `${r.code} · ` : ""}{(r.aliases ?? []).join(", ") || "No aliases"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={r.status === "active" ? "default" : r.status === "deleted" ? "destructive" : "secondary"} className="shrink-0">{r.status}</Badge>
                </div>
                <div className="mt-2 flex justify-end border-t pt-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(r); setEditOpen(true); }}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={rows.length > 0 && rows.every((r) => selected[r.id])}
                      onCheckedChange={(v) => {
                        const next = { ...selected };
                        for (const r of rows) next[r.id] = !!v;
                        setSelected(next);
                      }}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Aliases</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No records found.</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id} data-state={selected[r.id] ? "selected" : undefined}>
                    <TableCell><Checkbox checked={!!selected[r.id]} onCheckedChange={(v) => setSelected({ ...selected, [r.id]: !!v })} /></TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.code || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">{(r.aliases ?? []).join(", ") || "—"}</TableCell>
                    <TableCell><Badge variant={r.status === "active" ? "default" : r.status === "deleted" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setEditOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page} of {pages} · {total} total</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <EditDialog
        open={editOpen} onOpenChange={setEditOpen} initial={editing}
        onSave={async (form) => {
          await upsert({ data: { kind, tenant_id: tenantId, id: editing?.id, ...form } });
          toast.success(editing ? "Updated" : "Created");
          setEditOpen(false); invalidateAll();
        }}
      />
      <MergeDialog
        open={mergeOpen} onOpenChange={setMergeOpen} rows={rows.filter((r) => selected[r.id])}
        onMerge={async (target_id) => {
          const source_ids = selectedIds.filter((id) => id !== target_id);
          const res = await merge({ data: { kind, tenant_id: tenantId, source_ids, target_id } });
          toast.success(`Merged ${res.merged_sources} record(s); ${res.affected_products} product(s) re-pointed`);
          setMergeOpen(false); setSelected({}); invalidateAll();
        }}
      />
      <ImportDialog
        open={importOpen} onOpenChange={setImportOpen}
        onPreview={(rows) => previewFn({ data: { kind, tenant_id: tenantId, rows } })}
        onCommit={async (rows) => {
          const r = await commitFn({ data: { kind, tenant_id: tenantId, rows } });
          toast.success(`Imported ${r.inserted} new (${r.skipped} skipped)`);
          setImportOpen(false); invalidateAll();
        }}
      />
      <AuditDialog
        open={auditOpen} onOpenChange={setAuditOpen}
        load={() => auditFn({ data: { kind, tenant_id: tenantId, limit: 100 } })}
      />
    </AppShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "ok" | "warn" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold ${tone === "warn" ? "text-amber-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EditDialog({ open, onOpenChange, initial, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; initial: MasterRow | null;
  onSave: (form: { name: string; code: string | null; description: string | null; status: "active" | "inactive"; aliases: string[] }) => Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", code: "", description: "", status: "active" as "active" | "inactive", aliases: "" });
  useEffect(() => {
    if (open) {
      setForm({
        name: initial?.name ?? "",
        code: initial?.code ?? "",
        description: ((initial as any)?.description as string | null) ?? "",
        status: (initial?.status === "inactive" ? "inactive" : "active"),
        aliases: (initial?.aliases ?? []).join(", "),
      });
    }
  }, [open, initial]);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit" : "New"}</DialogTitle>
          <DialogDescription>Master data record</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Auto-filled from name if blank" /></div>
          <div className="space-y-1"><Label>Aliases (comma separated)</Label><Input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1"><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!form.name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  name: form.name.trim(),
                  code: form.code.trim() || null,
                  description: form.description.trim() || null,
                  status: form.status,
                  aliases: form.aliases.split(",").map((s) => s.trim()).filter(Boolean),
                });
              } catch (e) { toast.error((e as Error).message); }
              finally { setSaving(false); }
            }}
          >{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({ open, onOpenChange, rows, onMerge }: {
  open: boolean; onOpenChange: (v: boolean) => void; rows: MasterRow[];
  onMerge: (target_id: string) => Promise<void>;
}) {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => { if (open && rows[0]) setTarget(rows[0].id); }, [open, rows]);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge duplicates</DialogTitle>
          <DialogDescription>Pick the row to keep. Every product currently linked to the other rows will be re-pointed to this one. The other rows will be soft-deleted and added as aliases.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-72 overflow-auto rounded border p-2">
          {rows.map((r) => (
            <label key={r.id} className="flex items-center gap-2 rounded p-2 hover:bg-accent">
              <input type="radio" checked={target === r.id} onChange={() => setTarget(r.id)} />
              <div className="flex-1">
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.code || "no code"} · {r.status}</div>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!target || busy}
            onClick={async () => { if (!target) return; setBusy(true); try { await onMerge(target); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }}
          >{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Merge</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange, onPreview, onCommit }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onPreview: (rows: { name: string; code?: string | null; aliases?: string[]; description?: string | null }[]) => Promise<ImportPreviewRow[]>;
  onCommit: (rows: { name: string; code?: string | null; aliases?: string[]; description?: string | null }[]) => Promise<void>;
}) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const parseCsv = (): { name: string; code?: string | null; aliases?: string[]; description?: string | null }[] => {
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const header = lines[0].toLowerCase().split(",").map((s) => s.trim());
    const hasHeader = header.includes("name");
    const data = hasHeader ? lines.slice(1) : lines;
    const cols = hasHeader ? header : ["name", "code", "aliases", "description"];
    return data.map((line) => {
      const cells = line.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      const row: any = {};
      cols.forEach((c, i) => { row[c] = cells[i] ?? ""; });
      return {
        name: row.name ?? "",
        code: row.code || null,
        aliases: row.aliases ? String(row.aliases).split(";").map((s: string) => s.trim()).filter(Boolean) : [],
        description: row.description || null,
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setCsv(""); setPreview(null); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import records</DialogTitle>
          <DialogDescription>Paste CSV with columns: name, code, aliases (semicolon-separated), description.</DialogDescription>
        </DialogHeader>
        {!preview ? (
          <>
            <Textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"name,code,aliases,description\nACME Laboratories Ltd.,ACME,ACME LAB;ACME,"} />
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={busy || !csv.trim()} onClick={async () => {
                setBusy(true);
                try { const p = await onPreview(parseCsv()); setPreview(p); }
                catch (e) { toast.error((e as Error).message); }
                finally { setBusy(false); }
              }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Preview</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="max-h-72 overflow-auto rounded border">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
                <TableBody>
                  {preview.map((r) => (
                    <TableRow key={r.index}>
                      <TableCell>{r.index + 1}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "new" ? "default" : r.status === "invalid" ? "destructive" : "secondary"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.reason ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-sm text-muted-foreground">
              {preview.filter((p) => p.status === "new").length} new ·{" "}
              {preview.filter((p) => p.status === "duplicate_in_db").length} already exists ·{" "}
              {preview.filter((p) => p.status === "duplicate_in_file").length} dup in file ·{" "}
              {preview.filter((p) => p.status === "invalid").length} invalid
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreview(null)}>Back</Button>
              <Button disabled={busy} onClick={async () => {
                setBusy(true);
                try {
                  const rows = parseCsv().filter((_, i) => preview[i]?.status === "new");
                  await onCommit(rows);
                } catch (e) { toast.error((e as Error).message); }
                finally { setBusy(false); }
              }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import {preview.filter((p) => p.status === "new").length}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditDialog({ open, onOpenChange, load }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  load: () => Promise<Array<{ id: number; master_id: string | null; action: string; before: any; after: any; actor: string | null; occurred_at: string }>>;
}) {
  const q = useQuery({
    queryKey: ["master-audit", open],
    enabled: open,
    queryFn: load,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Audit history</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded border">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Master ID</TableHead><TableHead>Actor</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.isLoading && <TableRow><TableCell colSpan={4} className="text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>}
              {(q.data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.occurred_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{r.master_id?.slice(0, 8) ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.actor?.slice(0, 8) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
