import { useQuery } from "@tanstack/react-query";
import { listActivityLogs } from "@/lib/ipc";

export function useActivityLogs(limit?: number) {
  return useQuery({
    queryKey: ["activity-logs", limit],
    queryFn: () => listActivityLogs(limit),
    staleTime: 10_000,
  });
}
