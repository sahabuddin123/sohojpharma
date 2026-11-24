import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  adoptionSuggestions, adoptGlobalMedicine,
} from "@/lib/api/global-adoption.functions";

export function AdoptionSuggestionsWidget({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const suggest = useServerFn(adoptionSuggestions);
  const adopt = useServerFn(adoptGlobalMedicine);

  const q = useQuery({
    enabled: !!tenantId,
    queryKey: ["adoption-suggestions", tenantId],
    queryFn: () => suggest({ data: { tenant_id: tenantId, limit: 10 } }),
  });

  const adoptM = useMutation({
    mutationFn: (id: string) =>
      adopt({ data: { tenant_id: tenantId, global_medicine_id: id } }),
    onSuccess: () => {
      toast.success(t("globalAdoption.added"));
      qc.invalidateQueries({ queryKey: ["adoption-suggestions"] });
      qc.invalidateQueries({ queryKey: ["unified-search"] });
      qc.invalidateQueries({ queryKey: ["global-browse"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          {t("globalAdoption.suggestedTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("globalAdoption.noSuggestions")}</div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.global_medicine_id} className="flex items-center justify-between rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.brand_name}</span>
                    {r.strength && <span className="text-xs text-muted-foreground">{r.strength}</span>}
                    <Badge variant="secondary">{r.adoption_count} {t("globalAdoption.adoptions")}</Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[r.generic_name, r.manufacturer_name].filter(Boolean).join(" • ")}
                  </div>
                </div>
                <Button size="sm" disabled={adoptM.isPending}
                  onClick={() => adoptM.mutate(r.global_medicine_id)}>
                  {adoptM.isPending && adoptM.variables === r.global_medicine_id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Plus className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
