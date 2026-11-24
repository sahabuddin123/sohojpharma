import { useEffect, useState } from "react";
import { registerPWA } from "@/lib/pwa-register";

export function PWAUpdater() {
  const [reload, setReload] = useState<(() => void) | null>(null);

  useEffect(() => {
    registerPWA((doReload) => setReload(() => doReload));
  }, []);

  if (!reload) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-3 shadow-lg flex items-center gap-3">
      <span className="text-sm text-foreground">A new version is available.</span>
      <button
        onClick={() => reload()}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Refresh
      </button>
    </div>
  );
}
