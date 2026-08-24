import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSubscriptions,
  listMemberSubscriptions,
  createSubscription,
  renewSubscription,
  freezeSubscription,
  unfreezeSubscription,
  cancelSubscription,
  setSubscriptionPaid,
  getDashboardStats,
  type CreateSubscriptionInput,
  type RenewSubscriptionInput,
} from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: listSubscriptions,
  });
}

export function useMemberSubscriptions(memberId: number | null) {
  return useQuery({
    queryKey: ["member-subscriptions", memberId],
    queryFn: () => listMemberSubscriptions(memberId!),
    enabled: memberId !== null,
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
    staleTime: 30_000,
  });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) =>
      createSubscription(actorId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["member-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useRenewSubscription() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (input: RenewSubscriptionInput) =>
      renewSubscription(actorId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["member-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useFreezeSubscription() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: ({
      subscriptionId,
      frozenUntil,
    }: {
      subscriptionId: number;
      frozenUntil: string;
    }) => freezeSubscription(actorId, subscriptionId, frozenUntil),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["member-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useUnfreezeSubscription() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (subscriptionId: number) =>
      unfreezeSubscription(actorId, subscriptionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["member-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useSetSubscriptionPaid() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: ({
      subscriptionId,
      isPaid,
    }: {
      subscriptionId: number;
      isPaid: boolean;
    }) => setSubscriptionPaid(actorId, subscriptionId, isPaid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["member-subscriptions"] });
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (subscriptionId: number) =>
      cancelSubscription(actorId, subscriptionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["member-subscriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
