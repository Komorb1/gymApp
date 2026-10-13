import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  Clock,
  DatabaseBackup,
  FolderOpen,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useBackupStatus,
  useBackups,
  useCreateBackup,
  useDeleteBackup,
  useRestartApp,
  useRestoreBackup,
  useUpdateBackupSettings,
} from "@/hooks/useBackup";
import {
  backupKindKey,
  formatBytes,
  paginateBackups,
  totalBackupBytes,
} from "@/lib/backupView";
import { formatDateTime } from "@/lib/format";
import type { BackupSummary } from "@/lib/ipc";

const BACKUPS_PER_PAGE = 10;

type PanelDialog =
  | { kind: "none" }
  | { kind: "restore"; backup: BackupSummary }
  | { kind: "delete"; backup: BackupSummary }
  | { kind: "restoring"; backup: BackupSummary; safety: string | null };

export function BackupPanel() {
  const { t } = useTranslation();
  const { data: status } = useBackupStatus();
  const { data: backups = [], isLoading } = useBackups();
  const createBackup = useCreateBackup();
  const updateSettings = useUpdateBackupSettings();
  const deleteBackup = useDeleteBackup();
  const restoreBackup = useRestoreBackup();
  const restartApp = useRestartApp();

  const [time, setTime] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<PanelDialog>({ kind: "none" });
  const [browseFolder, setBrowseFolder] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { data: browsed = [] } = useBackups(
    browseFolder,
    browseFolder !== null,
  );
  const {
    page: currentPage,
    totalPages,
    rows: pageRows,
  } = paginateBackups(backups, page, BACKUPS_PER_PAGE);

  useEffect(() => {
    if (status) setTime(status.time);
  }, [status]);

  const runBackupNow = () => {
    setError("");
    setMessage("");
    createBackup.mutate(undefined, {
      onSuccess: (created) =>
        setMessage(t("backup.created", { name: created.name })),
      onError: (mutationError) => setError(String(mutationError)),
    });
  };

  const applySettings = (
    input: Parameters<typeof updateSettings.mutate>[0],
  ) => {
    setError("");
    updateSettings.mutate(input, {
      onError: (mutationError) => setError(String(mutationError)),
    });
  };

  const chooseFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: t("backup.chooseFolder"),
    });
    if (typeof picked === "string") {
      applySettings({ folder: picked });
    }
  };

  const browseForBackup = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: t("backup.browseFolder"),
    });
    if (typeof picked === "string") {
      setError("");
      setBrowseFolder(picked);
    }
  };

  const confirmRestore = () => {
    if (dialog.kind !== "restore") return;
    const target = dialog.backup;
    setError("");
    restoreBackup.mutate(target.path, {
      onSuccess: (outcome) => {
        setDialog({
          kind: "restoring",
          backup: target,
          safety: outcome.safety_copy,
        });
        setTimeout(() => restartApp.mutate(), 1500);
      },
      onError: (mutationError) => {
        setError(String(mutationError));
        setDialog({ kind: "none" });
      },
    });
  };

  const confirmDelete = () => {
    if (dialog.kind !== "delete") return;
    const target = dialog.backup;
    setError("");
    deleteBackup.mutate(target.path, {
      onSuccess: () => setDialog({ kind: "none" }),
      onError: (mutationError) => {
        setError(String(mutationError));
        setDialog({ kind: "none" });
      },
    });
  };

  const renderActions = (backup: BackupSummary) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialog({ kind: "restore", backup })}
        className="font-cairo"
      >
        <RotateCcw className="w-4 h-4" />
        {t("backup.restore")}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDialog({ kind: "delete", backup })}
        aria-label={t("common.delete")}
      >
        <Trash2 className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );

  const renderBackupRow = (backup: BackupSummary) => (
    <tr key={backup.path} className="border-t border-border">
      <td className="p-3 font-cairo whitespace-nowrap">{backup.name}</td>
      <td className="p-3 font-cairo text-muted-foreground whitespace-nowrap">
        {formatDateTime(backup.created_at)}
      </td>
      <td className="p-3 font-cairo text-muted-foreground whitespace-nowrap">
        {t("backup.contains", {
          members: backup.members,
          memberships: backup.memberships,
        })}
      </td>
      <td className="p-3 font-cairo text-muted-foreground whitespace-nowrap">
        {formatBytes(backup.size_bytes)}
      </td>
      <td className="p-3">
        <Badge
          variant={backup.kind === "manual" ? "default" : "secondary"}
          className="font-cairo"
        >
          {t(backupKindKey(backup.kind))}
        </Badge>
      </td>
      <td className="p-3">
        <div className="flex items-center justify-end">
          {renderActions(backup)}
        </div>
      </td>
    </tr>
  );

  const renderTableHead = () => (
    <tr>
      <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
        {t("backup.name")}
      </th>
      <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
        {t("backup.taken")}
      </th>
      <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
        {t("backup.containsLabel")}
      </th>
      <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
        {t("backup.size")}
      </th>
      <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
        {t("backup.kindLabel")}
      </th>
      <th className="w-52 text-end font-medium text-muted-foreground p-3 font-cairo">
        {t("common.actions")}
      </th>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={runBackupNow}
          disabled={createBackup.isPending}
          className="font-cairo"
        >
          {createBackup.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <DatabaseBackup className="w-4 h-4" />
          )}
          {t("backup.backupNow")}
        </Button>
        <Button
          variant="outline"
          onClick={browseForBackup}
          className="font-cairo"
        >
          <FolderOpen className="w-4 h-4" />
          {t("backup.restoreFromFolder")}
        </Button>
      </div>

      {message && <p className="text-sm text-success font-cairo">{message}</p>}
      {error && <p className="text-sm text-destructive font-cairo">{error}</p>}

      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          <span className="font-cairo font-medium">
            {t("backup.automaticTitle")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              id="backup-enabled"
              type="checkbox"
              checked={status?.enabled ?? false}
              onChange={(event) =>
                applySettings({ enabled: event.target.checked })
              }
              className="h-4 w-4 accent-primary"
            />
            <Label htmlFor="backup-enabled" className="font-cairo">
              {t("backup.automaticEnabled")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <Label htmlFor="backup-time" className="font-cairo">
              {t("backup.time")}
            </Label>
            <Input
              id="backup-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              onBlur={() => {
                if (status && time && time !== status.time) {
                  applySettings({ time });
                }
              }}
              className="w-32 font-cairo"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="font-cairo">{t("backup.folder")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground font-cairo break-all">
              {status?.folder ?? "—"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={chooseFolder}
              className="font-cairo"
            >
              <FolderOpen className="w-4 h-4" />
              {t("backup.chooseFolder")}
            </Button>
            {status && !status.is_default_folder && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applySettings({ folder: "" })}
                className="font-cairo"
              >
                {t("backup.useDefaultFolder")}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-1 text-sm font-cairo text-muted-foreground">
          <p>
            {t("backup.lastBackup")}:{" "}
            {status?.last_backup_at
              ? formatDateTime(status.last_backup_at)
              : t("backup.never")}
          </p>
          {status?.enabled && (
            <p>
              {t("backup.nextBackup")}:{" "}
              {status.next_backup_at
                ? formatDateTime(status.next_backup_at)
                : "—"}
            </p>
          )}
          <p>{t("backup.keepNote", { count: status?.keep ?? 0 })}</p>
        </div>

        {status?.last_backup_error && (
          <p className="text-sm text-destructive font-cairo">
            {t("backup.lastError")}: {status.last_backup_error}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-cairo font-medium">{t("backup.listTitle")}</h3>
          <span className="text-xs text-muted-foreground font-cairo">
            {t("backup.totalSize")}: {formatBytes(totalBackupBytes(backups))}
          </span>
        </div>
        {isLoading ? (
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground font-cairo py-6 text-center">
            {t("backup.emptyList")}
          </p>
        ) : (
          <>
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[840px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  {renderTableHead()}
                </thead>
                <tbody>{pageRows.map(renderBackupRow)}</tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={currentPage === 0}
                  className="font-cairo"
                >
                  {t("common.prev")}
                </Button>
                <span className="text-sm text-muted-foreground font-cairo">
                  {t("common.page")} {currentPage + 1} {t("common.of")}{" "}
                  {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages - 1, current + 1))
                  }
                  disabled={currentPage >= totalPages - 1}
                  className="font-cairo"
                >
                  {t("common.next")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={dialog.kind === "restore"}
        onOpenChange={(value) => !value && setDialog({ kind: "none" })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {t("backup.restoreTitle")}
            </DialogTitle>
            <DialogDescription className="font-cairo">
              {t("backup.restoreWarning")}
            </DialogDescription>
          </DialogHeader>
          {dialog.kind === "restore" && (
            <div className="space-y-2 text-sm font-cairo">
              <p className="p-2 rounded-md bg-muted">
                {dialog.backup.name} —{" "}
                {formatDateTime(dialog.backup.created_at)}
              </p>
              <p className="text-muted-foreground">
                {t("backup.currentData")}:{" "}
                {t("backup.contains", {
                  members: status?.current_members ?? 0,
                  memberships: status?.current_memberships ?? 0,
                })}
              </p>
              <p className="text-muted-foreground">
                {t("backup.backupData")}:{" "}
                {t("backup.contains", {
                  members: dialog.backup.members,
                  memberships: dialog.backup.memberships,
                })}
              </p>
              <p className="text-muted-foreground">{t("backup.safetyNote")}</p>
              <p className="text-muted-foreground">{t("backup.restartNote")}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog({ kind: "none" })}
              className="font-cairo"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmRestore}
              disabled={restoreBackup.isPending}
              className="font-cairo"
            >
              {restoreBackup.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {t("backup.restore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog.kind === "delete"}
        onOpenChange={(value) => !value && setDialog({ kind: "none" })}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {t("backup.deleteTitle")}
            </DialogTitle>
            <DialogDescription className="font-cairo">
              {t("backup.deleteWarning")}
            </DialogDescription>
          </DialogHeader>
          {dialog.kind === "delete" && (
            <p className="text-sm font-cairo p-2 rounded-md bg-muted">
              {dialog.backup.name} — {formatDateTime(dialog.backup.created_at)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog({ kind: "none" })}
              className="font-cairo"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteBackup.isPending}
              className="font-cairo"
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={browseFolder !== null}
        onOpenChange={(value) => !value && setBrowseFolder(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {t("backup.browseTitle")}
            </DialogTitle>
            <DialogDescription className="font-cairo break-all">
              {browseFolder}
            </DialogDescription>
          </DialogHeader>
          {browsed.length === 0 ? (
            <p className="text-sm text-muted-foreground font-cairo py-6 text-center">
              {t("backup.browseEmpty")}
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  {renderTableHead()}
                </thead>
                <tbody>{browsed.map(renderBackupRow)}</tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBrowseFolder(null)}
              className="font-cairo"
            >
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.kind === "restoring"}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {t("backup.restoringTitle")}
            </DialogTitle>
            <DialogDescription className="font-cairo">
              {t("backup.restoringMessage")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 text-sm font-cairo">
            <Loader2 className="w-4 h-4 animate-spin" />
            {dialog.kind === "restoring" && dialog.safety
              ? t("backup.safetySaved", { name: dialog.safety })
              : t("common.loading")}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
