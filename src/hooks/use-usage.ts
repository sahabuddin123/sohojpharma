import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUsageSummary, type UsageRow } from "@/lib/api/usage.functions";

export function useUsageSummary() {
  const fn = useServerFn(getUsageSummary);
  return useQuery<UsageRow[]>({
    queryKey: ["usage-summary"],
    queryFn: () => fn({ data: {} }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
