import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { ProductForm } from "@/components/products/product-form";

export const Route = createFileRoute("/products/new")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "Add Product — SohojPharma" },
      { name: "description", content: "Add a new medicine or product to your pharmacy inventory." },
    ],
  }),
  component: () => <ProductForm mode="new" />,
});
