import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { PhoneShell } from "@/components/mobile/phone-shell";

export const Route = createFileRoute("/m/subscription")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Subscription — Pharmacy Phone App" },
      { name: "description", content: "Your pharmacy plan, next payment date and billing history on your phone." },
      { property: "og:title", content: "Subscription — Pharmacy Phone App" },
      { property: "og:description", content: "Plan, next payment and billing history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <PhoneShell title="Subscription">
      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Plan &amp; billing history coming in the next part.
      </div>
    </PhoneShell>
  ),
});
