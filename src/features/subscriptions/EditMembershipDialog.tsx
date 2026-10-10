import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateSubscription } from "@/hooks/useSubscriptions";
import { usePlans } from "@/hooks/usePlans";
import { formatMoney, fullName } from "@/lib/format";
import {
  discountedPriceCents,
  membershipPlanPriceCents,
} from "@/lib/subscriptionView";
import type { Subscription } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

interface EditMembershipDialogProps {
  subscription: Subscription;
  onClose: () => void;
}

export function EditMembershipDialog({
  subscription,
  onClose,
}: EditMembershipDialogProps) {
  const { t } = useTranslation();
  const updateMembership = useUpdateSubscription();
  const { data: plans = [] } = usePlans();
  const isStaff = useAuthStore((state) => state.user?.access_level === "staff");
  const [planId, setPlanId] = useState(String(subscription.plan_id));
  const [startDate, setStartDate] = useState(subscription.start_date);
  const [endDate, setEndDate] = useState(subscription.end_date);
  const [discountPercent, setDiscountPercent] = useState(
    String(subscription.discount_percent),
  );
  const [paidAmount, setPaidAmount] = useState(
    (subscription.paid_amount_cents / 100).toFixed(2),
  );
  const [notes, setNotes] = useState(subscription.notes ?? "");
  const [error, setError] = useState("");
  const planPriceCents = membershipPlanPriceCents(
    subscription,
    plans,
    Number(planId),
  );
  const finalPriceCents = discountedPriceCents(
    planPriceCents,
    Number(discountPercent || 0),
  );
  const paidAmountCents = Math.round(Number(paidAmount || 0) * 100);
  const balanceAmountCents = Math.max(finalPriceCents - paidAmountCents, 0);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (
      !Number.isFinite(paidAmountCents) ||
      paidAmountCents < 0 ||
      paidAmountCents > finalPriceCents
    ) {
      setError(t("subscriptions.invalidPaidAmount"));
      return;
    }
    updateMembership.mutate(
      {
        subscription_id: subscription.id,
        plan_id: Number(planId),
        start_date: startDate,
        end_date: endDate,
        discount_percent: Number(discountPercent),
        paid_amount_cents: paidAmountCents,
        notes: notes || null,
      },
      {
        onSuccess: onClose,
        onError: (mutationError) => setError(String(mutationError)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-cairo">
            {t("subscriptions.editMembership")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-md bg-muted p-2 text-sm font-cairo">
            {fullName(subscription.member_snapshot)}
          </p>
          <div className="space-y-2">
            <Label htmlFor="membership-plan" className="font-cairo">
              {t("subscriptions.plan")}
            </Label>
            <select
              id="membership-plan"
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-cairo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {!plans.some((plan) => plan.id === subscription.plan_id) && (
                <option value={subscription.plan_id}>
                  {subscription.plan_snapshot.name}
                </option>
              )}
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground font-cairo">
              {t("subscriptions.planPrice")}: {formatMoney(planPriceCents)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="membership-start" className="font-cairo">
                {t("subscriptions.startDate")}
              </Label>
              <DateInput
                id="membership-start"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="membership-end" className="font-cairo">
                {t("subscriptions.endDate")}
              </Label>
              <DateInput
                id="membership-end"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="font-cairo">
              {t("subscriptions.discountPercent")}
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="1"
              value={discountPercent}
              onChange={(event) => setDiscountPercent(event.target.value)}
              className="font-cairo"
            />
            <p className="text-sm text-muted-foreground font-cairo">
              {t("subscriptions.finalPrice")}: {formatMoney(finalPriceCents)}
            </p>
            {isStaff &&
              Number(discountPercent) > 0 &&
              (Number(discountPercent) !== subscription.discount_percent ||
                subscription.discount_approval_status === "pending") && (
                <p className="text-sm text-amber-600 dark:text-amber-400 font-cairo">
                  {t("subscriptions.discountPendingNotice")}
                </p>
              )}
          </div>
          <div className="space-y-2">
            <Label className="font-cairo">
              {t("subscriptions.paidAmount")}
            </Label>
            <Input
              type="number"
              min={0}
              max={finalPriceCents / 100}
              step="0.01"
              value={paidAmount}
              onChange={(event) => setPaidAmount(event.target.value)}
              className="font-cairo"
            />
            <p className="text-sm text-muted-foreground font-cairo">
              {t("subscriptions.balanceAmount")}:{" "}
              {formatMoney(balanceAmountCents)}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="font-cairo">{t("subscriptions.notes")}</Label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-cairo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive font-cairo">{error}</p>
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
            <Button
              type="submit"
              disabled={updateMembership.isPending}
              className="font-cairo"
            >
              {updateMembership.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
