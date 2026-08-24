import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

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
import { usePlans } from "@/hooks/usePlans";
import { useCreateSubscription } from "@/hooks/useSubscriptions";
import { formatPrice } from "@/lib/format";
import type { Member } from "@/lib/ipc";

interface SubscribeDialogProps {
  member: Member;
  onClose: () => void;
}

export function SubscribeDialog({ member, onClose }: SubscribeDialogProps) {
  const { t } = useTranslation();
  const { data: plans = [] } = usePlans();
  const createMut = useCreateSubscription();

  const activePlans = plans.filter((p) => p.is_active);
  const [planId, setPlanId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (activePlans.length > 0 && planId === null) {
      setPlanId(activePlans[0].id);
    }
  }, [activePlans, planId]);

  const today = new Date().toISOString().slice(0, 10);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!planId) {
      setError(t("subscriptions.plan") + " — required");
      return;
    }
    createMut.mutate(
      {
        member_id: member.id,
        plan_id: planId,
        start_date: startDate || null,
        is_paid: isPaid,
      },
      {
        onSuccess: onClose,
        onError: (err) => setError(String(err)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-cairo">
            {t("subscriptions.subscribeMember")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="font-cairo">{t("subscriptions.member")}</Label>
            <p className="text-sm font-cairo p-2 rounded-md bg-muted">
              {member.first_name} {member.last_name}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">{t("subscriptions.plan")}</Label>
            {activePlans.length === 0 ? (
              <p className="text-sm text-destructive font-cairo">
                {t("plans.empty")}
              </p>
            ) : (
              <div className="space-y-1">
                {activePlans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlanId(p.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-md border transition-colors font-cairo ${
                      planId === p.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <span>{p.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {p.duration_days}d · {formatPrice(p.price_cents)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">{t("subscriptions.startDate")}</Label>
            <Input
              type="date"
              value={startDate}
              defaultValue={today}
              onChange={(e) => setStartDate(e.target.value)}
              className="font-cairo"
            />
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">{t("subscriptions.status")}</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                variant={isPaid ? "default" : "outline"}
                size="sm"
                className="flex-1 font-cairo"
                onClick={() => setIsPaid(true)}
              >
                {t("subscriptions.paid")}
              </Button>
              <Button
                type="button"
                variant={!isPaid ? "default" : "outline"}
                size="sm"
                className="flex-1 font-cairo"
                onClick={() => setIsPaid(false)}
              >
                {t("subscriptions.unpaid")}
              </Button>
            </div>
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
              disabled={createMut.isPending || activePlans.length === 0}
              className="font-cairo"
            >
              {createMut.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {t("subscriptions.subscribe")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
