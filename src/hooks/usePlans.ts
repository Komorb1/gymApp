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
  return useQuery({
    queryKey: ["plans"],
    queryFn: listPlans,
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (input: CreatePlanInput) => createPlan(actorId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (input: UpdatePlanInput) => updatePlan(actorId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (id: number) => deletePlan(actorId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}
