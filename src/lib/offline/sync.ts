// Sync engine: drains the IndexedDB outbox to the server when online.
// - Auto-runs on `online` events and on an interval.
// - Exponential backoff per op (capped at 5 min).
// - Idempotent server handlers (client_op_id) make retries safe.
// - Conflict resolution: server is the source of truth; duplicates resolve to existing row.
import { listPending, updateOp, deleteOp, subscribe as subscribeOutbox, type OutboxOp } from "./db";
import { syncSale, syncPurchase, syncCollection } from "@/lib/api/offline-sync.functions";
import { logSyncBatch } from "@/lib/api/devices.functions";
import { getDeviceId } from "@/lib/offline/device-id";

const MAX_BACKOFF_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 2_000;
const POLL_INTERVAL_MS = 15_000;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

export type SyncState = {
  online: boolean;
  syncing: boolean;
  lastRunAt: number | null;
  lastError: string | null;
};
const state: SyncState = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  lastRunAt: null,
  lastError: null,
};
const listeners = new Set<(s: SyncState) => void>();
export function subscribeSync(fn: (s: SyncState) => void) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
function emit() { listeners.forEach((fn) => { try { fn({ ...state }); } catch { /* ignore */ } }); }

async function runOne(op: OutboxOp): Promise<void> {
  await updateOp(op.id, { status: "syncing" });
  try {
    switch (op.kind) {
      case "sale":
        await syncSale({ data: op.payload as never });
        break;
      case "purchase":
        await syncPurchase({ data: op.payload as never });
        break;
      case "collection":
        await syncCollection({ data: op.payload as never });
        break;
      default:
        throw new Error(`unknown op kind: ${op.kind}`);
    }
    // success — drop it from the outbox
    await deleteOp(op.id);
  } catch (err) {
    const attempts = op.attempts + 1;
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(attempts, 10));
    await updateOp(op.id, {
      status: "failed",
      attempts,
      lastError: err instanceof Error ? err.message : String(err),
      nextAttemptAt: Date.now() + backoff,
    });
    throw err;
  }
}

export async function flushNow(): Promise<{ processed: number; failed: number }> {
  if (running) return { processed: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { processed: 0, failed: 0 };
  }
  running = true;
  state.syncing = true;
  emit();
  let processed = 0;
  let failed = 0;
  const startedAt = Date.now();
  let batchSize = 0;
  try {
    const ops = await listPending();
    batchSize = ops.length;
    for (const op of ops) {
      try {
        await runOne(op);
        processed++;
      } catch {
        failed++;
        // continue with the next op; the failed one is rescheduled with backoff
      }
    }
    state.lastError = null;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    running = false;
    state.syncing = false;
    state.lastRunAt = Date.now();
    emit();
  }
  // Best-effort audit log; never let it break the engine.
  if (batchSize > 0) {
    void logSyncBatch({
      data: {
        device_id: getDeviceId(),
        batch_size: batchSize,
        succeeded: processed,
        failed,
        duration_ms: Date.now() - startedAt,
      },
    }).catch(() => { /* offline / unauth — ignore */ });
  }
  return { processed, failed };
}

export function startSyncEngine() {
  if (started || typeof window === "undefined") return;
  started = true;

  const onOnline = () => { state.online = true; emit(); void flushNow(); };
  const onOffline = () => { state.online = false; emit(); };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // Re-flush when outbox changes (new enqueue) AND when polling timer fires.
  subscribeOutbox(() => { void flushNow(); });
  timer = setInterval(() => { void flushNow(); }, POLL_INTERVAL_MS);

  // Initial drain
  void flushNow();
}

export function stopSyncEngine() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
