import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { ProductForm } from "@/components/products/product-form";

export const Route = createFileRoute("/products/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [{ title: "Edit Product — SohojPharma" }],
  }),
  component: ProductEditPage,
});

function ProductEditPage() {
  const { id } = Route.useParams();
  return <ProductForm mode="edit" productId={id} />;
}
