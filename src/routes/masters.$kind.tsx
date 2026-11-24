import { createFileRoute, notFound } from "@tanstack/react-router";
import { MasterDataPage } from "@/components/masters/MasterDataPage";
import { MASTER_KINDS, type MasterKind } from "@/lib/api/masters.functions";
import { RouteErrorPanel } from "@/components/route-error";

const META: Record<MasterKind, { title: string; description: string }> = {
  manufacturer:      { title: "Manufacturers",       description: "Pharmaceutical manufacturers and labs." },
  generic:           { title: "Generics",            description: "Active ingredients and generic medicine names." },
  category:          { title: "Categories",          description: "Product categories and groupings." },
  unit:              { title: "Units",               description: "Selling units such as tablet, bottle, strip." },
  medicine_type:     { title: "Medicine Types",      description: "Prescription, OTC, controlled, etc." },
  dosage_form:       { title: "Dosage Forms",        description: "Tablet, syrup, injection, ointment, etc." },
  therapeutic_class: { title: "Therapeutic Classes", description: "Antibiotic, analgesic, antihypertensive, etc." },
  country:           { title: "Countries",           description: "Countries of origin for imported medicines." },
  tax_class:         { title: "Tax Classes",         description: "VAT bands and product tax classifications." },
};

export const Route = createFileRoute("/masters/$kind")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  beforeLoad: ({ params }) => {
    if (!(MASTER_KINDS as readonly string[]).includes(params.kind)) throw notFound();
  },
  head: ({ params }) => {
    const m = META[params.kind as MasterKind];
    return { meta: [{ title: `${m?.title ?? "Master"} — SohojPharma` }] };
  },
  component: MasterKindRoute,
});

function MasterKindRoute() {
  const { kind } = Route.useParams();
  const m = META[kind as MasterKind];
  return <MasterDataPage kind={kind as MasterKind} title={m.title} description={m.description} />;
}
