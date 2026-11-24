import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias route: /purchase-requisition → the existing implementation at
// /purchasing/requisition. Keeps the top-nav shortcut URL clean while
// reusing the same POS-style module without duplicating logic.
export const Route = createFileRoute("/_authenticated/purchase-requisition")({
  beforeLoad: () => {
    throw redirect({ to: "/purchasing/requisition", search: { edit: undefined } });
  },
  component: () => null,
});
