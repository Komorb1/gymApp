import { describe, expect, it } from "vitest";

import {
  backupKindKey,
  formatBytes,
  paginateBackups,
  totalBackupBytes,
} from "./backupView";
import type { BackupSummary } from "./ipc";

const backup = (sizeBytes: number): BackupSummary => ({
  path: `/backups/backup-13-10-2026`,
  name: "backup-13-10-2026",
  kind: "scheduled",
  created_at: "2026-10-13T17:00:00Z",
  app_version: "0.1.7",
  members: 42,
  memberships: 51,
  size_bytes: sizeBytes,
});

describe("backup sizes", () => {
  it("formats byte counts the way the desk reads them", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(-5)).toBe("0 KB");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(12_345_678)).toBe("12 MB");
    expect(formatBytes(1_500_000)).toBe("1.4 MB");
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5 GB");
  });

  it("adds up what the backups occupy", () => {
    expect(totalBackupBytes([backup(1024), backup(2048)])).toBe(3072);
    expect(totalBackupBytes([])).toBe(0);
  });

  it("maps a backup kind to its translation key", () => {
    expect(backupKindKey("scheduled")).toBe("backup.kind.scheduled");
    expect(backupKindKey("manual")).toBe("backup.kind.manual");
    expect(backupKindKey("safety")).toBe("backup.kind.safety");
  });
});

describe("backup list paging", () => {
  const many = Array.from({ length: 25 }, (_, index) =>
    backup(1024 * (index + 1)),
  );

  it("keeps a long list to one page worth of rows", () => {
    const first = paginateBackups(many, 0, 10);
    expect(first.totalPages).toBe(3);
    expect(first.rows).toHaveLength(10);
    expect(first.rows[0].size_bytes).toBe(1024);

    const last = paginateBackups(many, 2, 10);
    expect(last.rows).toHaveLength(5);
  });

  it("never points past the end of a list that shrank", () => {
    const page = paginateBackups(many.slice(0, 4), 7, 10);
    expect(page.page).toBe(0);
    expect(page.totalPages).toBe(1);
    expect(page.rows).toHaveLength(4);
  });

  it("reports a single empty page for no backups", () => {
    const page = paginateBackups([], 0, 10);
    expect(page.page).toBe(0);
    expect(page.totalPages).toBe(1);
    expect(page.rows).toEqual([]);
  });
});
