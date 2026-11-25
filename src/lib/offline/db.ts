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
const DB_VERSION = 2;
const STORE = "outbox";
const PRODUCTS_STORE = "products_cache";
const CUSTOMERS_STORE = "customers_cache";

export interface CachedProduct {
  key: string; // `${tenantId}:${id}`
  tenantId: string;
  id: string;
  name: string;
  form?: string | null;
  strength?: string | null;
  cost: number;
  price: number;
  vat_rate: number;
  stock: number;
  hasStrip: boolean;
  pcsPerStrip: number;
  pcsPerBox: number;
  updatedAt: number;
}

export interface CachedCustomer {
  key: string; // `${tenantId}:${id}`
  tenantId: string;
  id: string;
  name: string;
  phone: string | null;
  due_balance: number;
  updatedAt: number;
}

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
        if (!db.objectStoreNames.contains(PRODUCTS_STORE)) {
          const pStore = db.createObjectStore(PRODUCTS_STORE, { keyPath: "key" });
          pStore.createIndex("tenantId", "tenantId");
        }
        if (!db.objectStoreNames.contains(CUSTOMERS_STORE)) {
          const cStore = db.createObjectStore(CUSTOMERS_STORE, { keyPath: "key" });
          cStore.createIndex("tenantId", "tenantId");
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

// --- Offline catalog cache (products & customers) ---
export async function cacheProducts(tenantId: string, rows: Array<Omit<CachedProduct, "key" | "tenantId" | "updatedAt">>): Promise<void> {
  if (!tenantId || rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(PRODUCTS_STORE, "readwrite");
  const now = Date.now();
  await Promise.all([
    ...rows.map((r) =>
      tx.store.put({
        ...r,
        key: `${tenantId}:${r.id}`,
        tenantId,
        updatedAt: now,
      } satisfies CachedProduct),
    ),
    tx.done,
  ]);
}

export async function searchCachedProducts(tenantId: string, query: string): Promise<CachedProduct[]> {
  if (!tenantId) return [];
  const db = await getDb();
  const all = (await db.getAllFromIndex(PRODUCTS_STORE, "tenantId", tenantId)) as CachedProduct[];
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, 30);
  return all.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30);
}

export async function cacheCustomers(tenantId: string, rows: Array<Omit<CachedCustomer, "key" | "tenantId" | "updatedAt">>): Promise<void> {
  if (!tenantId || rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(CUSTOMERS_STORE, "readwrite");
  const now = Date.now();
  await Promise.all([
    ...rows.map((r) =>
      tx.store.put({
        ...r,
        key: `${tenantId}:${r.id}`,
        tenantId,
        updatedAt: now,
      } satisfies CachedCustomer),
    ),
    tx.done,
  ]);
}

export async function searchCachedCustomers(tenantId: string, query: string): Promise<CachedCustomer[]> {
  if (!tenantId) return [];
  const db = await getDb();
  const all = (await db.getAllFromIndex(CUSTOMERS_STORE, "tenantId", tenantId)) as CachedCustomer[];
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, 20);
  return all
    .filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q))
    .slice(0, 20);
}
