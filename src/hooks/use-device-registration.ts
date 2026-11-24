// Registers the current browser as a device for the signed-in user / tenant.
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getDeviceId, getDeviceMeta } from "@/lib/offline/device-id";
import { registerDevice } from "@/lib/api/devices.functions";

export function useDeviceRegistration() {
  const { user, currentTenantId } = useAuth();
  const sentFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !currentTenantId) return;
    const key = `${user.id}:${currentTenantId}`;
    if (sentFor.current === key) return;
    sentFor.current = key;
    const meta = getDeviceMeta();
    void registerDevice({
      data: {
        tenant_id: currentTenantId,
        device_id: getDeviceId(),
        device_name: meta.device_name,
        platform: meta.platform,
        user_agent: meta.user_agent,
      },
    }).catch(() => { sentFor.current = null; });
  }, [user, currentTenantId]);
}
