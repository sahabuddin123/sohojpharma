import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { processImportChunk, getImportJob } from "@/lib/api/global-import.functions";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Loader2 } from "lucide-react";

type JobRow = {
  id: string; status: string; total_items: number; processed_items: number;
  success_count: number; failed_count: number; skipped_count: number;
  started_at: string | null; completed_at: string | null;
};

export function ImportProgressDialog({
  jobId, open, onClose,
}: { jobId: string | null; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const chunk = useServerFn(processImportChunk);
  const getJob = useServerFn(getImportJob);
  const [job, setJob] = useState<JobRow | null>(null);
  const runningRef = useRef(false);

  // Realtime subscription
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    getJob({ data: { job_id: jobId } }).then((r) => { if (!cancelled && r) setJob(r as JobRow); });
    const ch = supabase.channel(`import-job-${jobId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "import_jobs", filter: `id=eq.${jobId}` },
        (payload) => setJob(payload.new as JobRow))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [jobId, getJob]);

  // Drive chunk processing from the client
  useEffect(() => {
    if (!jobId || runningRef.current) return;
    runningRef.current = true;
    (async () => {
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const r = await chunk({ data: { job_id: jobId, batch: 100 } });
          setJob((prev) => prev ? {
            ...prev,
            status: r.status,
            processed_items: r.processed,
            success_count: r.imported,
            skipped_count: r.skipped,
            failed_count: r.failed,
            total_items: r.total,
          } : prev);
          if (!r.has_more) break;
        }
      } catch (e) {
        console.error("import chunk error", e);
      } finally {
        runningRef.current = false;
      }
    })();
  }, [jobId, chunk]);

  const total = job?.total_items ?? 0;
  const processed = job?.processed_items ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const remaining = Math.max(0, total - processed);
  const done = job?.status === "completed" || job?.status === "failed";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && done) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Loader2 className="h-5 w-5 animate-spin" />}
            {done ? "Import Complete" : "Inventory Import Running"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Progress value={pct} />
          <div className="text-center text-sm font-medium">
            {processed.toLocaleString()} / {total.toLocaleString()} ({pct}%)
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <Stat label="Imported" v={job?.success_count ?? 0} />
            <Stat label="Skipped" v={job?.skipped_count ?? 0} />
            <Stat label="Failed" v={job?.failed_count ?? 0} />
            <Stat label="Remaining" v={remaining} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {done ? (
            <>
              <Button variant="ghost" onClick={onClose}>Close</Button>
              <Button variant="outline" onClick={() => { onClose(); navigate({ to: "/products" }); }}>
                View Imported Products
              </Button>
              <Button onClick={() => { onClose(); navigate({ to: "/inventory" }); }}>
                Go To Inventory
              </Button>
            </>
          ) : (
            <Button variant="ghost" disabled>Processing…</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded border p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{v.toLocaleString()}</div>
    </div>
  );
}
