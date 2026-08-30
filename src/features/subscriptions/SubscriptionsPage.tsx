import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useSubscriptions,
  useRenewSubscription,
  useUnfreezeSubscription,
  useCancelSubscription,
} from "@/hooks/useSubscriptions";
import { useMembers } from "@/hooks/useMembers";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  formatDate,
  formatPrice,
  fullName,
  isExpired,
  isExpiringSoon,
  memberPhotoUrl,
  paymentStatus,
} from "@/lib/format";
import type { Member, Subscription } from "@/lib/ipc";
import { SubscribeDialog } from "./SubscribeDialog";
import { FreezeDialog } from "./FreezeDialog";
import { EditMembershipDialog } from "./EditMembershipDialog";
import { useAuthStore } from "@/stores/auth";

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const { data: subs = [], isLoading } = useSubscriptions();
  const renewMut = useRenewSubscription();
  const unfreezeMut = useUnfreezeSubscription();
  const cancelMut = useCancelSubscription();
  const isManagement = useAuthStore(
    (state) => state.user?.access_level === "management",
  );

  const [subscribeMember, setSubscribeMember] = useState<Member | null>(null);
  const [freezeTarget, setFreezeTarget] = useState<Subscription | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null);
  const [editTarget, setEditTarget] = useState<Subscription | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const debounced = useDebouncedValue(pickerSearch, 300);
  const { data: pickerMembers = [] } = useMembers(debounced);

  const buckets = useMemo(() => {
    const active: Subscription[] = [];
    const expiring: Subscription[] = [];
    const expired: Subscription[] = [];
    const frozen: Subscription[] = [];
    for (const s of subs) {
      if (s.status === "cancelled") continue;
      if (s.status === "frozen") {
        frozen.push(s);
      } else if (isExpired(s.end_date)) {
        expired.push(s);
      } else if (isExpiringSoon(s.end_date, 7)) {
        expiring.push(s);
        active.push(s);
      } else {
        active.push(s);
      }
    }
    return { active, expiring, expired, frozen };
  }, [subs]);

  const handleRenew = (s: Subscription) => {
    renewMut.mutate({
      subscription_id: s.id,
      plan_id: s.plan_id,
      paid_amount_cents: s.plan_snapshot.price_cents,
      notes: null,
    });
  };

  const confirmCancel = () => {
    if (cancelTarget) {
      cancelMut.mutate(cancelTarget.id);
      setCancelTarget(null);
    }
  };

  const renderRow = (s: Subscription) => {
    const payment = paymentStatus(
      s.paid_amount_cents,
      s.plan_snapshot.price_cents,
    );
    return (
      <tr
        key={s.id}
        className="border-t border-border hover:bg-muted/20 transition-colors"
      >
        <td className="p-3">
          <div className="flex items-center gap-3">
            {memberPhotoUrl(s.member_snapshot.photo_path) ? (
              <img
                src={memberPhotoUrl(s.member_snapshot.photo_path)!}
                alt=""
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                {s.member_snapshot.first_name[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <span className="font-cairo font-medium">
                {fullName(s.member_snapshot)}
              </span>
              <p className="text-xs text-muted-foreground font-cairo">
                {s.member_snapshot.phone}
                {s.member_snapshot.whatsapp_no
                  ? ` · ${s.member_snapshot.whatsapp_no}`
                  : ""}
                {s.member_snapshot.id_number
                  ? ` · ${s.member_snapshot.id_number}`
                  : ""}
              </p>
            </div>
          </div>
        </td>
        <td className="p-3 font-cairo text-muted-foreground">
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
                s.status === "active" && !isExpired(s.end_date)
                  ? "success"
                  : s.status === "frozen"
                    ? "warning"
                    : "destructive"
              }
              className="font-cairo"
            >
              {isExpired(s.end_date) && s.status === "active"
                ? t("subscriptions.expired")
                : t(`subscriptions.${s.status}`)}
            </Badge>
            <Badge
              variant={payment === "paid" ? "default" : "secondary"}
              className="font-cairo"
            >
              {t(`subscriptions.${payment}`)} ·{" "}
              {formatPrice(s.paid_amount_cents)}
            </Badge>
          </div>
        </td>
        <td className="p-3 font-cairo text-muted-foreground max-w-40 truncate">
          {s.notes ?? "—"}
        </td>
        <td className="p-3">
          <div className="flex items-center justify-end gap-1 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditTarget(s)}
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
                {isManagement && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFreezeTarget(s)}
                    className="font-cairo"
                  >
                    {t("subscriptions.freeze")}
                  </Button>
                )}
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleRenew(s)}
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
  };

  const Table = ({ rows }: { rows: Subscription[] }) => (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
              {t("subscriptions.member")}
            </th>
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
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="p-6 text-center text-muted-foreground font-cairo"
              >
                {t("subscriptions.noActiveSubs")}
              </td>
            </tr>
          ) : (
            rows.map(renderRow)
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold font-cairo">
          {t("subscriptions.title")}
        </h2>
        <Button
          onClick={() => {
            setPickerSearch("");
            setShowPicker(true);
          }}
          className="font-cairo"
        >
          <Plus className="w-4 h-4" />
          {t("subscriptions.subscribe")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active" className="font-cairo">
              {t("subscriptions.tabs.active")} ({buckets.active.length})
            </TabsTrigger>
            <TabsTrigger value="expiring" className="font-cairo">
              {t("subscriptions.tabs.expiring")} ({buckets.expiring.length})
            </TabsTrigger>
            <TabsTrigger value="expired" className="font-cairo">
              {t("subscriptions.tabs.expired")} ({buckets.expired.length})
            </TabsTrigger>
            <TabsTrigger value="frozen" className="font-cairo">
              {t("subscriptions.tabs.frozen")} ({buckets.frozen.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Table rows={buckets.active} />
          </TabsContent>
          <TabsContent value="expiring">
            <Table rows={buckets.expiring} />
          </TabsContent>
          <TabsContent value="expired">
            <Table rows={buckets.expired} />
          </TabsContent>
          <TabsContent value="frozen">
            <Table rows={buckets.frozen} />
          </TabsContent>
        </Tabs>
      )}

      {subscribeMember && (
        <SubscribeDialog
          member={subscribeMember}
          onClose={() => setSubscribeMember(null)}
        />
      )}
      {freezeTarget && (
        <FreezeDialog
          subscription={freezeTarget}
          onClose={() => setFreezeTarget(null)}
        />
      )}
      {editTarget && (
        <EditMembershipDialog
          subscription={editTarget}
          onClose={() => setEditTarget(null)}
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
              {fullName(cancelTarget.member_snapshot)} —{" "}
              {cancelTarget.plan_snapshot.name}
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

      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-cairo">
              {t("subscriptions.subscribeMember")}
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              placeholder={t("members.searchPlaceholder")}
              className="ps-10 font-cairo"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-auto space-y-1">
            {pickerMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground font-cairo text-center py-4">
                {t("members.empty")}
              </p>
            ) : (
              pickerMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setShowPicker(false);
                    setSubscribeMember(m);
                  }}
                  className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors text-start"
                >
                  {memberPhotoUrl(m.photo_path) ? (
                    <img
                      src={memberPhotoUrl(m.photo_path)!}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                      {m.first_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="font-cairo font-medium">{fullName(m)}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
