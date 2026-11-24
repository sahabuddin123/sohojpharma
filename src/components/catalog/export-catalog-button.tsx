import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportCatalogData } from "@/lib/api/catalog-export.functions";

type Kind = "products" | "generics" | "companies" | "categories";

function toCsv(header: string[], rows: string[][]): string {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return "﻿" + lines.join("\r\n");
}

export function ExportCatalogButton({ kind, tenantId, label = "Export" }: { kind: Kind; tenantId: string; label?: string }) {
  const run = useServerFn(exportCatalogData);
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    if (!tenantId || busy) return;
    setBusy(true);
    try {
      const { header, rows } = await run({ data: { tenantId, kind } });
      if (!rows.length) {
        toast.info("Nothing to export");
        return;
      }
      const blob = new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} ${kind}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={onExport} disabled={busy || !tenantId}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      {label}
    </Button>
  );
}
