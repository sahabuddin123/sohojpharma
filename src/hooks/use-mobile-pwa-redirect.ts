import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

const DESKTOP_FLAG = "pc.mobile.forceDesktop";
const MOBILE_BREAKPOINT = 768;

/** Store desktop path -> phone (PWA) route */
const ROUTE_MAP: Record<string, string> = {
  "/store": "/m",
  "/dashboard": "/m",
  "/sales/pos": "/m/sale",
  "/sales": "/m/sales",
  "/sales/history": "/m/sales",
  "/purchases": "/m/purchases",
  "/purchases/new": "/m/purchase",

  "/customers": "/m/customers",
  "/suppliers": "/m/suppliers",
  "/customers/collections": "/m/collect",
  "/reports": "/m/report",
  "/reports/analytics": "/m/analytics",
  "/inventory/expiry": "/m/expired",
  "/products": "/m/products",
  "/products/generics": "/m/generics",
  "/accounts/income": "/m/income",
  "/dues": "/m/credit-adjustment",
  "/dues/collections": "/m/credit-adjustment",

  "/billing": "/m/subscription",
};

function mapPath(pathname: string): string | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_MAP[clean] ?? null;
}

/**
 * On phone-sized viewports, send store users to the matching phone (PWA) screen.
 * `?desktop=1` opts out and is remembered for the session.
 */
export function useMobilePwaRedirect(enabled: boolean) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    try {
      if (search?.includes("desktop=1")) {
        sessionStorage.setItem(DESKTOP_FLAG, "1");
        return;
      }
      if (sessionStorage.getItem(DESKTOP_FLAG) === "1") return;
    } catch {
      /* noop */
    }

    if (window.innerWidth >= MOBILE_BREAKPOINT) return;
    if (pathname.startsWith("/m")) return;

    const target = mapPath(pathname);
    if (target) navigate({ to: target, replace: true });
  }, [enabled, pathname, search, navigate]);
}
