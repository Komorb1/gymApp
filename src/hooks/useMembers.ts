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
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useQuery({
    queryKey: ["members", search, sessionToken],
    queryFn: () =>
      search.trim()
        ? searchMembers(sessionToken, search)
        : listMembers(sessionToken),
    enabled: !!sessionToken,
  });
}

export function useMember(id: number | null) {
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useQuery({
    queryKey: ["member", id, sessionToken],
    queryFn: () => getMember(sessionToken, id!),
    enabled: id !== null && !!sessionToken,
  });
}

export function useMemberFlags(memberId: number | null) {
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useQuery({
    queryKey: ["member-flags", memberId, sessionToken],
    queryFn: () => getMemberFlags(sessionToken, memberId!),
    enabled: memberId !== null && !!sessionToken,
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: (input: CreateMemberInput) => createMember(sessionToken, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: (input: UpdateMemberInput) => updateMember(sessionToken, input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["member", data.id] });
    },
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: (id: number) => deleteMember(sessionToken, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });
}

export function useSetMemberFlag() {
  const qc = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: ({
      memberId,
      flag,
      note,
    }: {
      memberId: number;
      flag: string;
      note?: string | null;
    }) => setMemberFlag(sessionToken, memberId, flag, note),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["member-flags", vars.memberId] }),
  });
}

export function useRemoveMemberFlag() {
  const qc = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: ({ memberId, flag }: { memberId: number; flag: string }) =>
      removeMemberFlag(sessionToken, memberId, flag),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ["member-flags", vars.memberId] }),
  });
}

export function useSavePhoto() {
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");
  return useMutation({
    mutationFn: ({
      sourcePath,
      memberId,
    }: {
      sourcePath: string;
      memberId: number;
    }) => savePhoto(sessionToken, sourcePath, memberId),
  });
}
