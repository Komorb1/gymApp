import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateSubscription } from "@/hooks/useSubscriptions";
import { usePlans } from "@/hooks/usePlans";
import { formatMoney, fullName, isExpired, currencySymbol } from "@/lib/format";
import {
  discountedPriceCents,
  membershipMember,
  membershipPlanPriceCents,
} from "@/lib/subscriptionView";
import type { PaymentMethod, Subscription } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";
import { PaymentMethodPicker } from "./PaymentMethodField";

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    subscription.payment_method,
  );
  const [notes, setNotes] = useState(subscription.notes ?? "");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
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
  const unpaidAmountCents = Math.max(finalPriceCents - paidAmountCents, 0);
  const needsConfirmation =
    subscription.status === "cancelled" || isExpired(subscription.end_date);

  const saveMembership = () => {
    updateMembership.mutate(
      {
        subscription_id: subscription.id,
        plan_id: Number(planId),
        start_date: startDate,
        end_date: endDate,
        discount_percent: Number(discountPercent),
        paid_amount_cents: paidAmountCents,
        payment_method: paymentMethod,
        notes: notes || null,
      },
      {
        onSuccess: onClose,
        onError: (mutationError) => setError(String(mutationError)),
      },
    );
  };

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
    if (needsConfirmation && !confirming) {
      setConfirming(true);
      return;
    }
    saveMembership();
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
            {fullName(membershipMember(subscription))}
          </p>
          <div className="space-y-2">
            <Label className="font-cairo">{t("subscriptions.plan")}</Label>
            <div className="max-h-44 space-y-1 overflow-y-auto pe-1">
              {!plans.some((plan) => plan.id === subscription.plan_id) && (
                <button
                  type="button"
                  onClick={() => setPlanId(String(subscription.plan_id))}
                  className={`w-full flex items-center justify-between p-2 rounded-md border transition-colors font-cairo ${
                    Number(planId) === subscription.plan_id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span>{subscription.plan_snapshot.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {subscription.plan_snapshot.duration_days}d ·{" "}
                    {formatMoney(subscription.plan_snapshot.price_cents)}
                  </span>
                </button>
              )}
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanId(String(plan.id))}
                  className={`w-full flex items-center justify-between p-2 rounded-md border transition-colors font-cairo ${
                    Number(planId) === plan.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span>{plan.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {plan.id === subscription.plan_id
                      ? subscription.plan_snapshot.duration_days
                      : plan.duration_days}
                    d ·{" "}
                    {formatMoney(
                      plan.id === subscription.plan_id
                        ? subscription.plan_snapshot.price_cents
                        : plan.price_cents,
                    )}
                  </span>
                </button>
              ))}
            </div>
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
            <div className="relative flex items-center">
              <Input
                type="number"
                min={0}
                max={finalPriceCents / 100}
                step="0.01"
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                className="pe-14 font-cairo"
              />
              <span className="pointer-events-none absolute end-3 text-sm text-muted-foreground font-cairo">
                {currencySymbol()}
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-cairo">
              {t("subscriptions.unpaidAmount")}:{" "}
              {formatMoney(unpaidAmountCents)}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="font-cairo">
              {t("subscriptions.paymentMethod")}
            </Label>
            <PaymentMethodPicker
              value={paymentMethod}
              onChange={setPaymentMethod}
              allowUnset
            />
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

      {confirming && (
        <Dialog open onOpenChange={() => setConfirming(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-cairo">
                {t("subscriptions.confirmEditTitle")}
              </DialogTitle>
              <DialogDescription className="font-cairo">
                {t("subscriptions.confirmEditWarning")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
                className="font-cairo"
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={saveMembership}
                disabled={updateMembership.isPending}
                className="font-cairo"
              >
                {updateMembership.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
