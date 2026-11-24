import { useMemo, useState } from "react";
import { Search, Pill } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MEDICINE_MASTER, type MedicineMaster } from "@/data/medicines";

type SearchBy = "brand" | "generic" | "manufacturer";

interface MedicineSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (medicine: MedicineMaster) => void;
}

export function MedicineSearchModal({ open, onOpenChange, onSelect }: MedicineSearchModalProps) {
  const [query, setQuery] = useState("");
  const [by, setBy] = useState<SearchBy>("brand");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MEDICINE_MASTER.slice(0, 12);
    return MEDICINE_MASTER.filter((m) => {
      const field =
        by === "brand" ? m.brand : by === "generic" ? m.generic : m.manufacturer;
      return field.toLowerCase().includes(q);
    }).slice(0, 30);
  }, [query, by]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            Search medicine master
          </DialogTitle>
        </DialogHeader>

        <Tabs value={by} onValueChange={(v) => setBy(v as SearchBy)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="brand">By brand</TabsTrigger>
            <TabsTrigger value="generic">By generic</TabsTrigger>
            <TabsTrigger value="manufacturer">By manufacturer</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${by}…`}
            className="pl-9"
          />
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {results.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No medicines match your search.
            </p>
          )}
          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onSelect(m);
                onOpenChange(false);
              }}
              className="flex w-full items-start justify-between gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{m.brand}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.generic} · {m.strength}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {m.manufacturer}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant="outline" className="text-[10px]">
                  {m.dosageForm}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{m.packSize}</span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
