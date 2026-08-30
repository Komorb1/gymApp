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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateSubscription } from "@/hooks/useSubscriptions";
import { formatPrice, fullName, priceToCents } from "@/lib/format";
import type { Subscription } from "@/lib/ipc";

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
  const [paidAmount, setPaidAmount] = useState(
    formatPrice(subscription.paid_amount_cents),
  );
  const [notes, setNotes] = useState(subscription.notes ?? "");
  const [error, setError] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    updateMembership.mutate(
      {
        subscription_id: subscription.id,
        paid_amount_cents: priceToCents(paidAmount),
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-cairo">
            {t("subscriptions.editMembership")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-md bg-muted p-2 text-sm font-cairo">
            {fullName(subscription.member_snapshot)} —{" "}
            {subscription.plan_snapshot.name}
          </p>
          <div className="space-y-2">
            <Label className="font-cairo">
              {t("subscriptions.paidAmount")}
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={paidAmount}
              onChange={(event) => setPaidAmount(event.target.value)}
              className="font-cairo"
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
    </Dialog>
  );
}
