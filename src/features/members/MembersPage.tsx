import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search, Pencil, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMembers, useDeleteMember } from "@/hooks/useMembers";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useNavStore } from "@/stores/nav";
import { memberPhotoUrl, formatDate, fullName } from "@/lib/format";
import type { Member } from "@/lib/ipc";
import { MemberForm } from "./MemberForm";

export function MembersPage() {
  const { t } = useTranslation();
  const navigate = useNavStore((s) => s.navigate);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: members = [], isLoading } = useMembers(debouncedSearch);
  const deleteMut = useDeleteMember();

  const [showForm, setShowForm] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const openEdit = (e: React.MouseEvent, m: Member) => {
    e.stopPropagation();
    setEditMember(m);
    setShowForm(true);
  };

  const openDelete = (e: React.MouseEvent, m: Member) => {
    e.stopPropagation();
    setDeleteTarget(m);
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("members.searchPlaceholder")}
            className="ps-10 font-cairo"
          />
        </div>
        <Button
          onClick={() => {
            setEditMember(null);
            setShowForm(true);
          }}
          className="font-cairo"
        >
          <Plus className="w-4 h-4" />
          {t("members.newMember")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-lg bg-muted animate-pulse"
            />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <User className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground font-cairo">{t("members.empty")}</p>
          <Button
            variant="outline"
            className="mt-3 font-cairo"
            onClick={() => {
              setEditMember(null);
              setShowForm(true);
            }}
          >
            {t("members.emptyCta")}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                  {t("members.firstName")} / {t("members.lastName")}
                </th>
                <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                  {t("members.phone")}
                </th>
                <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                  {t("members.email")}
                </th>
                <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                  {t("common.created")}
                </th>
                <th className="text-end font-medium text-muted-foreground p-3 font-cairo">
                  {t("common.edit")}
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate("member-profile", m.id)}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {memberPhotoUrl(m.photo_path) ? (
                        <img
                          src={memberPhotoUrl(m.photo_path)!}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-semibold">
                          {m.first_name[0]?.toUpperCase()}
                          {m.last_name[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="font-cairo font-medium">
                        {fullName(m)}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 font-cairo text-muted-foreground">
                    {m.phone ?? "—"}
                  </td>
                  <td className="p-3 font-cairo text-muted-foreground">
                    {m.email ?? "—"}
                  </td>
                  <td className="p-3 font-cairo text-muted-foreground">
                    {formatDate(m.created_at)}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => openEdit(e, m)}
                        aria-label={t("common.edit")}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => openDelete(e, m)}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <MemberForm
          member={editMember}
          onClose={() => {
            setShowForm(false);
            setEditMember(null);
          }}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-cairo">{t("common.delete")}</DialogTitle>
            <DialogDescription className="font-cairo">
              {deleteTarget && fullName(deleteTarget)}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="font-cairo"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMut.isPending}
              className="font-cairo"
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
