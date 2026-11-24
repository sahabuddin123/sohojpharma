// IndexedDB-backed outbox for offline operations.
// Stores queued ops; the sync engine drains them when online.
import { openDB, type IDBPDatabase } from "idb";

export type OpKind = "sale" | "purchase" | "collection";
export type OpStatus = "pending" | "syncing" | "failed" | "done";

export interface OutboxOp<T = unknown> {
  id: string;              // client_op_id (uuid)
  kind: OpKind;
  payload: T;
  status: OpStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;       // client timestamp (ms)
  updatedAt: number;
  nextAttemptAt: number;   // for backoff scheduling
}

const DB_NAME = "pharma-offline";
const DB_VERSION = 1;
const STORE = "outbox";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB unavailable (SSR or unsupported browser)");
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("status", "status");
          store.createIndex("nextAttemptAt", "nextAttemptAt");
        }
      },
    });
  }
  return dbPromise;
}

export function newOpId(): string {
  // crypto.randomUUID is available in modern browsers
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueueOp<T>(kind: OpKind, payload: T): Promise<OutboxOp<T>> {
  const db = await getDb();
  const now = Date.now();
  const op: OutboxOp<T> = {
    id: newOpId(),
    kind,
    payload,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
  };
  await db.put(STORE, op);
  notify();
  return op;
}

export async function listOps(): Promise<OutboxOp[]> {
  const db = await getDb();
  return (await db.getAll(STORE)) as OutboxOp[];
}

export async function listPending(): Promise<OutboxOp[]> {
  const all = await listOps();
  const now = Date.now();
  return all
    .filter((o) => (o.status === "pending" || o.status === "failed") && o.nextAttemptAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPending(): Promise<number> {
  const all = await listOps();
  return all.filter((o) => o.status !== "done").length;
}

export async function updateOp(id: string, patch: Partial<OutboxOp>): Promise<void> {
  const db = await getDb();
  const existing = (await db.get(STORE, id)) as OutboxOp | undefined;
  if (!existing) return;
  await db.put(STORE, { ...existing, ...patch, updatedAt: Date.now() });
  notify();
}

export async function deleteOp(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
  notify();
}

export async function clearDone(): Promise<void> {
  const db = await getDb();
  const all = (await db.getAll(STORE)) as OutboxOp[];
  await Promise.all(all.filter((o) => o.status === "done").map((o) => db.delete(STORE, o.id)));
  notify();
}

// --- pub/sub for UI subscribers (badge, dashboard) ---
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
}
