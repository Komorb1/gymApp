import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { planSchema, type PlanFormData } from "@/lib/validation";
import { priceToCents, formatPrice } from "@/lib/format";
import { useCreatePlan, useUpdatePlan } from "@/hooks/usePlans";
import type { Plan } from "@/lib/ipc";

interface PlanFormProps {
  plan: Plan | null;
  onClose: () => void;
}

export function PlanForm({ plan, onClose }: PlanFormProps) {
  const { t } = useTranslation();
  const isEdit = !!plan;
  const createMut = useCreatePlan();
  const updateMut = useUpdatePlan();

  const [priceDisplay, setPriceDisplay] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
  });

  useEffect(() => {
    if (plan) {
      reset({
        name: plan.name,
        duration_days: plan.duration_days,
        price_cents: plan.price_cents,
      });
      setPriceDisplay(formatPrice(plan.price_cents));
    } else {
      reset({
        name: "",
        duration_days: 30,
        price_cents: 0,
      });
      setPriceDisplay("");
    }
  }, [plan, reset]);

  const onSubmit = (data: PlanFormData) => {
    const priceCents = priceToCents(priceDisplay);
    const payload = { ...data, price_cents: priceCents };

    if (isEdit && plan) {
      updateMut.mutate(
        { id: plan.id, ...payload },
        { onSuccess: onClose },
      );
    } else {
      createMut.mutate(payload, { onSuccess: onClose });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-cairo">
            {isEdit ? t("common.edit") : t("plans.newPlan")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="font-cairo">{t("plans.name")}</Label>
            <Input {...register("name")} className="font-cairo" autoFocus />
            {errors.name && (
              <p className="text-xs text-destructive font-cairo">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">{t("plans.duration")}</Label>
            <Input
              type="number"
              min={1}
              {...register("duration_days", { valueAsNumber: true })}
              className="font-cairo"
            />
            {errors.duration_days && (
              <p className="text-xs text-destructive font-cairo">
                {errors.duration_days.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-cairo">{t("plans.price")}</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={priceDisplay}
              onChange={(e) => {
                setPriceDisplay(e.target.value);
              }}
              className="font-cairo"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="font-cairo">
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
