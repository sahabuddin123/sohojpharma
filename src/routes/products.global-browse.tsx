import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RouteErrorPanel } from "@/components/route-error";
import { Loader2, Globe2, ScanLine, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  browseGlobalCatalog, bulkAdoptGlobal, bulkLinkLocal,
  barcodeLookupGlobal, tenantCatalogHealth,
} from "@/lib/api/global-adoption.functions";
import { GlobalSearch } from "@/components/global-catalog/global-search";
import { AdoptionSuggestionsWidget } from "@/components/global-catalog/adoption-suggestions-widget";
import { ImportWizardDialog, type ImportOptions } from "@/components/global-catalog/import-wizard-dialog";
import { ImportProgressDialog } from "@/components/global-catalog/import-progress-dialog";
import { startGlobalImport } from "@/lib/api/global-import.functions";
import { Download } from "lucide-react";

export const Route = createFileRoute("/products/global-browse")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Global Catalog Browser — SohojPharma" }] }),
  component: GlobalBrowsePage,
});

function GlobalBrowsePage() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [presOnly, setPresOnly] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [barcode, setBarcode] = useState("");

  const browse = useServerFn(browseGlobalCatalog);
  const adopt = useServerFn(bulkAdoptGlobal);
  const linker = useServerFn(bulkLinkLocal);
  const lookup = useServerFn(barcodeLookupGlobal);
  const health = useServerFn(tenantCatalogHealth);

  const browseQ = useQuery({
    enabled: !!tenantId,
    queryKey: ["global-browse", tenantId, q, presOnly],
    queryFn: () => browse({ data: { tenant_id: tenantId, q, prescription_only: presOnly, limit: 100, offset: 0 } }),
  });

  const healthQ = useQuery({
    enabled: !!tenantId,
    queryKey: ["tenant-catalog-health", tenantId],
    queryFn: () => health({ data: { tenant_id: tenantId } }),
  });

  const rows = browseQ.data ?? [];
  const total = rows[0]?.total_count ?? 0;

  const adoptMut = useMutation({
    mutationFn: (ids: string[]) => adopt({ data: { tenant_id: tenantId, global_medicine_ids: ids } }),
    onSuccess: (res) => {
      toast.success(t("global.adopt.success", { defaultValue: "Added {{c}}, skipped {{s}}", c: res.created_count, s: res.skipped_count }));
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["global-browse"] });
      qc.invalidateQueries({ queryKey: ["tenant-catalog-health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkMut = useMutation({
    mutationFn: () => linker({ data: { tenant_id: tenantId, limit: 1000 } }),
    onSuccess: (res) => {
      toast.success(t("global.link.success", { defaultValue: "Matched {{m}} of {{s}}", m: res.matched_count, s: res.scanned_count }));
      qc.invalidateQueries({ queryKey: ["tenant-catalog-health"] });
      qc.invalidateQueries({ queryKey: ["global-browse"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const barcodeMut = useMutation({
    mutationFn: () => lookup({ data: { barcode } }),
    onSuccess: (res) => {
      if (!res) { toast.error(t("global.barcode.notFound", { defaultValue: "No match" })); return; }
      setSelected(new Set([res.global_medicine_id]));
      toast.success(`${res.brand_name} ${res.strength ?? ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Import system ----
  const startImport = useServerFn(startGlobalImport);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [scope, setScope] = useState<"selected" | "search" | "all">("all");
  const [jobId, setJobId] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);

  const startMut = useMutation({
    mutationFn: (opts: ImportOptions) => startImport({
      data: {
        tenant_id: tenantId,
        scope,
        medicine_ids: scope === "selected" ? [...selected] : [],
        filter_q: scope === "search" ? q : null,
        filter_rx_only: scope === "search" ? presOnly : null,
        options: opts,
      },
    }),
    onSuccess: (res) => {
      setWizardOpen(false);
      setJobId(res.job_id);
      setProgressOpen(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openWizard = (s: "selected" | "search" | "all") => {
    if (s === "selected" && selected.size === 0) {
      toast.error("Select at least one medicine"); return;
    }
    setScope(s);
    setWizardOpen(true);
  };

  const allChecked = useMemo(() => rows.length > 0 && rows.every(r => r.already_in_catalog || selected.has(r.id)), [rows, selected]);

  return (
    <AppShell variant="store" title={t("global.browse.title", { defaultValue: "Global Catalog Browser" })}>
      <PageHeader
        title={t("global.browse.title", { defaultValue: "Global Catalog Browser" })}
        description={t("global.browse.desc", { defaultValue: "Browse the global medicine network and add to your store catalog." })}
      />

      {/* Catalog health widget */}
      <Card className="mb-4">
        <CardHeader><CardTitle>{t("global.health.title", { defaultValue: "Store Catalog Health" })}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label={t("global.health.total", { defaultValue: "Total" })} v={healthQ.data?.total ?? 0} />
          <Stat label={t("global.health.linked", { defaultValue: "Linked" })} v={healthQ.data?.linked ?? 0} />
          <Stat label={t("global.health.unlinked", { defaultValue: "Unlinked" })} v={healthQ.data?.unlinked ?? 0} />
          <Stat label={t("global.health.coverage", { defaultValue: "Coverage %" })} v={`${healthQ.data?.coverage_pct ?? 0}%`} />
          <div className="flex items-center">
            <Button size="sm" variant="secondary" onClick={() => linkMut.mutate()} disabled={linkMut.isPending}>
              {linkMut.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
              <Layers className="h-3 w-3 mr-2" />{t("global.link.button", { defaultValue: "Bulk Link Existing" })}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Unified global search + suggestions */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><GlobalSearch tenantId={tenantId} /></div>
        <AdoptionSuggestionsWidget tenantId={tenantId} />
      </div>

      {/* Filters + actions */}
      <Card className="mb-4">
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-12 gap-3">
          <Input className="md:col-span-4" placeholder={t("global.search.ph", { defaultValue: "Search brand or generic..." })}
                 value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="md:col-span-3 flex gap-2">
            <Input placeholder={t("global.barcode.ph", { defaultValue: "Scan barcode" })}
                   value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            <Button size="icon" variant="outline" onClick={() => barcodeMut.mutate()} disabled={!barcode || barcodeMut.isPending}>
              {barcodeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            </Button>
          </div>
          <div className="md:col-span-2 flex items-center gap-2">
            <Checkbox checked={presOnly === true} onCheckedChange={(v) => setPresOnly(v ? true : null)} />
            <span className="text-sm">{t("global.filter.prescription", { defaultValue: "Prescription only" })}</span>
          </div>
          <div className="md:col-span-3 flex justify-end gap-2">
            <Button onClick={() => adoptMut.mutate([...selected])} disabled={selected.size === 0 || adoptMut.isPending}>
              {adoptMut.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
              {t("global.adopt.button", { defaultValue: "Add To My Catalog" })} ({selected.size})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle>
            {t("global.results", { defaultValue: "Popular Medicines" })} — {Number(total).toLocaleString()}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openWizard("selected")} disabled={selected.size === 0}>
              <Download className="h-3 w-3 mr-2" /> Import Selected ({selected.size})
            </Button>
            <Button size="sm" variant="outline" onClick={() => openWizard("search")}>
              <Download className="h-3 w-3 mr-2" /> Import Search Results
            </Button>
            <Button size="sm" onClick={() => openWizard("all")}>
              <Download className="h-3 w-3 mr-2" /> Import Entire Catalog
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {browseQ.isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={allChecked} onCheckedChange={(v) => {
                      if (v) setSelected(new Set(rows.filter(r => !r.already_in_catalog).map(r => r.id)));
                      else setSelected(new Set());
                    }} />
                  </TableHead>
                  <TableHead>{t("global.col.brand", { defaultValue: "Brand" })}</TableHead>
                  <TableHead>{t("global.col.generic", { defaultValue: "Generic" })}</TableHead>
                  <TableHead>{t("global.col.mfr", { defaultValue: "Manufacturer" })}</TableHead>
                  <TableHead>{t("global.col.strength", { defaultValue: "Strength" })}</TableHead>
                  <TableHead>{t("global.col.form", { defaultValue: "Form" })}</TableHead>
                  <TableHead>{t("global.col.status", { defaultValue: "Status" })}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className={r.already_in_catalog ? "opacity-60" : ""}>
                    <TableCell>
                      <Checkbox
                        disabled={r.already_in_catalog}
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => {
                          const s = new Set(selected);
                          if (v) s.add(r.id); else s.delete(r.id);
                          setSelected(s);
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.brand_name}</TableCell>
                    <TableCell>{r.generic_name ?? "—"}</TableCell>
                    <TableCell>{r.manufacturer_name ?? "—"}</TableCell>
                    <TableCell>{r.strength ?? "—"}</TableCell>
                    <TableCell>{r.dosage_form ?? "—"}</TableCell>
                    <TableCell>
                      {r.already_in_catalog
                        ? <Badge variant="secondary">{t("global.status.inCatalog", { defaultValue: "Already in catalog" })}</Badge>
                        : r.prescription_required
                          ? <Badge variant="destructive">Rx</Badge>
                          : <Badge>OTC</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t("global.empty", { defaultValue: "No medicines found." })}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ImportWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        scopeLabel={
          scope === "selected" ? `Importing ${selected.size} selected medicines`
          : scope === "search" ? `Importing current search results`
          : "Importing the entire Global Catalog"
        }
        isPending={startMut.isPending}
        onConfirm={(opts) => startMut.mutate(opts)}
      />
      <ImportProgressDialog
        jobId={jobId}
        open={progressOpen}
        onClose={() => {
          setProgressOpen(false);
          setJobId(null);
          qc.invalidateQueries({ queryKey: ["global-browse"] });
          qc.invalidateQueries({ queryKey: ["tenant-catalog-health"] });
        }}
      />
    </AppShell>
  );
}

function Stat({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{typeof v === "number" ? v.toLocaleString() : v}</div>
    </div>
  );
}
