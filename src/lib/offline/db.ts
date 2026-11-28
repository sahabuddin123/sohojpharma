// IndexedDB-backed offline store + outbox for SohojPharma.
// Stores pending mutations (`outbox`) and local offline mirrors (`products_cache`,
// `customers_cache`, `suppliers_cache`, `sales_cache`, `purchases_cache`, `meta_store`).
import { openDB, type IDBPDatabase } from "idb";

export type OpKind = "sale" | "purchase" | "collection" | "customer_create";
export type OpStatus = "pending" | "syncing" | "failed" | "done";

export interface OutboxOp<T = unknown> {
  id: string; // client_op_id (uuid)
  kind: OpKind;
  payload: T;
  status: OpStatus;
  attempts: number;
  lastError?: string;
  createdAt: number; // client timestamp (ms)
  updatedAt: number;
  nextAttemptAt: number; // for backoff scheduling
}

const DB_NAME = "pharma-offline";
const DB_VERSION = 3;
const STORE = "outbox";
const PRODUCTS_STORE = "products_cache";
const CUSTOMERS_STORE = "customers_cache";
const SUPPLIERS_STORE = "suppliers_cache";
const SALES_STORE = "sales_cache";
const PURCHASES_STORE = "purchases_cache";
const META_STORE = "meta_store";

export interface CachedProduct {
  key: string; // `${tenantId}:${id}`
  tenantId: string;
  id: string;
  name: string;
  displayName?: string | null;
  form?: string | null;
  strength?: string | null;
  generic_id?: string | null;
  manufacturer_id?: string | null;
  category_id?: string | null;
  generic_name?: string | null;
  company_name?: string | null;
  category_name?: string | null;
  sku?: string | null;
  barcode?: string | null;
  unit?: string | null;
  reorder_level?: number | null;
  is_active?: boolean;
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
  customer_code?: string | null;
  name: string;
  phone: string | null;
  email?: string | null;
  type?: "retail" | "dealer" | "wholesale" | string | null;
  address?: string | null;
  due_balance: number;
  credit_limit?: number | null;
  pendingSync?: boolean;
  updatedAt: number;
}

export interface CachedSupplier {
  key: string; // `${tenantId}:${id}`
  tenantId: string;
  id: string;
  name: string;
  phone: string | null;
  due_balance: number;
  updatedAt: number;
}

export interface CachedSaleItem {
  product_id: string;
  name: string;
  qty: number;
  unit_price: number;
  discount?: number;
  vat?: number;
  line_total: number;
}

export interface CachedSale {
  key: string; // `${tenantId}:${id}`
  tenantId: string;
  id: string; // sale uuid OR client_op_id for offline sales
  invoice_no: string;
  sale_date: string;
  created_at: string;
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  paid: number;
  due: number;
  payment_method: string;
  status: string;
  is_return?: boolean;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  items: CachedSaleItem[];
  pendingSync?: boolean;
  updatedAt: number;
}

export interface CachedPurchase {
  key: string; // `${tenantId}:${id}`
  tenantId: string;
  id: string; // po uuid OR client_op_id for offline purchases
  po_number: string;
  status: string;
  order_date: string;
  created_at: string;
  total: number;
  paid?: number;
  due?: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  items?: Array<{
    product_id: string;
    name: string;
    qty: number;
    unit_cost: number;
    batch_no?: string;
    expiry_date?: string;
    line_total: number;
  }>;
  pendingSync?: boolean;
  updatedAt: number;
}

export interface OfflineMetaEntry<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

// Fast in-memory tenant mirror so typing in POS / products (33k+ SKUs) executes in < 3ms
const productMemCache = new Map<string, CachedProduct[]>();

