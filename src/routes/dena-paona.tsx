import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dena-paona")({
  component: () => <Outlet />,
});
