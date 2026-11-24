export function tenantFromInput(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;

  const row = data as Record<string, unknown>;
  const tenantId = row.tenantId ?? row.tenant_id ?? row._tenant_id;
  if (typeof tenantId === "string" && tenantId.length > 0) return tenantId;

  return tenantFromInput(row.data);
}