import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Factory, Pill, Tags, Ruler, Beaker, Layers, Stethoscope, Flag, Percent } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { getAllMasterStats, type MasterKind } from "@/lib/api/masters.functions";
import { RouteErrorPanel } from "@/components/route-error";

export const Route = createFileRoute("/masters/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Master Data — SohojPharma" }] }),
  component: MasterDashboard,
});

const MASTERS: { kind: MasterKind; title: string; icon: any; description: string }[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  { kind: "manufacturer", title: "Manufacturers", icon: Factory, description: "Pharmaceutical companies" },
  { kind: "generic", title: "Generics", icon: Pill, description: "Active ingredients" },
  { kind: "category", title: "Categories", icon: Tags, description: "Product categories" },
  { kind: "unit", title: "Units", icon: Ruler, description: "Selling units (tablet, bottle…)" },
  { kind: "medicine_type", title: "Medicine Types", icon: Beaker, description: "Prescription, OTC, etc." },
  { kind: "dosage_form", title: "Dosage Forms", icon: Layers, description: "Tablet, syrup, injection…" },
  { kind: "therapeutic_class", title: "Therapeutic Classes", icon: Stethoscope, description: "Antibiotic, analgesic…" },
  { kind: "country", title: "Countries", icon: Flag, description: "Country of origin" },
  { kind: "tax_class", title: "Tax Classes", icon: Percent, description: "VAT and tax rates" },
];

function MasterDashboard() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const statsFn = useServerFn(getAllMasterStats);
  const q = useQuery({
    queryKey: ["masters-stats-all", tenantId],
    enabled: !!tenantId,
    queryFn: () => statsFn({ data: { tenant_id: tenantId } }),
  });

  return (
    <AppShell variant="store" title="Master Data">
      <PageHeader
        title="Master Data"
        description="Single source of truth for every product attribute."
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MASTERS.map((m) => {
          const s = q.data?.[m.kind];
          const Icon = m.icon;
          return (
            <Link key={m.kind} to="/masters/$kind" params={{ kind: m.kind }} className="block">
              <Card className="transition hover:border-primary">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted p-2"><Icon className="h-5 w-5" /></div>
                      <div>
                        <div className="font-semibold">{m.title}</div>
                        <div className="text-xs text-muted-foreground">{m.description}</div>
                      </div>
                    </div>
                    {s && s.duplicates > 0 && (
                      <Badge variant="destructive">{s.duplicates} dup</Badge>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Total" value={s?.total} />
                    <Stat label="Active" value={s?.active} />
                    <Stat label="Deleted" value={s?.deleted} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <div className="text-lg font-semibold">{value ?? "—"}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
