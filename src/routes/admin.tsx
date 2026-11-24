import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionRes } = await supabase.auth.getSession();
    const user = sessionRes?.session?.user;
    if (!user) {
      throw redirect({
        to: "/auth",
        search: {
          redirect:
            typeof window !== "undefined"
              ? window.location.pathname + window.location.search
              : undefined,
        } as any,
      });
    }
    const { data: isAdmin, error } = await supabase.rpc("is_app_admin", {
      _user_id: user.id,
    });
    if (error || !isAdmin) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: () => <Outlet />,
});
