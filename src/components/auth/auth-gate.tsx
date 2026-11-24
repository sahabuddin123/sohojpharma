import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

const PUBLIC_PATHS = ["/", "/auth", "/reset-password", "/blog", "/features", "/pricing", "/faq", "/contact", "/trust"];

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRedirect = useRouterState({
    select: (s) => {
      const r = (s.location.search as Record<string, unknown> | undefined)?.redirect;
      return typeof r === "string" ? r : undefined;
    },
  });
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/")));

  useEffect(() => {
    if (loading) return;
    if (!session && !isPublic) {
      navigate({
        to: "/auth",
        search: { redirect: pathname } as any,
        replace: true,
      });
    } else if (session && pathname === "/auth") {
      navigate({ to: searchRedirect ?? "/dashboard", replace: true });
    }
  }, [loading, session, isPublic, pathname, searchRedirect, navigate]);

  if (loading && !isPublic) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}
