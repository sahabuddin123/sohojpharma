// Lightweight typed event bus for the printing subsystem.
// Additive: no consumer is required, existing print paths are unaffected.

export type PrintEventType =
  | "queued"
  | "started"
  | "printing"
  | "completed"
  | "failed"
  | "cancelled"
  | "retry"
  | "reconnect"
  | "printer_changed"
  | "settings_changed"
  | "template_changed";

export interface PrintEvent {
  type: PrintEventType;
  at: number;
  jobId?: string;
  printer?: string | null;
  documentType?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

type Listener = (e: PrintEvent) => void;

class PrintEventBus {
  private listeners = new Set<Listener>();
  private buffer: PrintEvent[] = [];
  private readonly MAX = 200;
  private counts: Partial<Record<PrintEventType, number>> = {};

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: Omit<PrintEvent, "at"> & { at?: number }): void {
    const evt: PrintEvent = { at: Date.now(), ...e };
    this.counts[evt.type] = (this.counts[evt.type] ?? 0) + 1;
    this.buffer.push(evt);
    if (this.buffer.length > this.MAX) this.buffer.shift();
    this.listeners.forEach((l) => {
      try {
        l(evt);
      } catch {
        // never throw from a listener
      }
    });
  }

  recent(): ReadonlyArray<PrintEvent> {
    return [...this.buffer];
  }

  count(type: PrintEventType): number {
    return this.counts[type] ?? 0;
  }

  reset(): void {
    this.buffer = [];
    this.counts = {};
  }
}

export const printEvents = new PrintEventBus();
