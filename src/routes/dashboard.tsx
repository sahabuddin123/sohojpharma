import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      throw redirect({ to: "/auth", replace: true });
    }
    const { data: isAdmin } = await supabase.rpc("is_app_admin", {
      _user_id: user.id,
    });
    if (isAdmin) {
      throw redirect({ to: "/admin", replace: true });
    }
    throw redirect({ to: "/store", replace: true });
  },
});
