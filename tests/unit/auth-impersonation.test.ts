import { describe, expect, it } from "vitest";
import { resolveInitialTenantId } from "@/hooks/use-auth";

describe("SuperAdmin tenant resolution on login", () => {
  const admins = [
    { tenant_id: "demo-medical" },
    { tenant_id: "friends-pharma" },
  ];

  it("never auto-impersonates Demo medical for pure app admins without session impersonation", () => {
    const id = resolveInitialTenantId({
      isAdmin: true,
      memberships: [],
      adminTenants: admins,
      storedMemberTenant: "demo-medical", // residual localStorage from previous bug
      storedImpersonateTenant: null,
    });
    expect(id).toBeNull();
  });

  it("restores impersonated tenant only when explicit session impersonation key matches", () => {
    const id = resolveInitialTenantId({
      isAdmin: true,
      memberships: [],
      adminTenants: admins,
      storedMemberTenant: null,
      storedImpersonateTenant: "friends-pharma",
    });
    expect(id).toBe("friends-pharma");
  });

  it("falls back to own membership for users who are both admin and store owner when not impersonating", () => {
    const id = resolveInitialTenantId({
      isAdmin: true,
      memberships: [{ tenant_id: "own-pharmacy", is_default: true }],
      adminTenants: admins,
      storedMemberTenant: null,
      storedImpersonateTenant: null,
    });
    expect(id).toBe("own-pharmacy");
  });

  it("resolves regular store member tenant from localStorage or default membership", () => {
    const id = resolveInitialTenantId({
      isAdmin: false,
      memberships: [
        { tenant_id: "store-1", is_default: false },
        { tenant_id: "store-2", is_default: true },
      ],
      adminTenants: [],
      storedMemberTenant: "store-1",
      storedImpersonateTenant: null,
    });
    expect(id).toBe("store-1");
  });
});
