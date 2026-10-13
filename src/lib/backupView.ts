import type { BackupSummary } from "./ipc";

const SIZE_UNITS = ["B", "KB", "MB", "GB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded =
    unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${SIZE_UNITS[unit]}`;
}

export function totalBackupBytes(backups: BackupSummary[]): number {
  return backups.reduce(
    (total, backup) => total + Math.max(backup.size_bytes, 0),
    0,
  );
}

export function backupKindKey(kind: BackupSummary["kind"]): string {
  return `backup.kind.${kind}`;
}

export type BackupPage = {
  page: number;
  totalPages: number;
  rows: BackupSummary[];
};

export function paginateBackups(
  backups: BackupSummary[],
  page: number,
  perPage: number,
): BackupPage {
  const size = Math.max(perPage, 1);
  const totalPages = Math.max(Math.ceil(backups.length / size), 1);
  const current = Math.min(Math.max(page, 0), totalPages - 1);
  return {
    page: current,
    totalPages,
    rows: backups.slice(current * size, (current + 1) * size),
  };
}
