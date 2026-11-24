import { createFileRoute, redirect } from "@tanstack/react-router";

// C2.3 — Customer Collections is implemented at /sales/due-collections
// with full ledger, payment dialog, RPC posting and audit. Mirror the route here.
export const Route = createFileRoute("/customers/collections")({
  beforeLoad: () => { throw redirect({ to: "/sales/due-collections" }); },
});
