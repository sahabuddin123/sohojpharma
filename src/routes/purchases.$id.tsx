import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/purchases/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/procurement/$id", params: { id: params.id } });
  },
});