function invalidateProductMem(tenantId?: string) {
  if (tenantId) productMemCache.delete(tenantId);
  else productMemCache.clear();
}

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
        if (!db.objectStoreNames.contains(SUPPLIERS_STORE)) {
          const sStore = db.createObjectStore(SUPPLIERS_STORE, { keyPath: "key" });
          sStore.createIndex("tenantId", "tenantId");
        }
        if (!db.objectStoreNames.contains(SALES_STORE)) {
          const slStore = db.createObjectStore(SALES_STORE, { keyPath: "key" });
          slStore.createIndex("tenantId", "tenantId");
        }
        if (!db.objectStoreNames.contains(PURCHASES_STORE)) {
          const poStore = db.createObjectStore(PURCHASES_STORE, { keyPath: "key" });
          poStore.createIndex("tenantId", "tenantId");
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

export function newOpId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// --- Outbox operations ---
export async function enqueueOp<T>(
  kind: OpKind,
  payload: T,
  explicitId?: string,
): Promise<OutboxOp<T>> {
  const db = await getDb();
  const now = Date.now();
  const id = explicitId || newOpId();
  const op: OutboxOp<T> = {
    id,
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

export async function listUnfinishedOps(): Promise<OutboxOp[]> {
  const all = await listOps();
  return all
    .filter((o) => o.status !== "done")
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

// --- pub/sub for UI subscribers ---
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

// --- Meta store ---
export async function setOfflineMeta<T>(key: string, value: T): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await getDb();
  await db.put(META_STORE, { key, value, updatedAt: Date.now() } satisfies OfflineMetaEntry<T>);
}

export async function getOfflineMeta<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await getDb();
  const entry = (await db.get(META_STORE, key)) as OfflineMetaEntry<T> | undefined;
  return entry ? entry.value : null;
}

// --- Products cache ---
async function getTenantProducts(tenantId: string): Promise<CachedProduct[]> {
  if (!tenantId) return [];
  const hit = productMemCache.get(tenantId);
  if (hit) return hit;
  const db = await getDb();
  const all = (await db.getAllFromIndex(PRODUCTS_STORE, "tenantId", tenantId)) as CachedProduct[];
  productMemCache.set(tenantId, all);
  return all;
}

export type CacheProductInput = Omit<CachedProduct, "key" | "tenantId" | "updatedAt">;

export async function cacheProducts(tenantId: string, rows: CacheProductInput[]): Promise<void> {
  if (!tenantId || rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(PRODUCTS_STORE, "readwrite");
  const now = Date.now();
  for (const r of rows) {
    void tx.store.put({
      ...r,
      key: `${tenantId}:${r.id}`,
      tenantId,
      updatedAt: now,
    } satisfies CachedProduct);
  }
  await tx.done;
  invalidateProductMem(tenantId);
}

export async function countCachedProducts(tenantId: string): Promise<number> {
  if (!tenantId) return 0;
  const db = await getDb();
  return await db.countFromIndex(PRODUCTS_STORE, "tenantId", tenantId);
}

export async function searchCachedProducts(
  tenantId: string,
  query: string,
  limit = 30,
): Promise<CachedProduct[]> {
  const all = await getTenantProducts(tenantId);
  if (all.length === 0) return [];
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);

  const exactBarcode: CachedProduct[] = [];
  const prefixMatches: CachedProduct[] = [];
  const containsMatches: CachedProduct[] = [];

  for (const p of all) {
    if (p.is_active === false) continue;
    const barcode = (p.barcode ?? "").toLowerCase();
    const sku = (p.sku ?? "").toLowerCase();
    if (barcode === q || sku === q) {
      exactBarcode.push(p);
      continue;
    }
    const name = p.name.toLowerCase();
    const disp = (p.displayName ?? "").toLowerCase();
    const gen = (p.generic_name ?? "").toLowerCase();
    const comp = (p.company_name ?? "").toLowerCase();
    const strength = (p.strength ?? "").toLowerCase();
    const cat = (p.category_name ?? "").toLowerCase();
    if (name.startsWith(q) || disp.startsWith(q)) {
      prefixMatches.push(p);
    } else if (
      name.includes(q) ||
      disp.includes(q) ||
      gen.includes(q) ||
      comp.includes(q) ||
      cat.includes(q) ||
      strength.includes(q) ||
      barcode.includes(q) ||
      sku.includes(q)
    ) {
      containsMatches.push(p);
    }
    if (exactBarcode.length + prefixMatches.length >= limit * 2 && containsMatches.length >= limit * 2) {
      // Early cap after ample candidates are gathered
    }
  }

  return [...exactBarcode, ...prefixMatches, ...containsMatches].slice(0, limit);
}

export async function findCachedProductByBarcode(
  tenantId: string,
  code: string,
): Promise<CachedProduct | null> {
  const clean = code.trim().toLowerCase();
  if (!clean) return null;
  const all = await getTenantProducts(tenantId);
  return (
    all.find(
      (p) =>
        p.is_active !== false &&
        ((p.barcode ?? "").toLowerCase() === clean || (p.sku ?? "").toLowerCase() === clean),
    ) ?? null
  );
}

export type OfflineProductSearchScope = "all" | "name" | "company" | "generic" | "category" | "barcode";

export function matchesCachedProductQuery(
  p: Pick<CachedProduct, "name" | "displayName" | "generic_name" | "company_name" | "category_name" | "form" | "sku" | "barcode">,
  query: string,
  searchBy: OfflineProductSearchScope = "all",
): boolean {
  const qLower = query.trim().toLowerCase();
  if (!qLower) return true;
  const nameHit =
    p.name.toLowerCase().includes(qLower) ||
    (p.displayName ?? "").toLowerCase().includes(qLower);
  const compHit = (p.company_name ?? "").toLowerCase().includes(qLower);
  const genHit = (p.generic_name ?? "").toLowerCase().includes(qLower);
  const catHit =
    (p.category_name ?? "").toLowerCase().includes(qLower) ||
    (p.form ?? "").toLowerCase().includes(qLower);
  const codeHit =
    (p.sku ?? "").toLowerCase().includes(qLower) ||
    (p.barcode ?? "").toLowerCase().includes(qLower);

  switch (searchBy) {
    case "name":
      return nameHit;
    case "company":
      return compHit;
    case "generic":
      return genHit;
    case "category":
      return catHit;
    case "barcode":
      return codeHit;
    case "all":
    default:
      return nameHit || genHit || compHit || catHit || codeHit;
  }
}

function matchesSelectedMaster(
  rowId: string | null | undefined,
  rowName: string | null | undefined,
  selectedId?: string,
  selectedName?: string,
): boolean {
  if (!selectedId && !selectedName) return true;
  if (selectedId && rowId) return rowId === selectedId;
  if (selectedName) {
    return (rowName ?? "").trim().toLowerCase() === selectedName.trim().toLowerCase();
  }
  return false;
}

export async function listCachedProducts(
  tenantId: string,
  opts: {
    search?: string;
    searchBy?: OfflineProductSearchScope;
    manufacturerId?: string;
    genericId?: string;
    categoryId?: string;
    manufacturerName?: string;
    genericName?: string;
    categoryName?: string;
    filter?: "all" | "in" | "low" | "out" | "neg";
    inStockOnly?: boolean;
    sortBy?: "name" | "stock";
    sortDir?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  rows: CachedProduct[];
  total: number;
  stats: { totalProducts: number; totalStock: number; stockValue: number; inStock: number; lowStock: number; outOfStock: number; negStock: number };
}> {
  const all = await getTenantProducts(tenantId);
  const q = (opts.search ?? "").trim().toLowerCase();
  const searchBy = opts.searchBy ?? "all";
  const filter = opts.filter ?? "all";

  let totalStock = 0;
  let stockValue = 0;
  let inStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  let negStock = 0;

  const matched: CachedProduct[] = [];

  for (const p of all) {
    const stk = Number(p.stock ?? 0);
    const rl = p.reorder_level ?? null;
    if (stk < 0) negStock++;
    else if (stk === 0) outOfStock++;
    else if (rl != null && stk <= rl) lowStock++;
    else inStock++;

    if (stk > 0) {
      totalStock += stk;
      stockValue += stk * Number(p.cost ?? 0);
    }

    if (opts.inStockOnly && stk <= 0) continue;

    if (filter !== "all") {
      if (filter === "neg" && stk >= 0) continue;
      if (filter === "out" && stk !== 0) continue;
      if (filter === "low" && !(stk > 0 && rl != null && stk <= rl)) continue;
      if (filter === "in" && !(stk > 0 && (rl == null || stk > rl))) continue;
    }

    if (!matchesSelectedMaster(p.manufacturer_id, p.company_name, opts.manufacturerId, opts.manufacturerName)) {
      continue;
    }
    if (!matchesSelectedMaster(p.generic_id, p.generic_name, opts.genericId, opts.genericName)) {
      continue;
    }
    if (!matchesSelectedMaster(p.category_id, p.category_name, opts.categoryId, opts.categoryName)) {
      continue;
    }

    if (q && !matchesCachedProductQuery(p, q, searchBy)) continue;

    matched.push(p);
  }

  const dir = opts.sortDir === "desc" ? -1 : 1;
  matched.sort((a, b) => {
    if (opts.sortBy === "stock") return (Number(a.stock ?? 0) - Number(b.stock ?? 0)) * dir;
    if (q && searchBy === "name") {
      const aExact = a.name.toLowerCase() === q ? 0 : a.name.toLowerCase().startsWith(q) ? 1 : 2;
      const bExact = b.name.toLowerCase() === q ? 0 : b.name.toLowerCase().startsWith(q) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
    }
    return a.name.localeCompare(b.name) * dir;
  });

  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? 50);
  const start = (page - 1) * pageSize;

  return {
    rows: matched.slice(start, start + pageSize),
    total: matched.length,
    stats: {
      totalProducts: all.length,
      totalStock,
      stockValue,
      inStock,
      lowStock,
      outOfStock,
      negStock,
    },
  };
}

export async function getCachedProductFilterOptions(tenantId: string): Promise<{
  manufacturers: Array<{ id: string; name: string }>;
  generics: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}> {
  const all = await getTenantProducts(tenantId);
  const mMap = new Map<string, string>();
  const gMap = new Map<string, string>();
  const cMap = new Map<string, string>();

  for (const p of all) {
    if (p.company_name) {
      const id = p.manufacturer_id || `name:${p.company_name.toLowerCase()}`;
      if (!mMap.has(id)) mMap.set(id, p.company_name);
    }
    if (p.generic_name) {
      const id = p.generic_id || `name:${p.generic_name.toLowerCase()}`;
      if (!gMap.has(id)) gMap.set(id, p.generic_name);
    }
    if (p.category_name) {
      const id = p.category_id || `name:${p.category_name.toLowerCase()}`;
      if (!cMap.has(id)) cMap.set(id, p.category_name);
    }
  }

  const toSorted = (m: Map<string, string>) =>
    Array.from(m.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

  return {
    manufacturers: toSorted(mMap),
    generics: toSorted(gMap),
    categories: toSorted(cMap),
  };
}

export async function adjustCachedProductStock(
  tenantId: string,
  deltas: Array<{ product_id: string; delta: number; price?: number; cost?: number; pcsPerStrip?: number; pcsPerBox?: number }>,
): Promise<void> {
  if (!tenantId || deltas.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(PRODUCTS_STORE, "readwrite");
  const now = Date.now();
  for (const d of deltas) {
    const key = `${tenantId}:${d.product_id}`;
    const existing = (await tx.store.get(key)) as CachedProduct | undefined;
    if (!existing) continue;
    await tx.store.put({
      ...existing,
      stock: Number(existing.stock ?? 0) + d.delta,
      ...(d.price !== undefined ? { price: d.price } : {}),
      ...(d.cost !== undefined ? { cost: d.cost } : {}),
      ...(d.pcsPerStrip !== undefined ? { pcsPerStrip: d.pcsPerStrip } : {}),
      ...(d.pcsPerBox !== undefined ? { pcsPerBox: d.pcsPerBox } : {}),
      updatedAt: now,
    } satisfies CachedProduct);
  }
  await tx.done;
  invalidateProductMem(tenantId);
}

// --- Customers cache ---
export async function cacheCustomers(
  tenantId: string,
  rows: Array<Omit<CachedCustomer, "key" | "tenantId" | "updatedAt">>,
): Promise<void> {
  if (!tenantId || rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(CUSTOMERS_STORE, "readwrite");
  const now = Date.now();
  for (const r of rows) {
    const key = `${tenantId}:${r.id}`;
    const existing = (await tx.store.get(key)) as CachedCustomer | undefined;
    // Preserve pending local changes if item hasn't synced yet
    if (existing?.pendingSync && !r.pendingSync) continue;
    void tx.store.put({
      ...r,
      key,
      tenantId,
      updatedAt: now,
    } satisfies CachedCustomer);
  }
  await tx.done;
}

export async function putCachedCustomer(
  tenantId: string,
  row: Omit<CachedCustomer, "key" | "tenantId" | "updatedAt">,
): Promise<void> {
  await cacheCustomers(tenantId, [row]);
}

export async function markCustomerSynced(tenantId: string, id: string): Promise<void> {
  if (!tenantId || !id) return;
  const db = await getDb();
  const existing = (await db.get(CUSTOMERS_STORE, `${tenantId}:${id}`)) as CachedCustomer | undefined;
  if (existing) {
    await db.put(CUSTOMERS_STORE, { ...existing, pendingSync: false, updatedAt: Date.now() });
  }
}

export async function adjustCachedCustomerDue(
  tenantId: string,
  customerId: string,
  delta: number,
): Promise<void> {
  if (!tenantId || !customerId || delta === 0) return;
  const db = await getDb();
  const key = `${tenantId}:${customerId}`;
  const existing = (await db.get(CUSTOMERS_STORE, key)) as CachedCustomer | undefined;
  if (!existing) return;
  await db.put(CUSTOMERS_STORE, {
    ...existing,
    due_balance: Math.round((Number(existing.due_balance ?? 0) + delta) * 100) / 100,
    updatedAt: Date.now(),
  });
}

export async function listCachedCustomers(tenantId: string): Promise<CachedCustomer[]> {
  if (!tenantId) return [];
  const db = await getDb();
  const all = (await db.getAllFromIndex(CUSTOMERS_STORE, "tenantId", tenantId)) as CachedCustomer[];
  return all.sort((a, b) => Number(b.due_balance ?? 0) - Number(a.due_balance ?? 0) || a.name.localeCompare(b.name));
}

export async function searchCachedCustomers(tenantId: string, query: string): Promise<CachedCustomer[]> {
  const all = await listCachedCustomers(tenantId);
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, 30);
  return all
    .filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q))
    .slice(0, 30);
}

// --- Suppliers cache ---
export async function cacheSuppliers(
  tenantId: string,
  rows: Array<Omit<CachedSupplier, "key" | "tenantId" | "updatedAt">>,
): Promise<void> {
  if (!tenantId || rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(SUPPLIERS_STORE, "readwrite");
  const now = Date.now();
  for (const r of rows) {
    void tx.store.put({
      ...r,
      key: `${tenantId}:${r.id}`,
      tenantId,
      updatedAt: now,
    } satisfies CachedSupplier);
  }
  await tx.done;
}

export async function listCachedSuppliers(tenantId: string): Promise<CachedSupplier[]> {
  if (!tenantId) return [];
  const db = await getDb();
  const all = (await db.getAllFromIndex(SUPPLIERS_STORE, "tenantId", tenantId)) as CachedSupplier[];
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

// --- Sales & Invoices cache ---
export async function cacheSales(
  tenantId: string,
  rows: Array<Omit<CachedSale, "key" | "tenantId" | "updatedAt">>,
): Promise<void> {
  if (!tenantId || rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(SALES_STORE, "readwrite");
  const now = Date.now();
  for (const r of rows) {
    const key = `${tenantId}:${r.id}`;
    void tx.store.put({
      ...r,
      key,
      tenantId,
      updatedAt: now,
    } satisfies CachedSale);
  }
  await tx.done;
}

export async function putCachedSale(
  tenantId: string,
  row: Omit<CachedSale, "key" | "tenantId" | "updatedAt">,
): Promise<void> {
  await cacheSales(tenantId, [row]);
}

export async function replaceOfflineSaleWithSynced(
  tenantId: string,
  clientOpId: string,
  serverSaleId: string,
  serverInvoiceNo: string,
): Promise<void> {
  if (!tenantId) return;
  const db = await getDb();
  const oldKey = `${tenantId}:${clientOpId}`;
  const existing = (await db.get(SALES_STORE, oldKey)) as CachedSale | undefined;
  if (existing) {
    await db.delete(SALES_STORE, oldKey);
    await db.put(SALES_STORE, {
      ...existing,
      id: serverSaleId,
      key: `${tenantId}:${serverSaleId}`,
      invoice_no: serverInvoiceNo || existing.invoice_no,
      pendingSync: false,
      updatedAt: Date.now(),
    });
  }
}

export async function listCachedSales(
  tenantId: string,
  range?: { from?: string; to?: string },
): Promise<CachedSale[]> {
  if (!tenantId) return [];
  const db = await getDb();
  const all = (await db.getAllFromIndex(SALES_STORE, "tenantId", tenantId)) as CachedSale[];
  return all
    .filter((s) => {
      const ymd = (s.sale_date || s.created_at || "").slice(0, 10);
      if (range?.from && ymd && ymd < range.from) return false;
      if (range?.to && ymd && ymd > range.to) return false;
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getCachedSale(tenantId: string, saleId: string): Promise<CachedSale | null> {
  if (!tenantId || !saleId) return null;
  const db = await getDb();
  const byKey = (await db.get(SALES_STORE, `${tenantId}:${saleId}`)) as CachedSale | undefined;
  if (byKey) return byKey;
  const all = (await db.getAllFromIndex(SALES_STORE, "tenantId", tenantId)) as CachedSale[];
  return all.find((s) => s.id === saleId || s.invoice_no === saleId) ?? null;
}

// --- Purchases cache ---
export async function cachePurchases(
  tenantId: string,
  rows: Array<Omit<CachedPurchase, "key" | "tenantId" | "updatedAt">>,
): Promise<void> {
  if (!tenantId || rows.length === 0) return;
  const db = await getDb();
  const tx = db.transaction(PURCHASES_STORE, "readwrite");
  const now = Date.now();
  for (const r of rows) {
    void tx.store.put({
      ...r,
      key: `${tenantId}:${r.id}`,
      tenantId,
      updatedAt: now,
    } satisfies CachedPurchase);
  }
  await tx.done;
}

export async function putCachedPurchase(
  tenantId: string,
  row: Omit<CachedPurchase, "key" | "tenantId" | "updatedAt">,
): Promise<void> {
  await cachePurchases(tenantId, [row]);
}

export async function replaceOfflinePurchaseWithSynced(
  tenantId: string,
  clientOpId: string,
  serverPoId: string,
  serverPoNo: string,
): Promise<void> {
  if (!tenantId) return;
  const db = await getDb();
  const oldKey = `${tenantId}:${clientOpId}`;
  const existing = (await db.get(PURCHASES_STORE, oldKey)) as CachedPurchase | undefined;
  if (existing) {
    await db.delete(PURCHASES_STORE, oldKey);
    await db.put(PURCHASES_STORE, {
      ...existing,
      id: serverPoId,
      key: `${tenantId}:${serverPoId}`,
      po_number: serverPoNo || existing.po_number,
      pendingSync: false,
      updatedAt: Date.now(),
    });
  }
}

export async function listCachedPurchases(
  tenantId: string,
  range?: { from?: string; to?: string },
): Promise<CachedPurchase[]> {
  if (!tenantId) return [];
  const db = await getDb();
  const all = (await db.getAllFromIndex(PURCHASES_STORE, "tenantId", tenantId)) as CachedPurchase[];
  return all
    .filter((p) => {
      const ymd = (p.order_date || p.created_at || "").slice(0, 10);
      if (range?.from && ymd && ymd < range.from) return false;
      if (range?.to && ymd && ymd > range.to) return false;
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getCachedPurchase(tenantId: string, poId: string): Promise<CachedPurchase | null> {
  if (!tenantId || !poId) return null;
  const db = await getDb();
  return ((await db.get(PURCHASES_STORE, `${tenantId}:${poId}`)) as CachedPurchase | undefined) ?? null;
}
