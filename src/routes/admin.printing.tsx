import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PrintingSettingsPage } from "./settings.printing";

export const Route = createFileRoute("/admin/printing")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Printing Settings — App Admin" }] }),
  component: PrintingSettingsPage,
});
