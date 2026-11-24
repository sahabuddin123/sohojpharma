// FIFO Print Queue with enterprise features:
// - Priority ordering
// - Pause / resume
// - Cancel any pending or failed job
// - Retry failed jobs
// - Per-printer concurrency (parallel across distinct printers, serial per printer)
// - LocalStorage persistence + recovery on load
// - Event emission for Diagnostics/History UI
// - Chrome fallback after QZ retries (when enabled)
// Backed by the print_jobs table for durable history.
import { enqueuePrintJob, updateJobStatus } from "./server.functions";
import { withRetry } from "./retry";
import { print as runPrint } from "./manager";
import { printEvents } from "./events";
import { loadPersistedQueue, savePersistedQueue } from "./queue-persist";
import type { PrintJob as ManagerJob, PrintResult } from "./types";

export type QueueStatus = "pending" | "printing" | "completed" | "failed" | "cancelled";

export interface QueueItem {
  id: string;
  tenantId: string;
  branchId: string | null;
  job: ManagerJob;
  documentType: string;
  documentId?: string | null;
  dedupeKey?: string | null;
  status: QueueStatus;
  attempts: number;
  priority: number;
  error?: string;
  createdAt: number;
  fallbackEnabled: boolean;
  silent: boolean;
}

type Listener = (items: ReadonlyArray<QueueItem>) => void;

class PrintQueueImpl {
  private items: QueueItem[] = [];
  private listeners = new Set<Listener>();
  private activePrinters = new Set<string>();
  private paused = false;
  private recovered = false;

