import { Warehouse } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { WarehouseOption } from "@/hooks/use-active-warehouse";

interface WarehouseSelectProps {
  warehouses: WarehouseOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export function WarehouseSelect({
  warehouses, value, onChange, placeholder = "Select warehouse", className,
}: WarehouseSelectProps) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className={className ?? "h-9 w-[220px] gap-2"} aria-label="Active warehouse">
        <Warehouse className="h-3.5 w-3.5 text-primary" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {warehouses.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No warehouses configured.
          </div>
        ) : warehouses.map((w) => (
          <SelectItem key={w.id} value={w.id}>
            <span className="font-medium">{w.name}</span>
            {w.branch_name && (
              <span className="ml-1 text-xs text-muted-foreground">· {w.branch_name}</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
