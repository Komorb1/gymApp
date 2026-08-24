import { useQuery } from "@tanstack/react-query";
import { fetchDbHealth, type DbHealth } from "@/lib/ipc";

export function useDbHealth() {
  return useQuery<DbHealth>({
    queryKey: ["db-health"],
    queryFn: fetchDbHealth,
    retry: false,
    staleTime: 30_000,
  });
}
