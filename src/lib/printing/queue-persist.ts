// LocalStorage persistence for the in-memory print queue.
// Recovers pending jobs across reloads; safe to noop in SSR.

import type { QueueItem } from "./queue";

const KEY = "lov.printing.queue.v1";

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadPersistedQueue(): QueueItem[] {
  const ls = safeLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueItem[];
    if (!Array.isArray(parsed)) return [];
    // Only re-hydrate items that still need to run
    return parsed.filter((i) => i.status === "pending");
  } catch {
    return [];
  }
}

export function savePersistedQueue(items: ReadonlyArray<QueueItem>): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    // Persist a bounded recent slice; never persist completed/cancelled in bulk.
    const slice = items
      .filter((i) => i.status !== "completed" && i.status !== "cancelled")
      .slice(-50);
    ls.setItem(KEY, JSON.stringify(slice));
  } catch {
    // Quota or serialization errors are non-fatal
  }
}

export function clearPersistedQueue(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(KEY);
  } catch {
    /* noop */
  }
}
