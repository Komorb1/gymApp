import { useQuery } from "@tanstack/react-query";
import { listActivityLogs } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

export function useActivityLogs(limit?: number) {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  return useQuery({
    queryKey: ["activity-logs", limit, sessionToken],
    queryFn: () => listActivityLogs(sessionToken, limit),
    enabled: !!sessionToken,
    staleTime: 10_000,
  });
}
