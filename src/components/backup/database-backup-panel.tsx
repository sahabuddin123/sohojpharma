import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Database, Download, Upload, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getBackupCatalog, exportTableChunk, restoreTableChunk, type CatalogTable } from "@/lib/api/db-backup.functions";
import { buildSql, buildSqlite, readSqlite, downloadBlob, type TableDump } from "@/lib/db-backup-client";

const CHUNK = 1000;

export function DatabaseBackupPanel({ scope, tenantId, label }: { scope: "full" | "tenant"; tenantId?: string; label: string }) {
  const catalogFn = useServerFn(getBackupCatalog);
  const exportFn = useServerFn(exportTableChunk);
  const restoreFn = useServerFn(restoreTableChunk);
  const [busy, setBusy] = useState<null | "sql" | "sqlite" | "restore">(null);
  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const collect = async (): Promise<TableDump[]> => {
    const tables = (await catalogFn({ data: { scope, tenant_id: tenantId } })) as CatalogTable[];
    const dumps: TableDump[] = [];
    let failed = 0;
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      setStatus(`${t.table_name} (${i + 1}/${tables.length})`);
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += CHUNK) {
        const res = await exportFn({ data: { scope, tenant_id: tenantId, table: t.table_name, offset, limit: CHUNK } });
        if (res.error) { failed++; break; }
        rows.push(...res.rows);
        if (res.rows.length < CHUNK) break;
      }
      dumps.push({ table: t, rows });
      setPct(Math.round(((i + 1) / tables.length) * 100));
    }
    if (failed) toast.warning(`${failed} table(s) could not be read and were skipped.`);
    return dumps;
  };

  const runBackup = async (fmt: "sql" | "sqlite") => {
    setBusy(fmt); setPct(0);
    try {
      const dumps = await collect();
      setStatus("Building file…");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const base = `${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${stamp}`;
      if (fmt === "sql") downloadBlob(buildSql(dumps, label), `${base}.sql`, "application/sql");
      else downloadBlob((await buildSqlite(dumps)) as BlobPart, `${base}.sqlite`, "application/vnd.sqlite3");
      const total = dumps.reduce((s, d) => s + d.rows.length, 0);
      toast.success(`Backup ready — ${dumps.length} tables, ${total.toLocaleString()} rows`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null); setStatus("");
    }
  };

  const runRestore = async (file: File) => {
    if (!tenantId) return;
    if (!confirm("Restore this backup into your store? Existing records with the same ID will be replaced with the backup version.")) return;
    setBusy("restore"); setPct(0);
    try {
      const dumps = (await readSqlite(file)).filter((d) => d.rows.length && d.table.has_id && d.table.has_tenant_id);
      let restored = 0, errors = 0;
      // Up to 3 passes so tables that depend on others succeed once parents exist.
      let pending = dumps;
      for (let pass = 0; pass < 3 && pending.length; pass++) {
        const retry: TableDump[] = [];
        for (let i = 0; i < pending.length; i++) {
          const d = pending[i];
          setStatus(`Pass ${pass + 1}: ${d.table.table_name}`);
          let ok = true;
          for (let o = 0; o < d.rows.length; o += 500) {
            const res = await restoreFn({ data: { tenant_id: tenantId, table: d.table.table_name, rows: d.rows.slice(o, o + 500) as any } });
            if (res.error) { ok = false; break; }
            restored += res.restored;
          }
          if (!ok) retry.push(d);
          setPct(Math.round(((i + 1) / pending.length) * 100));
        }
        pending = retry;
      }
      errors = pending.length;
      if (errors) toast.warning(`Restored ${restored.toLocaleString()} rows; ${errors} table(s) could not be restored.`);
      else toast.success(`Restore complete — ${restored.toLocaleString()} rows restored`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null); setStatus("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">{scope === "full" ? "Full database backup" : "Store database backup"}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {scope === "full"
          ? "Download every table of the whole platform in one click."
          : "Download all of your store's data, or restore it from a SQLite backup file."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => runBackup("sql")} disabled={!!busy}>
          {busy === "sql" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Backup (MySQL .sql)
        </Button>
        <Button variant="secondary" onClick={() => runBackup("sqlite")} disabled={!!busy}>
          {busy === "sqlite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Backup (.sqlite)
        </Button>
        {scope === "tenant" && (
          <>
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Restore (.sqlite)
            </Button>
            <input ref={fileRef} type="file" accept=".sqlite,.db" className="hidden"
              onChange={(e) => e.target.files?.[0] && runRestore(e.target.files[0])} />
          </>
        )}
      </div>
      {busy && (
        <div className="space-y-1">
          <Progress value={pct} />
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
      )}
      {scope === "tenant" && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          Restore uses the .sqlite file from this page. It brings back products, stock, sales, customers and other store records; account, subscription and staff-permission data are never changed.
        </p>
      )}
    </div>
  );
}
