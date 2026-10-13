import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createBackup,
  deleteBackup,
  getBackupStatus,
  listBackups,
  restartApp,
  restoreBackup,
  updateBackupSettings,
  type UpdateBackupSettingsInput,
} from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

function useBackupKeys() {
  return {
    status: ["backup-status"],
    list: (folder: string | null) => ["backups", folder ?? "default"],
  };
}

export function useBackupStatus() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const { status } = useBackupKeys();
  return useQuery({
    queryKey: status,
    queryFn: () => getBackupStatus(sessionToken),
    enabled: !!sessionToken,
    staleTime: 30_000,
  });
}

export function useBackups(folder: string | null = null, enabled = true) {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const { list } = useBackupKeys();
  return useQuery({
    queryKey: list(folder),
    queryFn: () => listBackups(sessionToken, folder),
    enabled: !!sessionToken && enabled,
  });
}

export function useCreateBackup() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createBackup(sessionToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      queryClient.invalidateQueries({ queryKey: ["backup-status"] });
    },
  });
}

export function useUpdateBackupSettings() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBackupSettingsInput) =>
      updateBackupSettings(sessionToken, input),
    onSuccess: (data) => {
      queryClient.setQueryData(["backup-status"], data);
      queryClient.invalidateQueries({ queryKey: ["backups"] });
    },
  });
}

export function useDeleteBackup() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (backupPath: string) => deleteBackup(sessionToken, backupPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      queryClient.invalidateQueries({ queryKey: ["backup-status"] });
    },
  });
}

export function useRestoreBackup() {
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (backupPath: string) => restoreBackup(sessionToken, backupPath),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useRestartApp() {
  return useMutation({
    mutationFn: () => restartApp(),
  });
}
