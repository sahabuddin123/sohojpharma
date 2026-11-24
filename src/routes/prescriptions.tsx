import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";

export const Route = createFileRoute("/prescriptions")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "AI Prescription Scanner — SohojPharma" },
      { name: "description", content: "Scan prescriptions, extract medicines with AI, match to inventory and push to POS." },
    ],
  }),
  component: () => <Outlet />,
});
