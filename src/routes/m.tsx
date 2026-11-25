import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/m")({
  ssr: false,
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  beforeLoad: async ({ location }) => {
    // Use local cached session first so offline PWA navigation never gets kicked to /auth
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      return;
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.pathname } as never,
        replace: true,
      });
    }
  },
  component: () => <Outlet />,
});