  subscribe(fn: Listener): () => void {
    this.ensureRecovered();
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): ReadonlyArray<QueueItem> {
    return [...this.items];
  }

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
    this.notify();
  }

  resume(): void {
    this.paused = false;
    this.notify();
    void this.tick();
  }

  private ensureRecovered(): void {
    if (this.recovered) return;
    this.recovered = true;
    const persisted = loadPersistedQueue();
    if (persisted.length > 0) {
      this.items.push(...persisted);
      // Re-arm processing on next tick
      setTimeout(() => void this.tick(), 50);
    }
  }

  private notify(): void {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
    savePersistedQueue(snap);
  }

  async enqueue(input: {
    tenantId: string;
    branchId?: string | null;
    job: ManagerJob;
    documentType: string;
    documentId?: string | null;
    dedupeKey?: string | null;
    fallbackEnabled?: boolean;
    silent?: boolean;
    priority?: number;
  }): Promise<QueueItem> {
    this.ensureRecovered();

    // Local dedupe — DB also enforces but local is faster.
    if (input.dedupeKey) {
      const dup = this.items.find(
        (i) => i.dedupeKey === input.dedupeKey && (i.status === "pending" || i.status === "printing"),
      );
      if (dup) return dup;
    }

    // Persist to DB for history.
    let dbId: string;
    try {
      const row = await enqueuePrintJob({
        data: {
          tenant_id: input.tenantId,
          branch_id: input.branchId ?? null,
          document_type: input.documentType,
          document_id: input.documentId ?? null,
          engine: "qz",
          paper_width_mm: parseWidth(input.job.paperWidth),
          copies: 1,
          dedupe_key: input.dedupeKey ?? null,
          printer_name: input.job.printer ?? null,
        },
      });
      dbId = (row as { id: string }).id;
    } catch (err) {
      dbId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      console.warn("[print-queue] DB enqueue failed, running local-only", err);
    }

    const item: QueueItem = {
      id: dbId,
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      job: input.job,
      documentType: input.documentType,
      documentId: input.documentId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      status: "pending",
      attempts: 0,
      priority: input.priority ?? 0,
      createdAt: Date.now(),
      fallbackEnabled: input.fallbackEnabled !== false,
      silent: input.silent === true,
    };
    this.items.push(item);
    this.notify();
    printEvents.emit({
      type: "queued",
      jobId: item.id,
      printer: item.job.printer ?? null,
      documentType: item.documentType,
    });
    void this.tick();
    return item;
  }

  async cancel(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === "completed" || item.status === "cancelled" || item.status === "printing") return;
    item.status = "cancelled";
    this.notify();
    printEvents.emit({ type: "cancelled", jobId: id, printer: item.job.printer ?? null });
    if (!item.id.startsWith("local-")) {
      try {
        await updateJobStatus({
          data: {
            tenant_id: item.tenantId,
            id: item.id,
            status: "cancelled",
            completed_at: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.warn("[print-queue] cancel DB update failed", err);
      }
    }
  }

  async retry(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (!item || item.status !== "failed") return;
    item.status = "pending";
    item.error = undefined;
    item.attempts = 0;
    this.notify();
    printEvents.emit({ type: "retry", jobId: id, printer: item.job.printer ?? null });
    void this.tick();
  }

  clearCompleted(): void {
    this.items = this.items.filter((i) => i.status !== "completed" && i.status !== "cancelled");
    this.notify();
  }

  private async tick(): Promise<void> {
    if (this.paused) return;
    // Pick next pending item per-printer that isn't already busy.
    // Highest priority first, then FIFO by createdAt.
    const candidates = this.items
      .filter((i) => i.status === "pending")
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

    for (const item of candidates) {
      const key = item.job.printer ?? "__default__";
      if (this.activePrinters.has(key)) continue;
      this.activePrinters.add(key);
      void this.runOne(item).finally(() => {
        this.activePrinters.delete(key);
        // Re-evaluate after each completion
        if (!this.paused) void this.tick();
      });
    }
  }

  private async runOne(item: QueueItem): Promise<void> {
    item.status = "printing";
    const startedAt = Date.now();
    this.notify();
    printEvents.emit({
      type: "started",
      jobId: item.id,
      printer: item.job.printer ?? null,
      documentType: item.documentType,
    });

    const attemptResult = await withRetry<PrintResult>(async () => {
      printEvents.emit({ type: "printing", jobId: item.id, printer: item.job.printer ?? null });
      const r = await runPrint(item.job, { silent: true });
      if (!r.ok) throw new Error(r.error ?? "Print failed");
      return r;
    }, 3);
    item.attempts = attemptResult.attempts;

    let finalResult: PrintResult | undefined = attemptResult.value;
    let failureReason: string | null = attemptResult.ok ? null : attemptResult.error ?? "Unknown error";

    if (!attemptResult.ok && item.fallbackEnabled) {
      try {
        const r = await runPrint(item.job, { silent: item.silent });
        finalResult = r;
        failureReason = r.ok ? null : r.error ?? failureReason;
      } catch (err) {
        failureReason = err instanceof Error ? err.message : String(err);
      }
    }

    const ok = !!finalResult?.ok;
    item.status = ok ? "completed" : "failed";
    item.error = failureReason ?? undefined;
    this.notify();
    printEvents.emit({
      type: ok ? "completed" : "failed",
      jobId: item.id,
      printer: item.job.printer ?? null,
      documentType: item.documentType,
      error: failureReason ?? undefined,
      meta: { durationMs: Date.now() - startedAt, attempts: item.attempts },
    });

    if (!item.id.startsWith("local-")) {
      try {
        await updateJobStatus({
          data: {
            tenant_id: item.tenantId,
            id: item.id,
            status: item.status,
            attempts: item.attempts,
            failure_reason: failureReason,
            started_at: new Date(startedAt).toISOString(),
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startedAt,
          },
        });
      } catch (err) {
        console.warn("[print-queue] DB status update failed", err);
      }
    }
  }
}

function parseWidth(w: ManagerJob["paperWidth"]): number {
  if (!w) return 80;
  const n = parseInt(w, 10);
  return Number.isFinite(n) ? n : 80;
}

export const printQueue = new PrintQueueImpl();
