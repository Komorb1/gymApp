import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  type CreatePlanInput,
  type UpdatePlanInput,
} from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

export function usePlans() {
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useQuery({
    queryKey: ["plans", sessionToken],
    queryFn: () => listPlans(sessionToken),
    enabled: !!sessionToken,
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: (input: CreatePlanInput) => createPlan(sessionToken, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: (input: UpdatePlanInput) => updatePlan(sessionToken, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: (id: number) => deletePlan(sessionToken, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}
