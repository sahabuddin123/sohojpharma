import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  getMedicineDetails, getMedicineAlternatives, getDrugInteractions,
  getDosageGuide, getContraindications, getTherapeuticClass,
} from "@/lib/api/clinical.functions";
import { adoptGlobalMedicine } from "@/lib/api/global-adoption.functions";

export function MedicineDetailsDrawer({
  tenantId, globalMedicineId, isAdopted = false, onClose,
}: {
  tenantId: string;
  globalMedicineId: string | null;
  isAdopted?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const open = !!globalMedicineId;

  const details = useServerFn(getMedicineDetails);
  const altsFn = useServerFn(getMedicineAlternatives);
  const ixFn = useServerFn(getDrugInteractions);
  const doseFn = useServerFn(getDosageGuide);
  const contraFn = useServerFn(getContraindications);
  const classFn = useServerFn(getTherapeuticClass);
  const adopt = useServerFn(adoptGlobalMedicine);

  const arg = { data: { medicine_id: globalMedicineId ?? "" } };
  const [med, alts, ix, dose, contra, cls] = useQueries({
    queries: [
      { enabled: open, queryKey: ["gm-detail", globalMedicineId], queryFn: () => details(arg) },
      { enabled: open, queryKey: ["gm-alts", globalMedicineId], queryFn: () => altsFn(arg) },
      { enabled: open, queryKey: ["gm-ix", globalMedicineId], queryFn: () => ixFn(arg) },
      { enabled: open, queryKey: ["gm-dose", globalMedicineId], queryFn: () => doseFn(arg) },
      { enabled: open, queryKey: ["gm-contra", globalMedicineId], queryFn: () => contraFn(arg) },
      { enabled: open, queryKey: ["gm-class", globalMedicineId], queryFn: () => classFn(arg) },
    ],
  });

  const adoptM = useMutation({
    mutationFn: () =>
      adopt({ data: { tenant_id: tenantId, global_medicine_id: globalMedicineId! } }),
    onSuccess: () => {
      toast.success(t("globalAdoption.added"));
      qc.invalidateQueries({ queryKey: ["unified-search"] });
      qc.invalidateQueries({ queryKey: ["adoption-suggestions"] });
      qc.invalidateQueries({ queryKey: ["global-browse"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const m = (med.data ?? null) as null | {
    brand_name: string; strength: string | null; dosage_form: string | null;
    generic?: { name: string } | null; manufacturer?: { name: string } | null;
  };
  const altList = (alts.data ?? []) as Array<{
    alternative?: { brand_name: string; strength: string | null } | null;
  }>;
  const ixList = (ix.data ?? []) as Array<{
    severity: string; description: string | null;
    a?: { brand_name: string } | null; b?: { brand_name: string } | null;
  }>;
  const d = (dose.data ?? null) as null | {
    adult_dose: string | null; child_dose: string | null; max_daily_dose: string | null;
  };
  const contraList = (contra.data ?? []) as Array<{ condition: string; severity: string | null; notes: string | null }>;
  const classes = (cls.data ?? []) as Array<{ name: string } | null>;

  const loading = med.isLoading;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{m?.brand_name ?? t("medicineDetails.title")}</SheetTitle>
        </SheetHeader>
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : (
          <div className="space-y-4 p-1 pt-4 text-sm">
            <Grid>
              <Row k={t("medicineDetails.generic")} v={m?.generic?.name} />
              <Row k={t("medicineDetails.manufacturer")} v={m?.manufacturer?.name} />
              <Row k={t("medicineDetails.strength")} v={m?.strength} />
              <Row k={t("medicineDetails.form")} v={m?.dosage_form} />
            </Grid>

            {classes.length > 0 && (
              <Section title={t("medicineDetails.therapeuticClass")}>
                <div className="flex flex-wrap gap-1.5">
                  {classes.filter(Boolean).map((c, i) => (
                    <Badge key={i} variant="secondary">{c!.name}</Badge>
                  ))}
                </div>
              </Section>
            )}

            {altList.length > 0 && (
              <Section title={t("medicineDetails.alternatives")}>
                <div className="flex flex-wrap gap-1.5">
                  {altList.slice(0, 12).map((a, i) => a.alternative && (
                    <Badge key={i} variant="outline">
                      {a.alternative.brand_name}
                      {a.alternative.strength ? ` · ${a.alternative.strength}` : ""}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {ixList.length > 0 && (
              <Section title={t("medicineDetails.interactions")}>
                <ul className="space-y-1">
                  {ixList.slice(0, 10).map((i, idx) => {
                    const partner = i.a?.brand_name !== m?.brand_name ? i.a?.brand_name : i.b?.brand_name;
                    return (
                      <li key={idx} className="flex items-center justify-between">
                        <span>{partner ?? "—"}</span>
                        <Badge variant={i.severity === "Major" ? "destructive" : "secondary"}>
                          {i.severity}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              </Section>
            )}

            {d && (d.adult_dose || d.child_dose || d.max_daily_dose) && (
              <Section title={t("medicineDetails.dosage")}>
                <Grid>
                  <Row k={t("medicineDetails.adultDose")} v={d.adult_dose} />
                  <Row k={t("medicineDetails.childDose")} v={d.child_dose} />
                  <Row k={t("medicineDetails.maxDose")} v={d.max_daily_dose} />
                </Grid>
              </Section>
            )}

            {contraList.length > 0 && (
              <Section title={t("medicineDetails.contraindications")}>
                <ul className="space-y-1">
                  {contraList.slice(0, 10).map((c, i) => (
                    <li key={i}>
                      <span className="font-medium">{c.condition}</span>
                      {c.notes ? ` — ${c.notes}` : ""}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {!isAdopted && (
              <>
                <Separator />
                <Button className="w-full" disabled={adoptM.isPending} onClick={() => adoptM.mutate()}>
                  {adoptM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {t("globalCatalog.addToMyCatalog")}
                </Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}
function Row({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className="font-medium">{v || "—"}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}
