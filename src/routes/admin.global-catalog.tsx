import { createFileRoute } from "@tanstack/react-router";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Globe2, Play, ListChecks, Layers, Barcode, RefreshCw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  adminCatalogStats, adminListContributions, adminListMedicines,
  approveContribution, rejectContribution,
  runBackfillChunk, runLinker, runSeedContributions, runBarcodeMigration, pushCatalogToTenants, provisionAllTenants,
  listMatchReviews, approveMatchReview, rejectMatchReview, bulkApproveMatchReviews,
  getDuplicateReport,
  listAutoSyncStores, setStoreAutoSync, syncMissingForStore,
} from "@/lib/api/global-catalog.functions";

export const Route = createFileRoute("/admin/global-catalog")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Global Medicine Catalog — SohojPharma Admin" }] }),
  component: GlobalCatalogAdminPage,
});

function GlobalCatalogAdminPage() {
  return (
    <AppShell variant="admin">
      <PageHeader
        title="Global Medicine Catalog"
        description="Shared medicine reference data. Backfill, link, review, and approve."
        actions={<Globe2 className="h-5 w-5 text-primary" />}
      />
      <Stats />
      <Tabs defaultValue="backfill" className="mt-4">
        <TabsList>
          <TabsTrigger value="backfill"><Play className="mr-1 h-4 w-4" />Backfill</TabsTrigger>
          <TabsTrigger value="reviews"><ListChecks className="mr-1 h-4 w-4" />Match Reviews</TabsTrigger>
          <TabsTrigger value="contributions">Contributions</TabsTrigger>
          <TabsTrigger value="medicines">Medicines</TabsTrigger>
          <TabsTrigger value="duplicates"><Layers className="mr-1 h-4 w-4" />Duplicates</TabsTrigger>
          <TabsTrigger value="autosync"><RefreshCw className="mr-1 h-4 w-4" />Auto-Sync</TabsTrigger>
        </TabsList>
        <TabsContent value="backfill"><BackfillTab /></TabsContent>
        <TabsContent value="reviews"><MatchReviewsTab /></TabsContent>
        <TabsContent value="contributions"><ContributionsTab /></TabsContent>
        <TabsContent value="medicines"><MedicinesTab /></TabsContent>
        <TabsContent value="duplicates"><DuplicatesTab /></TabsContent>
        <TabsContent value="autosync"><AutoSyncTab /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

function Stats() {
  const fn = useServerFn(adminCatalogStats);
  const { data } = useQuery({ queryKey: ["global-catalog-stats"], queryFn: () => fn() });
  const items = [
    { k: "global_medicines", label: "Total Meds" },
    { k: "approved_medicines", label: "Approved Meds" },
    { k: "global_generics", label: "Generics" },
    { k: "global_manufacturers", label: "Manufacturers" },
    { k: "global_barcodes", label: "Barcodes" },
    { k: "linked_products", label: "Linked" },
    { k: "unlinked_products", label: "Unlinked" },
    { k: "pending_reviews", label: "Pending Reviews" },
    { k: "pending_contributions", label: "Pending Contribs" },
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {items.map(({ k, label }) => (
        <Card key={k}><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{(data?.[k] as number | undefined) ?? "—"}</div>
        </CardContent></Card>
      ))}
    </div>
  );
}

function BackfillTab() {
  const qc = useQueryClient();
  const syncChunk = useServerFn(runBackfillChunk);
  const linker = useServerFn(runLinker);
  const seed = useServerFn(runSeedContributions);
  const bar = useServerFn(runBarcodeMigration);
  const push = useServerFn(pushCatalogToTenants);
  const provision = useServerFn(provisionAllTenants);
  const [progress, setProgress] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ processed: number; meds: number; linked: number; provisioned?: number } | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["global-catalog-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-match-reviews"] });
    qc.invalidateQueries({ queryKey: ["admin-contribs"] });
    qc.invalidateQueries({ queryKey: ["catalog-dupes"] });
  };
  const m1 = useMutation({
    mutationFn: async () => {
      let after: string | null = null;
      let processed = 0, meds = 0, linked = 0, gens = 0, mfrs = 0;
      // Chunked loop — avoids statement timeouts on 30k+ product catalogs.
      for (let i = 0; i < 500; i++) {
        const r = await syncChunk({ data: { limit: 1000, after } }) as any;
        processed += r.processed;
        meds += r.medicines_created;
        linked += r.linked;
        gens += r.generics_created;
        mfrs += r.manufacturers_created;
        setProgress(`Processed ${processed.toLocaleString()} products • ${meds.toLocaleString()} medicines • ${linked.toLocaleString()} linked`);
        qc.invalidateQueries({ queryKey: ["global-catalog-stats"] });
        if (r.done || !r.next_cursor) break;
        after = r.next_cursor;
      }
      return { processed, meds, linked, gens, mfrs };
    },
    onSuccess: (r) => { setProgress(null); toast.success(`Backfill complete: ${r.meds} medicines, ${r.gens} generics, ${r.mfrs} mfrs, ${r.linked} products linked`); invalidate(); },
    onError: (e: Error) => { setProgress(null); toast.error(e.message); },
  });
  const m2 = useMutation({ mutationFn: () => linker(), onSuccess: (r) => { toast.success(`Linked ${r.linked_count}; ${r.unlinked_count} remain unlinked`); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const m3 = useMutation({ mutationFn: () => seed({ data: { limit: 10000 } }), onSuccess: (r) => { toast.success(`Queued ${r.reviews_created} reviews + ${r.contributions_created} contributions`); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const m4 = useMutation({ mutationFn: () => bar(), onSuccess: (r) => { toast.success(`Inserted ${r.barcodes_inserted}; ${r.conflicting_barcodes} conflicts`); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mPush = useMutation({
    mutationFn: async () => {
      // 1. Run backfill chunked to ensure all tenant data is in global catalog
      let after: string | null = null;
      let processed = 0, meds = 0, linked = 0;
      setProgress("Synchronizing store medicines to global catalog...");
      setSyncStatus({ processed: 0, meds: 0, linked: 0 });

      for (let i = 0; i < 500; i++) {
        const r = await syncChunk({ data: { limit: 1000, after } }) as any;
        processed += r.processed;
        meds += r.medicines_created;
        linked += r.linked;

        setSyncStatus({ processed, meds, linked });
        setProgress(`Backfilling: ${processed.toLocaleString()} products processed...`);

        if (r.done || !r.next_cursor) break;
        after = r.next_cursor;
      }

      // 2. Push/Link back to all stores — batched to avoid statement timeouts
      let pushed = 0;
      let remaining = 0;
      for (let i = 0; i < 500; i++) {
        const r = await push({ data: { limit: 500 } }) as any;
        pushed += r.linked_count;
        remaining = r.unlinked_remaining ?? 0;
        linked += r.linked_count;
        setSyncStatus({ processed, meds, linked });
        setProgress(`Pushing to stores: ${pushed.toLocaleString()} linked • ${remaining.toLocaleString()} remaining...`);
        qc.invalidateQueries({ queryKey: ["global-catalog-stats"] });
        if (r.done || r.linked_count === 0 || remaining === 0) break;
      }

      // 3. Provision catalog for all tenants to ensure new stores get the 32k catalog
      setProgress("Provisioning global catalog to all branches...");
      const result = await provision();
      if (result.success) {
        setSyncStatus(prev => prev ? { ...prev, provisioned: result.count } : null);
      }

      return { linked_count: pushed, remaining };
    },
    onSuccess: (r) => {
      setProgress(null);
      setSyncStatus(null);
      toast.success(`Sync Complete: Linked ${r.linked_count.toLocaleString()} products across all stores.`);
      invalidate();
    },
    onError: (e: Error) => {
      setProgress(null);
      setSyncStatus(null);
      toast.error(e.message);
    },
  });

  const Step = ({ n, title, desc, btn, run, busy }: { n: number; title: string; desc: ReactNode; btn: string; run: () => void; busy: boolean }) => (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <div className="text-sm font-medium">Step {n} — {title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Button onClick={run} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}{btn}</Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="mt-4 grid gap-3">
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-bold text-primary">Master Synchronization</div>
              {mPush.isPending && (
                <Badge variant="outline" className="animate-pulse bg-primary/10 text-[10px] text-primary">
                  IN PROGRESS
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {progress ?? "One-click: Pull unique medicines from all stores → Add to Global Catalog → Update all stores with new data."}
            </div>
            
            {syncStatus && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-medium text-primary/80">
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  Processed: {syncStatus.processed.toLocaleString()}
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  Medicines: {syncStatus.meds.toLocaleString()}
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-primary" />
                  Linked: {syncStatus.linked.toLocaleString()}
                </div>
                {syncStatus.provisioned !== undefined && (
                  <div className="flex items-center gap-1">
                    <div className="h-1 w-1 rounded-full bg-primary" />
                    Provisioned: {syncStatus.provisioned.toLocaleString()} Stores
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button 
              size="lg" 
              onClick={() => mPush.mutate()} 
              disabled={mPush.isPending} 
              className="w-full bg-primary hover:bg-primary/90 sm:w-auto"
            >
              {mPush.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Synchronizing...
                </>
              ) : (
                <>
                  <Globe2 className="mr-2 h-5 w-5" />
                  Sync & Push to All Stores
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Step n={1} title="Backfill Global Catalog" desc={progress ?? "Populate global_generics, global_manufacturers, global_medicines from tenant data (runs in batches, also links products)."} btn="Run Backfill" run={() => m1.mutate()} busy={m1.isPending} />
      <Step n={2} title="Link Products" desc="Set products.global_medicine_id by exact normalized match." btn="Run Linker" run={() => m2.mutate()} busy={m2.isPending} />
      <Step n={3} title="Seed Review Queue & Contributions" desc="Fuzzy matches → review queue. No match → contribution queue." btn="Seed Queue" run={() => m3.mutate()} busy={m3.isPending} />
      <Step n={4} title="Migrate Barcodes" desc={<>Promote consistent <Barcode className="inline h-3 w-3" /> barcodes to global_barcodes.</>} btn="Migrate" run={() => m4.mutate()} busy={m4.isPending} />

      <div className="rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-muted-foreground">
        Safe: never deletes products, inventory, batches, sales, purchases. Only inserts global rows and updates products.global_medicine_id.
      </div>
    </div>
  );
}

function MatchReviewsTab() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [minConf, setMinConf] = useState(0.85);
  const listFn = useServerFn(listMatchReviews);
  const approveFn = useServerFn(approveMatchReview);
  const rejectFn = useServerFn(rejectMatchReview);
  const bulkFn = useServerFn(bulkApproveMatchReviews);
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-match-reviews", status],
    queryFn: () => listFn({ data: { status, limit: 200 } }),
  });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["admin-match-reviews"] }); qc.invalidateQueries({ queryKey: ["global-catalog-stats"] }); };
  const approveM = useMutation({ mutationFn: (id: string) => approveFn({ data: { id } }), onSuccess: () => { toast.success("Approved"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const rejectM = useMutation({ mutationFn: ({ id, notes }: { id: string; notes: string }) => rejectFn({ data: { id, notes } }), onSuccess: () => { toast.success("Rejected"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const bulkM = useMutation({ mutationFn: () => bulkFn({ data: { min_confidence: minConf } }), onSuccess: (r) => { toast.success(`Bulk approved ${r.approved}`); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Match Reviews</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <Button key={s} variant={s === status ? "default" : "outline"} size="sm" onClick={() => setStatus(s)}>{s}</Button>
          ))}
          {status === "pending" && (
            <>
              <Input type="number" step="0.05" min="0" max="1" value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="w-24" />
              <Button size="sm" onClick={() => bulkM.mutate()} disabled={bulkM.isPending}>
                <CheckCircle2 className="mr-1 h-4 w-4" />Bulk Approve ≥ {minConf}
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
          : rows.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">No {status} reviews.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Tenant Product</TableHead><TableHead>Suggested Global</TableHead>
                <TableHead>Confidence</TableHead><TableHead>Level</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const prod = r.product as { name?: string; strength?: string; medicine_type?: string } | null;
                  const sug = r.suggested as { brand_name?: string; strength?: string; dosage_form?: string } | null;
                  const conf = Number(r.confidence ?? 0);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{prod?.name ?? r.product_id}</div>
                        <div className="text-xs text-muted-foreground">{[prod?.strength, prod?.medicine_type].filter(Boolean).join(" · ")}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{sug?.brand_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{[sug?.strength, sug?.dosage_form].filter(Boolean).join(" · ")}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={conf >= 0.85 ? "default" : conf >= 0.6 ? "secondary" : "outline"}>{conf.toFixed(2)}</Badge>
                      </TableCell>
                      <TableCell><Badge variant="outline">L{r.match_level}</Badge></TableCell>
                      <TableCell className="text-right">
                        {status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => approveM.mutate(r.id)} disabled={approveM.isPending}>
                              <CheckCircle2 className="mr-1 h-4 w-4" />Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => {
                              const notes = window.prompt("Rejection reason?") ?? "";
                              rejectM.mutate({ id: r.id, notes });
                            }} disabled={rejectM.isPending}>
                              <XCircle className="mr-1 h-4 w-4" />Reject
                            </Button>
                          </div>
                        ) : (
                          <Badge variant={status === "approved" ? "default" : "secondary"}>{status}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

function ContributionsTab() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const listFn = useServerFn(adminListContributions);
  const approveFn = useServerFn(approveContribution);
  const rejectFn = useServerFn(rejectContribution);
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-contribs", status],
    queryFn: () => listFn({ data: { status } }),
  });
  const approveM = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => { toast.success("Approved"); qc.invalidateQueries({ queryKey: ["admin-contribs"] }); qc.invalidateQueries({ queryKey: ["global-catalog-stats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rejectM = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => rejectFn({ data: { id, notes } }),
    onSuccess: () => { toast.success("Rejected"); qc.invalidateQueries({ queryKey: ["admin-contribs"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Contributions</CardTitle>
        <div className="flex gap-2">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <Button key={s} variant={s === status ? "default" : "outline"} size="sm" onClick={() => setStatus(s)}>{s}</Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
          : rows.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">No {status} contributions.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Brand</TableHead><TableHead>Generic</TableHead><TableHead>Mfr</TableHead>
                <TableHead>Strength</TableHead><TableHead>Form</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const p = (r.proposed_data ?? {}) as Record<string, string | undefined>;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{p.brand_name ?? "—"}</TableCell>
                      <TableCell>{p.generic_name ?? "—"}</TableCell>
                      <TableCell>{p.manufacturer_name ?? "—"}</TableCell>
                      <TableCell>{p.strength ?? "—"}</TableCell>
                      <TableCell>{p.dosage_form ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => approveM.mutate(r.id)} disabled={approveM.isPending}>
                              <CheckCircle2 className="mr-1 h-4 w-4" />Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => {
                              const notes = window.prompt("Rejection reason?") ?? "";
                              rejectM.mutate({ id: r.id, notes });
                            }} disabled={rejectM.isPending}>
                              <XCircle className="mr-1 h-4 w-4" />Reject
                            </Button>
                          </div>
                        ) : (
                          <Badge variant={status === "approved" ? "default" : "secondary"}>{status}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

function MedicinesTab() {
  const [q, setQ] = useState("");
  const listFn = useServerFn(adminListMedicines);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-global-medicines", q],
    queryFn: () => listFn({ data: { q, limit: 100 } }),
  });
  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Global Medicines</CardTitle>
        <Input className="max-w-xs" placeholder="Search brand…" value={q} onChange={(e) => setQ(e.target.value)} />
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
          : rows.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">No medicines yet. Run Backfill to populate.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Brand</TableHead><TableHead>Generic</TableHead><TableHead>Mfr</TableHead>
                <TableHead>Strength</TableHead><TableHead>Form</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((m) => {
                  const gen = (m.generic as { name?: string } | null)?.name;
                  const mfr = (m.manufacturer as { name?: string } | null)?.name;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.brand_name}</TableCell>
                      <TableCell>{gen ?? "—"}</TableCell>
                      <TableCell>{mfr ?? "—"}</TableCell>
                      <TableCell>{m.strength ?? "—"}</TableCell>
                      <TableCell>{m.dosage_form ?? "—"}</TableCell>
                      <TableCell><Badge variant={m.approved ? "default" : "secondary"}>{m.approved ? "approved" : "pending"}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

function DuplicatesTab() {
  const fn = useServerFn(getDuplicateReport);
  const { data: rows = [], isLoading } = useQuery({ queryKey: ["catalog-dupes"], queryFn: () => fn() });
  return (
    <Card className="mt-4">
      <CardHeader><CardTitle className="text-base">Duplicate Report</CardTitle></CardHeader>
      <CardContent className="p-0">
        {isLoading ? <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
          : rows.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">No duplicates detected.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Kind</TableHead><TableHead>Key</TableHead><TableHead className="text-right">Count</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.kind}-${i}`}>
                    <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{r.key}</TableCell>
                    <TableCell className="text-right">{r.cnt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

function AutoSyncTab() {
  const qc = useQueryClient();
  const list = useServerFn(listAutoSyncStores);
  const toggle = useServerFn(setStoreAutoSync);
  const catchUp = useServerFn(syncMissingForStore);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["auto-sync-stores"], queryFn: () => list() });

  const mToggle = useMutation({
    mutationFn: (v: { tenant_id: string; enabled: boolean }) => toggle({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-sync-stores"] }); toast.success("Auto-sync updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mCatchUp = useMutation({
    mutationFn: async (tenant_id: string) => {
      let added = 0;
      for (let i = 0; i < 40; i++) {
        const r = await catchUp({ data: { tenant_id, limit: 2000 } });
        added += r.added;
        setBusy(`Synced ${added.toLocaleString()} medicines…`);
        qc.invalidateQueries({ queryKey: ["auto-sync-stores"] });
        if (r.added === 0) break;
      }
      return added;
    },
    onSuccess: (n) => { setBusy(null); toast.success(`Catch-up complete — ${n.toLocaleString()} medicines added`); qc.invalidateQueries({ queryKey: ["auto-sync-stores"] }); },
    onError: (e: Error) => { setBusy(null); toast.error(e.message); },
  });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Catalog Auto-Sync</CardTitle>
        <p className="text-sm text-muted-foreground">
          When auto-sync is on, every newly approved global medicine is added to the store automatically
          (brand, generic, company, strength and last known price). Use catch-up to backfill anything missed.
        </p>
      </CardHeader>
      <CardContent>
        {busy ? <div className="mb-3 text-sm text-muted-foreground">{busy}</div> : null}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading stores…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Synced medicines</TableHead>
                <TableHead>Auto-sync</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((s) => {
                const missing = Math.max(0, (s.total_approved ?? 0) - (s.linked ?? 0));
                return (
                  <TableRow key={s.tenant_id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      {(s.linked ?? 0).toLocaleString()} / {(s.total_approved ?? 0).toLocaleString()}
                      {missing > 0 ? <Badge variant="secondary" className="ml-2">{missing.toLocaleString()} missing</Badge> : null}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={!!s.auto_sync}
                        onCheckedChange={(v) => mToggle.mutate({ tenant_id: s.tenant_id, enabled: v })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mCatchUp.isPending}
                        onClick={() => mCatchUp.mutate(s.tenant_id)}
                      >
                        {mCatchUp.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                        Sync now
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
