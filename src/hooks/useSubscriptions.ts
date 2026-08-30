import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelSubscription,
  createSubscription,
  freezeSubscription,
  getDashboardStats,
  listMemberSubscriptions,
  listSubscriptions,
  renewSubscription,
  unfreezeSubscription,
  updateSubscription,
  type CreateSubscriptionInput,
  type RenewSubscriptionInput,
  type UpdateSubscriptionInput,
} from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

function useInvalidateMemberships() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    queryClient.invalidateQueries({ queryKey: ["member-subscriptions"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };
}

export function useSubscriptions() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  return useQuery({
    queryKey: ["subscriptions", sessionToken],
    queryFn: () => listSubscriptions(sessionToken),
    enabled: !!sessionToken,
  });
}

export function useMemberSubscriptions(memberId: number | null) {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  return useQuery({
    queryKey: ["member-subscriptions", memberId, sessionToken],
    queryFn: () => listMemberSubscriptions(sessionToken, memberId!),
    enabled: memberId !== null && !!sessionToken,
  });
}

export function useDashboardStats() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  return useQuery({
    queryKey: ["dashboard-stats", sessionToken],
    queryFn: () => getDashboardStats(sessionToken),
    enabled: !!sessionToken,
    staleTime: 30_000,
  });
}

export function useCreateSubscription() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) =>
      createSubscription(sessionToken, input),
    onSuccess: invalidate,
  });
}

export function useRenewSubscription() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: (input: RenewSubscriptionInput) =>
      renewSubscription(sessionToken, input),
    onSuccess: invalidate,
  });
}

export function useFreezeSubscription() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: ({
      subscriptionId,
      frozenUntil,
    }: {
      subscriptionId: number;
      frozenUntil: string;
    }) => freezeSubscription(sessionToken, subscriptionId, frozenUntil),
    onSuccess: invalidate,
  });
}

export function useUnfreezeSubscription() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: (subscriptionId: number) =>
      unfreezeSubscription(sessionToken, subscriptionId),
    onSuccess: invalidate,
  });
}

export function useUpdateSubscription() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: (input: UpdateSubscriptionInput) =>
      updateSubscription(sessionToken, input),
    onSuccess: invalidate,
  });
}

export function useCancelSubscription() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const invalidate = useInvalidateMemberships();
  return useMutation({
    mutationFn: (subscriptionId: number) =>
      cancelSubscription(sessionToken, subscriptionId),
    onSuccess: invalidate,
  });
}
