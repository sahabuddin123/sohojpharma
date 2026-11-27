// Sync engine: drains the IndexedDB outbox to the server automatically when online.
// - Runs on `online` events, tab visibility restore, outbox writes, and 15s polling.
// - Exponential backoff per failed op (capped at 5 min).
// - Reconciles optimistic local records (sales, purchases, customers) after server confirmation.
import {
  listPending,
  updateOp,
  deleteOp,
  subscribe as subscribeOutbox,
  replaceOfflineSaleWithSynced,
  replaceOfflinePurchaseWithSynced,
  markCustomerSynced,
  type OutboxOp,
} from "./db";
import {
  syncSale,
  syncPurchase,
  syncCollection,
  syncCustomerCreate,
} from "@/lib/api/offline-sync.functions";
import { logSyncBatch } from "@/lib/api/devices.functions";
import { getDeviceId } from "@/lib/offline/device-id";

const MAX_BACKOFF_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 2_000;
const POLL_INTERVAL_MS = 15_000;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;
let activeTenantId: string | null = null;

export function setSyncTenantId(tenantId: string | null) {
  activeTenantId = tenantId;
}

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
  fn({ ...state });
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((fn) => {
    try { fn({ ...state }); } catch { /* ignore */ }
  });
}

async function runOne(op: OutboxOp): Promise<void> {
  await updateOp(op.id, { status: "syncing" });
  try {
    switch (op.kind) {
      case "customer_create": {
        const res = await syncCustomerCreate({ data: op.payload as never });
        const p = op.payload as { tenant_id?: string; id?: string };
        if (p.tenant_id && (res.customer_id || p.id)) {
          await markCustomerSynced(p.tenant_id, res.customer_id || p.id!).catch(() => {});
        }
        break;
      }
      case "purchase": {
        const res = await syncPurchase({ data: op.payload as never });
        const p = op.payload as { tenant_id?: string; client_op_id?: string };
        if (p.tenant_id && res.purchase_id) {
          await replaceOfflinePurchaseWithSynced(
            p.tenant_id,
            p.client_op_id || op.id,
            res.purchase_id,
            res.po_number,
          ).catch(() => {});
        }
        break;
      }
      case "sale": {
        const res = await syncSale({ data: op.payload as never });
        const p = op.payload as { tenant_id?: string; client_op_id?: string };
        if (p.tenant_id && res.sale_id) {
          await replaceOfflineSaleWithSynced(
            p.tenant_id,
            p.client_op_id || op.id,
            res.sale_id,
            res.invoice_no,
          ).catch(() => {});
        }
        break;
      }
      case "collection": {
        await syncCollection({ data: op.payload as never });
        break;
      }
      default:
        throw new Error(`unknown op kind: ${op.kind}`);
    }
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
    state.online = false;
    emit();
    return { processed: 0, failed: 0 };
  }
  running = true;
  state.syncing = true;
  state.online = true;
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
      } catch (err) {
        failed++;
        state.lastError = err instanceof Error ? err.message : String(err);
      }
    }
    if (failed === 0) state.lastError = null;
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
  } finally {
    running = false;
    state.syncing = false;
    state.lastRunAt = Date.now();
    emit();
  }

  if (processed > 0 && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("sohoj:offline-synced", { detail: { processed, tenantId: activeTenantId } }),
    );
  }

  if (batchSize > 0) {
    void logSyncBatch({
      data: {
        device_id: getDeviceId(),
        batch_size: batchSize,
        succeeded: processed,
        failed,
        duration_ms: Date.now() - startedAt,
      },
    }).catch(() => {});
  }
  return { processed, failed };
}

export function startSyncEngine(tenantId?: string | null) {
  if (tenantId) activeTenantId = tenantId;
  if (typeof window === "undefined") return;
  if (started) {
    void flushNow();
    return;
  }
  started = true;

  const onOnline = () => {
    state.online = true;
    emit();
    void flushNow();
  };
  const onOffline = () => {
    state.online = false;
    emit();
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible" && navigator.onLine) {
      state.online = true;
      emit();
      void flushNow();
    }
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibility);

  subscribeOutbox(() => {
    void flushNow();
  });
  timer = setInterval(() => {
    if (navigator.onLine) void flushNow();
  }, POLL_INTERVAL_MS);

  void flushNow();
}

export function stopSyncEngine() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
