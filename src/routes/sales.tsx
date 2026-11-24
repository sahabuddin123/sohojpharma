import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sales")({
  component: () => <Outlet />,
});
