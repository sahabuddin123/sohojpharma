import { Outlet, createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/quotations")({
  component: () => <Outlet />,
});
