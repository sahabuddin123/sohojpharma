import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";

// Paths the user is allowed to visit even when onboarding is incomplete.
const ALLOW_PREFIXES = [
  "/setup",
  "/auth",
  "/reset-password",
  "/admin",
  "/billing",
  "/settings",
  "/contact",
  "/faq",
  "/features",
  "/pricing",
  "/dashboard",
];

const ALLOW_EXACT = new Set(["/"]);

/**
 * Redirects authenticated tenants without any branch or warehouse to the
 * /setup wizard. SaaS app admins bypass this gate entirely.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { session, currentTenantId } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { branchCount, warehouseCount, isLoading } = useOnboardingStatus();

  const { data: isAppAdmin } = useQuery({
    enabled: !!session?.user?.id,
    queryKey: ["is-app-admin", session?.user?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("is_app_admin", {
        _user_id: session!.user.id,
      });
      return !!data;
    },
  });

  const isAllowed =
    ALLOW_EXACT.has(pathname) ||
    ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  useEffect(() => {
    if (!session || isAppAdmin) return;
    if (!currentTenantId || isLoading) return;
    if (isAllowed) return;
    if (branchCount === 0 || warehouseCount === 0) {
      navigate({ to: "/setup", replace: true });
    }
  }, [session, isAppAdmin, currentTenantId, isLoading, isAllowed, branchCount, warehouseCount, navigate]);

  return <>{children}</>;
}
