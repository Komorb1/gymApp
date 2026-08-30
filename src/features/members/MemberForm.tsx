import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { memberSchema, type MemberFormData } from "@/lib/validation";
import { memberPhotoUrl } from "@/lib/format";
import {
  useCreateMember,
  useUpdateMember,
  useSavePhoto,
} from "@/hooks/useMembers";
import type { Member } from "@/lib/ipc";

interface MemberFormProps {
  member: Member | null;
  onClose: () => void;
}

export function MemberForm({ member, onClose }: MemberFormProps) {
  const { t } = useTranslation();
  const isEdit = !!member;
  const createMut = useCreateMember();
  const updateMut = useUpdateMember();
  const savePhotoMut = useSavePhoto();

  const [photoSource, setPhotoSource] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
  });

  useEffect(() => {
    if (member) {
      reset({
        first_name: member.first_name,
        middle_name: member.middle_name ?? "",
        last_name: member.last_name,
        id_number: member.id_number ?? "",
        phone: member.phone,
        email: member.email ?? "",
        birth_date: member.birth_date ?? "",
        notes: member.notes ?? "",
      });
    } else {
      reset({
        first_name: "",
        middle_name: "",
        last_name: "",
        id_number: "",
        phone: "",
        email: "",
        birth_date: "",
        notes: "",
      });
    }
  }, [member, reset]);

  const photoPath = member?.photo_path ?? null;

  const pickPhoto = async () => {
    try {
      const selected = await openDialog({
        filters: [
          { name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] },
        ],
      });
      if (selected) {
        setPhotoSource(selected as string);
      }
    } catch {
      // dialog cancelled
    }
  };

  const onSubmit = async (data: MemberFormData) => {
    setSaveError("");
    try {
      let savedMember: Member;

      if (isEdit && member) {
        savedMember = await updateMut.mutateAsync({
          id: member.id,
          first_name: data.first_name,
          middle_name: data.middle_name || null,
          last_name: data.last_name,
          id_number: data.id_number || null,
          phone: data.phone,
          email: data.email || null,
          birth_date: data.birth_date || null,
          notes: data.notes || null,
        });
      } else {
        savedMember = await createMut.mutateAsync({
          first_name: data.first_name,
          middle_name: data.middle_name || null,
          last_name: data.last_name,
          id_number: data.id_number || null,
          phone: data.phone,
          email: data.email || null,
          birth_date: data.birth_date || null,
          notes: data.notes || null,
        });
      }

      if (photoSource) {
        const photoPath = await savePhotoMut.mutateAsync({
          sourcePath: photoSource,
          memberId: savedMember.id,
        });
        await updateMut.mutateAsync({
          id: savedMember.id,
          photo_path: photoPath,
        });
      }

      onClose();
    } catch (err) {
      setSaveError(String(err));
    }
  };

  const isPending =
    createMut.isPending || updateMut.isPending || savePhotoMut.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-cairo">
            {isEdit ? t("common.edit") : t("members.newMember")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
              {photoSource ? (
                <img
                  src={memberPhotoUrl(photoSource) ?? photoSource}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : photoPath ? (
                <img
                  src={memberPhotoUrl(photoPath) ?? ""}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <Upload className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={pickPhoto}
              className="font-cairo"
            >
              <Upload className="w-4 h-4" />
              {t("members.photo")}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="font-cairo">{t("members.firstName")}</Label>
              <Input {...register("first_name")} className="font-cairo" />
              {errors.first_name && (
                <p className="text-xs text-destructive font-cairo">
                  {errors.first_name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">{t("members.middleName")}</Label>
              <Input {...register("middle_name")} className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">{t("members.lastName")}</Label>
              <Input {...register("last_name")} className="font-cairo" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">{t("members.phone")}</Label>
            <Input {...register("phone")} className="font-cairo" />
            <p className="text-xs text-muted-foreground font-cairo">
              {t("members.phoneIsWhatsapp")}
            </p>
            {errors.phone && (
              <p className="text-xs text-destructive font-cairo">
                {errors.phone.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="font-cairo">{t("members.idNumber")}</Label>
              <Input {...register("id_number")} className="font-cairo" />
            </div>
            <div className="space-y-2">
              <Label className="font-cairo">{t("members.email")}</Label>
              <Input
                {...register("email")}
                type="email"
                className="font-cairo"
              />
              {errors.email && (
                <p className="text-xs text-destructive font-cairo">
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">{t("members.birthDate")}</Label>
            <Input
              {...register("birth_date")}
              type="date"
              className="font-cairo"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">{t("members.notes")}</Label>
            <textarea
              {...register("notes")}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-cairo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {saveError && (
            <p className="text-sm text-destructive font-cairo">{saveError}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="font-cairo"
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isPending} className="font-cairo">
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
