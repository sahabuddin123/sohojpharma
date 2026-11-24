import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes on the notifications table for the current
 * user within a tenant. The channel topic is scoped to the user so other
 * tenant members cannot subscribe to it.
 */
export function useNotificationsRealtime(tenantId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || cancelled) return;
      channel = supabase
        .channel(`notifications:${tenantId}:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId] });
            qc.invalidateQueries({ queryKey: ["notification-center", tenantId] });
            qc.invalidateQueries({ queryKey: ["alerts-feed", tenantId] });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [tenantId, qc]);
}
