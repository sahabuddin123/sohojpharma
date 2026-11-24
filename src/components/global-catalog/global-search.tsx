import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Globe2, CheckCircle2, PackageCheck, Plus, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  unifiedMedicineSearch,
  adoptGlobalMedicine,
  type UnifiedSearchRow,
} from "@/lib/api/global-adoption.functions";
import { MedicineDetailsDrawer } from "./medicine-details-drawer";

export function GlobalSearch({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const search = useServerFn(unifiedMedicineSearch);
  const adopt = useServerFn(adoptGlobalMedicine);

  const searchQ = useQuery({
    enabled: !!tenantId && q.trim().length >= 2,
    queryKey: ["unified-search", tenantId, q],
    queryFn: () => search({ data: { tenant_id: tenantId, q: q.trim(), limit: 25 } }),
  });

  const adoptM = useMutation({
    mutationFn: (gmId: string) =>
      adopt({ data: { tenant_id: tenantId, global_medicine_id: gmId } }),
    onSuccess: () => {
      toast.success(t("globalAdoption.added"));
      qc.invalidateQueries({ queryKey: ["unified-search"] });
      qc.invalidateQueries({ queryKey: ["adoption-suggestions"] });
      qc.invalidateQueries({ queryKey: ["tenant-catalog-health"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { local, globl } = useMemo(() => {
    const rows = searchQ.data ?? [];
    return {
      local: rows.filter((r) => r.result_type === "in_catalog"),
      globl: rows.filter((r) => r.result_type === "available_globally"),
    };
  }, [searchQ.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe2 className="h-5 w-5" />
          {t("globalCatalog.searchTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder={t("globalCatalog.searchPlaceholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {searchQ.isFetching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        )}
        {q.trim().length >= 2 && !searchQ.isFetching && (
          <div className="space-y-6">
            <Section
              title={t("globalCatalog.inMyCatalog")}
              rows={local}
              onOpen={setOpenId}
            />
            <Section
              title={t("globalCatalog.availableGlobally")}
              rows={globl}
              onOpen={setOpenId}
              onAdopt={(id) => adoptM.mutate(id)}
              adopting={adoptM.isPending ? adoptM.variables ?? null : null}
            />
          </div>
        )}
      </CardContent>
      <MedicineDetailsDrawer
        tenantId={tenantId}
        globalMedicineId={openId}
        onClose={() => setOpenId(null)}
      />
    </Card>
  );
}

function Section({
  title, rows, onOpen, onAdopt, adopting,
}: {
  title: string;
  rows: UnifiedSearchRow[];
  onOpen: (id: string) => void;
  onAdopt?: (id: string) => void;
  adopting?: string | null;
}) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="space-y-2">
        {rows.map((r) => {
          const id = r.global_medicine_id ?? r.product_id ?? "";
          const isLocal = r.result_type === "in_catalog";
          return (
            <div
              key={`${r.result_type}-${id}`}
              className="flex items-center justify-between rounded-md border p-3 hover:bg-accent/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.brand_name}</span>
                  {r.strength && (
                    <span className="text-xs text-muted-foreground">{r.strength}</span>
                  )}
                  {isLocal ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {t("globalCatalog.badgeInCatalog")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Globe2 className="h-3 w-3" /> {t("globalCatalog.badgeGlobal")}
                    </Badge>
                  )}
                  {isLocal && r.already_in_stock && (
                    <Badge className="gap-1">
                      <PackageCheck className="h-3 w-3" /> {t("globalCatalog.badgeInStock")}
                    </Badge>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[r.generic_name, r.manufacturer_name, r.dosage_form]
                    .filter(Boolean).join(" • ")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.global_medicine_id && (
                  <Button size="sm" variant="ghost" onClick={() => onOpen(r.global_medicine_id!)}>
                    <Info className="h-4 w-4" />
                  </Button>
                )}
                {!isLocal && onAdopt && r.global_medicine_id && (
                  <Button
                    size="sm"
                    disabled={adopting === r.global_medicine_id}
                    onClick={() => onAdopt(r.global_medicine_id!)}
                  >
                    {adopting === r.global_medicine_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span className="ml-1">{t("globalCatalog.addToMyCatalog")}</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
