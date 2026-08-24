import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listMembers,
  searchMembers,
  getMember,
  createMember,
  updateMember,
  deleteMember,
  getMemberFlags,
  setMemberFlag,
  removeMemberFlag,
  savePhoto,
  type CreateMemberInput,
  type UpdateMemberInput,
} from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

export function useMembers(search: string) {
  return useQuery({
    queryKey: ["members", search],
    queryFn: () => (search.trim() ? searchMembers(search) : listMembers()),
  });
}

export function useMember(id: number | null) {
  return useQuery({
    queryKey: ["member", id],
    queryFn: () => getMember(id!),
    enabled: id !== null,
  });
}

export function useMemberFlags(memberId: number | null) {
  return useQuery({
    queryKey: ["member-flags", memberId],
    queryFn: () => getMemberFlags(memberId!),
    enabled: memberId !== null,
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (input: CreateMemberInput) => createMember(actorId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (input: UpdateMemberInput) => updateMember(actorId, input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.setQueryData(["member", data.id], data);
    },
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: (id: number) => deleteMember(actorId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useSetMemberFlag() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: ({
      memberId,
      flag,
      note,
    }: {
      memberId: number;
      flag: string;
      note?: string | null;
    }) => setMemberFlag(actorId, memberId, flag, note),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["member-flags", vars.memberId] }),
  });
}

export function useRemoveMemberFlag() {
  const qc = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  return useMutation({
    mutationFn: ({ memberId, flag }: { memberId: number; flag: string }) =>
      removeMemberFlag(actorId, memberId, flag),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["member-flags", vars.memberId] }),
  });
}

export function useSavePhoto() {
  return useMutation({
    mutationFn: ({ sourcePath, memberId }: { sourcePath: string; memberId: number }) =>
      savePhoto(sourcePath, memberId),
  });
}
