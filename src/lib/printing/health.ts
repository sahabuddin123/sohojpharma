// Lightweight printer health monitor.
// Polls QZ connection state every 30s while a subscriber is mounted.
// Records snapshots into print_health_log for the diagnostics view.
import { isConnected } from "./qz/connection";
import { recordPrinterHealth } from "./server.functions";

export interface HealthSnapshot {
  qzConnected: boolean;
  checkedAt: number;
}

type Listener = (snap: HealthSnapshot) => void;

class HealthMonitor {
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last: HealthSnapshot = { qzConnected: false, checkedAt: 0 };
  private tenantId: string | null = null;
  private branchId: string | null = null;

  configure(tenantId: string | null, branchId: string | null): void {
    this.tenantId = tenantId;
    this.branchId = branchId;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.last);
    this.ensureRunning();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  snapshot(): HealthSnapshot {
    return this.last;
  }

  private ensureRunning(): void {
    if (this.timer) return;
    const tick = async () => {
      const connected = await isConnected().catch(() => false);
      const snap: HealthSnapshot = { qzConnected: connected, checkedAt: Date.now() };
      this.last = snap;
      this.listeners.forEach((l) => l(snap));
      if (this.tenantId) {
        try {
          await recordPrinterHealth({
            data: {
              tenant_id: this.tenantId,
              branch_id: this.branchId,
              printer_name: "qz-tray",
              status: connected ? "connected" : "offline",
              latency_ms: null,
              detail: null,
            },
          });
        } catch {
          /* best-effort */
        }
      }
    };
    void tick();
    this.timer = setInterval(tick, 30_000);
  }
}

export const printerHealth = new HealthMonitor();
