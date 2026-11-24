import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // B7.6 React Query defaults: cut redundant network chatter while keeping data fresh
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,            // 1 min — treat data as fresh
        gcTime: 5 * 60_000,           // 5 min cache retention
        refetchOnWindowFocus: false,  // background refetch only on demand
        refetchOnReconnect: "always",
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
