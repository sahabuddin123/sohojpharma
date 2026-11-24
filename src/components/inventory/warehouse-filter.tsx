import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  allowAll?: boolean;
  className?: string;
  placeholder?: string;
};

/**
 * Reusable warehouse picker for report pages, transfer forms and the
 * warehouse dashboard. Pass `allowAll` to expose an "All warehouses" option.
 */
export function WarehouseFilter({ value, onChange, allowAll = true, className, placeholder = "Select warehouse" }: Props) {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const { data = [] } = useQuery({
    enabled: !!tenantId,
    queryKey: ["warehouses-filter", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, branch_id, branches:branch_id(name)")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; branches: { name: string } | null }>;
    },
  });

  return (
    <Select value={value ?? (allowAll ? "__all" : "")} onValueChange={(v) => onChange(v === "__all" ? null : v)}>
      <SelectTrigger className={className}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="__all">All warehouses</SelectItem>}
        {data.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            {w.name}{w.branches?.name ? ` — ${w.branches.name}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
