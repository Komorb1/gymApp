import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ArrowLeft, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useMember, useMemberFlags } from "@/hooks/useMembers";
import {
  useMemberSubscriptions,
  useRenewSubscription,
  useUnfreezeSubscription,
  useCancelSubscription,
} from "@/hooks/useSubscriptions";
import { useNavStore } from "@/stores/nav";
import {
  formatDate,
  formatPrice,
  fullName,
  isExpired,
  memberPhotoUrl,
} from "@/lib/format";
import { SubscribeDialog } from "@/features/subscriptions/SubscribeDialog";
import { EditMembershipDialog } from "@/features/subscriptions/EditMembershipDialog";
import { MemberForm } from "./MemberForm";
import type { Subscription } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

const flagLabels: Record<string, string> = {
  medical: "Medical",
  vip: "VIP",
  owes_money: "Owes Money",
  no_renewal: "No Renewal",
  guest: "Guest",
  staff: "Staff",
};

const SUBS_PER_PAGE = 5;

export function MemberProfile() {
  const { t } = useTranslation();
  const memberId = useNavStore((s) => s.memberId);
  const navigate = useNavStore((s) => s.navigate);
  const { data: member, isLoading } = useMember(memberId);
  const { data: flags = [] } = useMemberFlags(memberId);
  const { data: subs = [] } = useMemberSubscriptions(memberId);
  const renewMut = useRenewSubscription();
  const unfreezeMut = useUnfreezeSubscription();
  const cancelMut = useCancelSubscription();
  const isManagement = useAuthStore(
    (state) => state.user?.access_level === "management",
  );

  const [showSubscribe, setShowSubscribe] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [subPage, setSubPage] = useState(0);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const [editSubscription, setEditSubscription] = useState<Subscription | null>(
    null,
  );

  if (isLoading || !member) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground font-cairo">
          {t("common.loading")}
        </p>
      </div>
    );
  }

  const photoUrl = memberPhotoUrl(member.photo_path);
  const totalPages = Math.ceil(subs.length / SUBS_PER_PAGE);
  const pagedSubs = subs.slice(
    subPage * SUBS_PER_PAGE,
    (subPage + 1) * SUBS_PER_PAGE,
  );

  const confirmCancel = () => {
    if (cancelTarget) {
      cancelMut.mutate(cancelTarget.id);
      setCancelTarget(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("members")}
        className="font-cairo"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("common.back")}
      </Button>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            {photoUrl ? (
              <button
                onClick={() => setShowPhoto(true)}
                className="w-20 h-20 rounded-full overflow-hidden hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background transition-all shrink-0"
                title={t("members.photo")}
              >
                <img
                  src={photoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </button>
            ) : (
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-2xl font-semibold text-muted-foreground shrink-0">
                {member.first_name[0]?.toUpperCase()}
                {member.last_name[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-xl font-semibold font-cairo">
                {fullName(member)}
              </h2>
              <p className="text-sm text-muted-foreground font-cairo">
                {t("members.title")} — {formatDate(member.created_at)}
              </p>
              {flags.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {flags.map((f) => (
                    <Badge
                      key={f.id}
                      variant={f.flag === "vip" ? "default" : "warning"}
                      className="font-cairo"
                    >
                      {flagLabels[f.flag] ?? f.flag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowEdit(true)}
              className="font-cairo"
            >
              <Pencil className="w-4 h-4" />
              {t("common.edit")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="font-cairo">
            {t("members.title")}
          </TabsTrigger>
          <TabsTrigger value="subs" className="font-cairo">
            {t("subscriptions.title")} ({subs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground font-cairo">
                  {t("members.phone")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={`https://wa.me/${member.phone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-cairo text-primary hover:underline"
                >
                  {member.phone}
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground font-cairo">
                  {t("members.idNumber")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-cairo">{member.id_number ?? "—"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground font-cairo">
                  {t("members.email")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-cairo">{member.email ?? "—"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground font-cairo">
                  {t("members.birthDate")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-cairo">{formatDate(member.birth_date)}</p>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground font-cairo">
                  {t("members.notes")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-cairo whitespace-pre-wrap">
                  {member.notes ?? "—"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground font-cairo">
                  {t("common.created")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-cairo">{formatDate(member.created_at)}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subs">
          <div className="space-y-3">
            <Button
              onClick={() => setShowSubscribe(true)}
              className="font-cairo"
            >
              <Plus className="w-4 h-4" />
              {t("subscriptions.subscribe")}
            </Button>

            {subs.length === 0 ? (
              <p className="text-sm text-muted-foreground font-cairo py-6 text-center">
                {t("subscriptions.noActiveSubs")}
              </p>
            ) : (
              <>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                          {t("subscriptions.plan")}
                        </th>
                        <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                          {t("subscriptions.startDate")}
                        </th>
                        <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                          {t("subscriptions.endDate")}
                        </th>
                        <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                          {t("subscriptions.payment")}
                        </th>
                        <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                          {t("subscriptions.notes")}
                        </th>
                        <th className="text-end font-medium text-muted-foreground p-3 font-cairo">
                          {t("common.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSubs.map((s) => {
                        return (
                          <tr
                            key={s.id}
                            className="border-t border-border hover:bg-muted/20 transition-colors"
                          >
                            <td className="p-3 font-cairo">
                              {s.plan_snapshot.name}
                            </td>
                            <td className="p-3 font-cairo text-muted-foreground">
                              {formatDate(s.start_date)}
                            </td>
                            <td className="p-3 font-cairo text-muted-foreground">
                              {formatDate(s.end_date)}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <Badge
                                  variant={
                                    s.status === "active" &&
                                    !isExpired(s.end_date)
                                      ? "success"
                                      : s.status === "frozen"
                                        ? "warning"
                                        : "destructive"
                                  }
                                  className="font-cairo"
                                >
                                  {isExpired(s.end_date) &&
                                  s.status === "active"
                                    ? t("subscriptions.expired")
                                    : t(`subscriptions.${s.status}`)}
                                </Badge>
                                <Badge
                                  variant={
                                    s.is_paid ? "success" : "destructive"
                                  }
                                  className="font-cairo"
                                >
                                  {t(
                                    `subscriptions.${s.is_paid ? "paid" : "unpaid"}`,
                                  )}
                                </Badge>
                                <Badge
                                  variant={
                                    s.discount_percent > 0
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="font-cairo"
                                >
                                  {t("subscriptions.discount")}{" "}
                                  {s.discount_percent}% ·{" "}
                                  {formatPrice(s.paid_amount_cents)}
                                </Badge>
                              </div>
                            </td>
                            <td className="p-3 font-cairo text-muted-foreground max-w-36 truncate">
                              {s.notes ?? "—"}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-end gap-1 flex-wrap">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditSubscription(s)}
                                  className="font-cairo"
                                >
                                  {t("common.edit")}
                                </Button>
                                {s.status === "frozen" ? (
                                  isManagement ? (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => unfreezeMut.mutate(s.id)}
                                      className="font-cairo"
                                    >
                                      {t("subscriptions.unfreeze")}
                                    </Button>
                                  ) : null
                                ) : s.status !== "cancelled" ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        renewMut.mutate({
                                          subscription_id: s.id,
                                          plan_id: s.plan_id,
                                          discount_percent: s.discount_percent,
                                          is_paid: s.is_paid,
                                          notes: null,
                                        })
                                      }
                                      disabled={renewMut.isPending}
                                      className="font-cairo"
                                    >
                                      {t("subscriptions.renew")}
                                    </Button>
                                    {isManagement && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCancelTarget(s)}
                                        className="font-cairo text-destructive hover:text-destructive"
                                      >
                                        {t("subscriptions.cancel")}
                                      </Button>
                                    )}
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubPage((p) => Math.max(0, p - 1))}
                      disabled={subPage === 0}
                      className="font-cairo"
                    >
                      {t("common.prev")}
                    </Button>
                    <span className="text-sm text-muted-foreground font-cairo">
                      {t("common.page")} {subPage + 1} {t("common.of")}{" "}
                      {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSubPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={subPage >= totalPages - 1}
                      className="font-cairo"
                    >
                      {t("common.next")}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {showSubscribe && (
        <SubscribeDialog
          member={member}
          onClose={() => setShowSubscribe(false)}
        />
      )}
      {showEdit && (
        <MemberForm member={member} onClose={() => setShowEdit(false)} />
      )}
      {editSubscription && (
        <EditMembershipDialog
          subscription={editSubscription}
          onClose={() => setEditSubscription(null)}
        />
      )}

      <Dialog
        open={!!cancelTarget}
        onOpenChange={(v) => !v && setCancelTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {t("subscriptions.cancel")}
            </DialogTitle>
            <DialogDescription className="font-cairo">
              {t("subscriptions.cancelConfirm")}
            </DialogDescription>
          </DialogHeader>
          {cancelTarget && (
            <p className="text-sm font-cairo p-2 rounded-md bg-muted">
              {cancelTarget.plan_snapshot.name} —{" "}
              {formatDate(cancelTarget.end_date)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelTarget(null)}
              className="font-cairo"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={cancelMut.isPending}
              className="font-cairo"
            >
              {t("subscriptions.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPhoto} onOpenChange={setShowPhoto}>
        <DialogContent className="max-w-md p-2">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="font-cairo text-center">
              {fullName(member)}
            </DialogTitle>
          </DialogHeader>
          {photoUrl && (
            <img
              src={photoUrl}
              alt={fullName(member)}
              className="w-full max-h-[60vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
