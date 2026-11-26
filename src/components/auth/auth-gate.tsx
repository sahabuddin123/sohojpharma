import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

const PUBLIC_PATHS = ["/", "/auth", "/register", "/reset-password", "/blog", "/features", "/pricing", "/faq", "/contact", "/trust"];

function sanitizeRedirect(url?: string): string {
  if (!url) return "/dashboard";
  const trimmed = url.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
    trimmed.includes("\\")
  ) {
    return "/dashboard";
  }
  return trimmed;
}

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

  // Failsafe timeout to prevent any infinite spinner if auth state is delayed
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [loading]);

  const effectiveLoading = loading && !timedOut;

  useEffect(() => {
    if (effectiveLoading) return;
    if (!session && !isPublic) {
      navigate({
        to: "/auth",
        search: { redirect: pathname } as any,
        replace: true,
      });
    } else if (session && pathname === "/auth") {
      // Don't auto-redirect while registration and pending signout is in-flight
      if (typeof window !== "undefined" && (sessionStorage.getItem("just_registered") || window.location.search.includes("blocked"))) {
        return;
      }
      navigate({ to: sanitizeRedirect(searchRedirect), replace: true });
    }
  }, [effectiveLoading, session, isPublic, pathname, searchRedirect, navigate]);

  if (effectiveLoading && !isPublic) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}
