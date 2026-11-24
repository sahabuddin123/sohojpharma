import { createFileRoute, redirect } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";

export const Route = createFileRoute("/mobile")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  beforeLoad: () => {
    throw redirect({ to: "/m" });
  },
  head: () => ({
    meta: [
      { title: "Mobile App — SohojPharma" },
      {
        name: "description",
        content: "Opens the SohojPharma phone app home screen with sales, reports and inventory tools.",
      },
      { property: "og:title", content: "Mobile App — SohojPharma" },
      { property: "og:description", content: "SohojPharma phone app for pharmacy sales and stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#0DB39E" },
    ],
  }),
  component: () => null,
});
