import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface TenantMembership {
  tenant_id: string;
  is_default: boolean;
  tenants: { id: string; name: string; slug: string; type: string; plan: string } | null;
}

export interface AdminTenant {
  tenant_id: string;
  is_default: boolean;
  tenants: { id: string; name: string; slug: string; type: string; plan: string; status?: string | null } | null;
}

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  memberships: TenantMembership[];
  adminTenants: AdminTenant[];
  impersonating: boolean;
  currentTenantId: string | null;
  setCurrentTenantId: (id: string | null) => void;
  clearImpersonation: () => void;
  signOut: () => Promise<void>;
  isAppAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TENANT_KEY = "pc_tenant";
const ADMIN_IMPERSONATE_KEY = "pc_admin_impersonate";

export function resolveInitialTenantId(params: {
  isAdmin: boolean;
  memberships: Array<{ tenant_id: string; is_default?: boolean }>;
  adminTenants: Array<{ tenant_id: string }>;
  storedMemberTenant: string | null;
  storedImpersonateTenant: string | null;
}): string | null {
  const { isAdmin, memberships, adminTenants, storedMemberTenant, storedImpersonateTenant } = params;
  const memberDefault =
    memberships.find((m) => m.tenant_id === storedMemberTenant)?.tenant_id ??
    memberships.find((m) => m.is_default)?.tenant_id ??
    memberships[0]?.tenant_id ??
    null;

  if (isAdmin) {
    // App admins only enter impersonation mode when explicitly stored for this browser session.
    const activeImp = adminTenants.find((t) => t.tenant_id === storedImpersonateTenant)?.tenant_id;
    return activeImp ?? memberDefault;
  }

  return memberDefault;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [adminTenants, setAdminTenants] = useState<AdminTenant[]>([]);
  const [currentTenantId, setCurrent] = useState<string | null>(null);
  const [isAppAdmin, setIsAppAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Safety timeout: Never leave the UI stuck in loading state indefinitely
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 2000);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) {
        setSession(s);
        setLoading(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) {
          setSession(data?.session ?? null);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[Auth] Failed to restore session:", err);
        if (mounted) {
          setSession(null);
          setLoading(false);
        }
      })
      .finally(() => {
        clearTimeout(safetyTimer);
      });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setMemberships([]);
      setAdminTenants([]);
      setCurrent(null);
      setIsAppAdmin(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("tenant_members")
          .select("tenant_id, is_default, tenants(id,name,slug,type,plan,status)")
          .eq("user_id", session.user.id);

        if (cancelled || error) return;

        const list = (data ?? []) as unknown as Array<
          TenantMembership & { tenants: { status?: string | null } | null }
        >;

        const { data: isAdmin } = await supabase.rpc("is_app_admin", {
          _user_id: session.user.id,
        });

        if (cancelled) return;
        setIsAppAdmin(!!isAdmin);

        if (!isAdmin && list.length > 0) {
          const anyActive = list.some((m) => (m.tenants?.status ?? "active") === "active");
          if (!anyActive) {
            const first = list[0];
            const st = first.tenants?.status ?? "pending";
            // If pending or rejected, sign out and redirect to auth with notice
            if (st === "pending" || st === "rejected") {
              await supabase.auth.signOut();
              if (typeof window !== "undefined") {
                localStorage.removeItem(TENANT_KEY);
                const url = new URL(window.location.origin + "/auth");
                url.searchParams.set("blocked", st);
                window.location.replace(url.toString());
              }
              return;
            }
            // If expired or suspended, store owner can access billing renewal & support tickets
            if (typeof window !== "undefined") {
              const p = window.location.pathname;
              const allowed = p.startsWith("/billing") || p.startsWith("/contact") || p.startsWith("/support");
              if (!allowed) {
                window.location.replace("/billing/locked");
              }
            }
          }
        }

        setMemberships(list as unknown as TenantMembership[]);

        const storedMemberTenant = typeof window !== "undefined" ? localStorage.getItem(TENANT_KEY) : null;
        const storedImpersonateTenant =
          typeof window !== "undefined" ? sessionStorage.getItem(ADMIN_IMPERSONATE_KEY) : null;

        // App admins hydrate selectable tenants from admin_list_tenants
        let admins: AdminTenant[] = [];
        if (isAdmin) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: t } = await (supabase.rpc as any)("admin_list_tenants");
          if (cancelled) return;
          admins = ((t ?? []) as Array<{
            id: string;
            name: string;
            slug: string;
            status: string;
            type: string;
          }>).map((row) => ({
            tenant_id: row.id,
            is_default: false,
            tenants: {
              id: row.id,
              name: row.name,
              slug: row.slug,
              type: row.type,
              plan: "",
              status: row.status,
            },
          }));
          setAdminTenants(admins);
        } else {
          setAdminTenants([]);
        }

        const resolvedTenantId = resolveInitialTenantId({
          isAdmin: !!isAdmin,
          memberships: list,
          adminTenants: admins,
          storedMemberTenant,
          storedImpersonateTenant,
        });
        setCurrent(resolvedTenantId);
        if (typeof window !== "undefined") {
          if (isAdmin && list.length === 0) {
            localStorage.removeItem(TENANT_KEY);
          } else if (resolvedTenantId && !storedMemberTenant && list.some((m) => m.tenant_id === resolvedTenantId)) {
            localStorage.setItem(TENANT_KEY, resolvedTenantId);
          }
        }
      } catch (err) {
        console.error("[Auth] Error fetching tenant context:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const queryClient = useQueryClient();

  const setCurrentTenantId = (id: string | null) => {
    if (id !== currentTenantId) {
      queryClient.clear();
    }
    setCurrent(id);
    if (typeof window !== "undefined") {
      if (!id) {
        sessionStorage.removeItem(ADMIN_IMPERSONATE_KEY);
      } else if (isAppAdmin && !memberships.some((m) => m.tenant_id === id)) {
        sessionStorage.setItem(ADMIN_IMPERSONATE_KEY, id);
      } else {
        sessionStorage.removeItem(ADMIN_IMPERSONATE_KEY);
        localStorage.setItem(TENANT_KEY, id);
      }
    }
    if (isAppAdmin && id && !memberships.some((m) => m.tenant_id === id)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)("admin_switch_tenant", { _tenant_id: id }).then(() => {});
    }
  };

  const clearImpersonation = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(ADMIN_IMPERSONATE_KEY);
    }
    const ownDefault =
      memberships.find((m) => m.is_default)?.tenant_id ??
      memberships[0]?.tenant_id ??
      null;
    setCurrentTenantId(ownDefault);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem(TENANT_KEY);
      sessionStorage.removeItem(ADMIN_IMPERSONATE_KEY);
    }
  };

  const isMemberOfCurrentTenant = memberships.some(
    (m) => m.tenant_id === currentTenantId,
  );
  const impersonating = isAppAdmin && !!currentTenantId && !isMemberOfCurrentTenant;

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        memberships,
        adminTenants,
        impersonating,
        currentTenantId,
        setCurrentTenantId,
        clearImpersonation,
        signOut,
        isAppAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
