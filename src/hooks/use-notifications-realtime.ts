import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Refreshes notification queries periodically when the tab is visible.
 * Avoids opening a Supabase Realtime WebSocket when no realtime service is deployed.
 */
export function useNotificationsRealtime(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!tenantId) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId] });
      qc.invalidateQueries({ queryKey: ["notification-center", tenantId] });
      qc.invalidateQueries({ queryKey: ["alerts-feed", tenantId] });
    }, 60_000);

    return () => window.clearInterval(id);
  }, [tenantId, qc]);
}
