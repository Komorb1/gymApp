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
import { useFreezeSubscription } from "@/hooks/useSubscriptions";
import type { Subscription } from "@/lib/ipc";
import { fullName } from "@/lib/format";

interface FreezeDialogProps {
  subscription: Subscription;
  onClose: () => void;
}

export function FreezeDialog({ subscription, onClose }: FreezeDialogProps) {
  const { t } = useTranslation();
  const freezeMut = useFreezeSubscription();

  const [frozenUntil, setFrozenUntil] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const week = new Date();
    week.setDate(week.getDate() + 7);
    setFrozenUntil(week.toISOString().slice(0, 10));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!frozenUntil) {
      setError(t("subscriptions.freezePrompt"));
      return;
    }
    freezeMut.mutate(
      { subscriptionId: subscription.id, frozenUntil },
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
            {t("subscriptions.freeze")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="font-cairo">{t("subscriptions.member")}</Label>
            <p className="text-sm font-cairo p-2 rounded-md bg-muted">
              {fullName(subscription.member_snapshot)}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">
              {t("subscriptions.freezePrompt")}
            </Label>
            <Input
              type="date"
              value={frozenUntil}
              onChange={(e) => setFrozenUntil(e.target.value)}
              className="font-cairo"
            />
            <p className="text-xs text-muted-foreground font-cairo">
              {t("subscriptions.endDate")}: {subscription.end_date}
            </p>
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
              disabled={freezeMut.isPending}
              className="font-cairo"
            >
              {freezeMut.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {t("subscriptions.freeze")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
