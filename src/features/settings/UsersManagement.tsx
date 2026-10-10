import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, UserPlus, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  type AccessLevel,
  type User,
} from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

export function UsersManagement() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const actorId = useAuthStore((s) => s.user?.id ?? 0);
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users", sessionToken],
    queryFn: () => listUsers(sessionToken),
    enabled: !!sessionToken,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formAccessLevel, setFormAccessLevel] = useState<AccessLevel>("staff");
  const [formError, setFormError] = useState("");

  const createMut = useMutation({
    mutationFn: ({
      username,
      password,
      accessLevel,
    }: {
      username: string;
      password: string;
      accessLevel: AccessLevel;
    }) => createUser(sessionToken, username, password, accessLevel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowAdd(false);
      setFormUsername("");
      setFormPassword("");
      setFormAccessLevel("staff");
      setFormError("");
    },
    onError: (err) => setFormError(String(err)),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      username,
      password,
      is_active,
      access_level,
    }: {
      id: number;
      username?: string;
      password?: string;
      is_active?: boolean;
      access_level?: AccessLevel;
    }) =>
      updateUser(sessionToken, {
        id,
        username,
        password,
        is_active,
        access_level,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditUser(null);
      setFormUsername("");
      setFormPassword("");
      setFormError("");
    },
    onError: (err) => setFormError(String(err)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteUser(sessionToken, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditUser(null);
      setFormError("");
    },
    onError: (err) => setFormError(String(err)),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!formUsername.trim()) {
      setFormError(t("auth.username") + " — required");
      return;
    }
    if (!formPassword) {
      setFormError(t("auth.passwordRequired"));
      return;
    }
    createMut.mutate({
      username: formUsername.trim(),
      password: formPassword,
      accessLevel: formAccessLevel,
    });
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!editUser) return;
    if (!formUsername.trim()) {
      setFormError(t("auth.username") + " — required");
      return;
    }
    updateMut.mutate({
      id: editUser.id,
      username: formUsername.trim(),
      password: formPassword || undefined,
      access_level: formAccessLevel,
    });
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setFormUsername(u.username);
    setFormPassword("");
    setFormAccessLevel(u.access_level);
    setFormError("");
  };

  useEffect(() => {
    if (showAdd) {
      setFormUsername("");
      setFormPassword("");
      setFormAccessLevel("staff");
      setFormError("");
    }
  }, [showAdd]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-cairo font-semibold">{t("settings.users")}</h3>
        <Button
          size="sm"
          onClick={() => setShowAdd(true)}
          className="font-cairo"
        >
          <UserPlus className="w-4 h-4" />
          {t("settings.addUser")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground font-cairo">
          {t("common.loading")}
        </p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-start">
                <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                  {t("auth.username")}
                </th>
                <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                  {t("settings.accessLevel")}
                </th>
                <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                  {t("members.status")}
                </th>
                <th className="text-end font-medium text-muted-foreground p-3 font-cairo">
                  {t("common.edit")}
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-t border-border ${u.id === actorId ? "bg-primary/5" : ""}`}
                >
                  <td className="p-3 font-cairo font-medium">
                    <div className="flex items-center gap-2">
                      {u.username}
                      {u.id === actorId && (
                        <Badge variant="default" className="font-cairo text-xs">
                          {t("settings.you")}
                        </Badge>
                      )}
                      {u.is_owner && (
                        <Badge
                          variant="secondary"
                          className="font-cairo text-xs"
                        >
                          {t("settings.owner")}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary" className="font-cairo">
                      {t(`settings.${u.access_level}`)}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={u.is_active ? "success" : "secondary"}
                      className="font-cairo"
                    >
                      {u.is_active
                        ? t("members.active")
                        : t("members.inactive")}
                    </Badge>
                  </td>
                  <td className="p-3 text-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(u)}
                      aria-label={t("common.edit")}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {t("settings.addUser")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-cairo">{t("auth.username")}</Label>
              <Input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                className="font-cairo"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">{t("auth.password")}</Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="font-cairo"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">{t("settings.accessLevel")}</Label>
              <select
                value={formAccessLevel}
                onChange={(event) =>
                  setFormAccessLevel(event.target.value as AccessLevel)
                }
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-cairo"
              >
                <option value="staff">{t("settings.staff")}</option>
                <option value="management">{t("settings.management")}</option>
              </select>
            </div>
            {formError && (
              <p className="text-sm text-destructive font-cairo">{formError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAdd(false)}
                className="font-cairo"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending}
                className="font-cairo"
              >
                {createMut.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-cairo">{t("common.edit")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label className="font-cairo">{t("auth.username")}</Label>
              <Input
                value={formUsername}
                onChange={(e) => setFormUsername(e.target.value)}
                className="font-cairo"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">
                {t("settings.changePassword")}
              </Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={t("settings.keepPassword")}
                className="font-cairo"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">{t("settings.accessLevel")}</Label>
              <select
                value={formAccessLevel}
                disabled={editUser?.is_owner}
                onChange={(event) =>
                  setFormAccessLevel(event.target.value as AccessLevel)
                }
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-cairo"
              >
                <option value="staff">{t("settings.staff")}</option>
                <option value="management">{t("settings.management")}</option>
              </select>
            </div>
            {editUser && !editUser.is_owner && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={editUser.is_active ? "destructive" : "default"}
                  size="sm"
                  className="font-cairo"
                  onClick={() =>
                    updateMut.mutate({
                      id: editUser.id,
                      is_active: !editUser.is_active,
                    })
                  }
                >
                  {editUser.is_active
                    ? t("members.inactive")
                    : t("members.active")}
                </Button>
                {editUser.access_level === "staff" && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="font-cairo"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (window.confirm(t("settings.deleteUserConfirm"))) {
                        deleteMut.mutate(editUser.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    {t("common.delete")}
                  </Button>
                )}
              </div>
            )}
            {formError && (
              <p className="text-sm text-destructive font-cairo">{formError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditUser(null)}
                className="font-cairo"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={updateMut.isPending}
                className="font-cairo"
              >
                {updateMut.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
