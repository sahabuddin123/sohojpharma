import { canonicalMasterCode } from "@/lib/import/normalizer";

export const MASTER_KIND_TABLES = {
  manufacturer: "manufacturers",
  generic: "generics",
  category: "categories",
  unit: "units",
  medicine_type: "medicine_types",
  dosage_form: "dosage_forms",
  therapeutic_class: "therapeutic_classes",
  country: "countries",
  tax_class: "tax_classes",
} as const;

export type ResolvableMasterKind = keyof typeof MASTER_KIND_TABLES;

export type MasterResolveInput = {
  kind: ResolvableMasterKind;
  name: string | null | undefined;
  branchId?: string | null;
  status?: string | null;
};

export type MasterResolveCache = Map<string, string>;

const collapse = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const cacheKey = (kind: ResolvableMasterKind, name: string) => `${kind}|${canonicalMasterCode(name)}`;

export async function resolveMasterIds(args: {
  supabase: any;
  tenantId: string;
  userId?: string | null;
  masters: MasterResolveInput[];
  cache?: MasterResolveCache;
}): Promise<Map<string, string>> {
  const cache = args.cache ?? new Map<string, string>();
  const resolved = new Map<string, string>();
  const unique = new Map<string, { kind: ResolvableMasterKind; name: string; branchId: string | null; status: string | null }>();

  for (const master of args.masters) {
    const name = collapse(master.name);
    if (!name) continue;
    const code = canonicalMasterCode(name);
    if (!code) continue;
    const key = cacheKey(master.kind, name);
    if (cache.has(key)) {
      resolved.set(key, cache.get(key)!);
      continue;
    }
    if (!unique.has(key)) {
      unique.set(key, {
        kind: master.kind,
        name,
        branchId: master.branchId ?? null,
        status: master.status ?? "active",
      });
    }
  }

  for (const [key, master] of unique) {
    const { data, error } = await args.supabase.rpc("resolve_master_id", {
      _tenant: args.tenantId,
      _kind: master.kind,
      _name: master.name,
      _branch: master.branchId,
      _actor: args.userId ?? null,
      _status: master.status ?? "active",
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Could not resolve ${master.kind}: ${master.name}`);
    cache.set(key, data as string);
    resolved.set(key, data as string);
  }

  return resolved;
}

export function getResolvedMasterId(
  map: Map<string, string>,
  kind: ResolvableMasterKind,
  name: string | null | undefined,
): string | null {
  const clean = collapse(name);
  if (!clean) return null;
  return map.get(cacheKey(kind, clean)) ?? null;
}
