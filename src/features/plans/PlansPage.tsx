import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePlans, useUpdatePlan, useDeletePlan } from "@/hooks/usePlans";
import { formatPrice } from "@/lib/format";
import type { Plan } from "@/lib/ipc";
import { PlanForm } from "./PlanForm";

export function PlansPage() {
  const { t } = useTranslation();
  const { data: plans = [], isLoading } = usePlans();
  const updateMut = useUpdatePlan();
  const deleteMut = useDeletePlan();

  const [showForm, setShowForm] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const openEdit = (plan: Plan) => {
    setEditPlan(plan);
    setShowForm(true);
  };

  const toggleActive = (plan: Plan) => {
    updateMut.mutate({
      id: plan.id,
      is_active: !plan.is_active,
    });
  };

  const confirmDelete = () => {
    setDeleteError("");
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id, {
        onSuccess: () => setDeleteTarget(null),
        onError: (err) => setDeleteError(String(err)),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold font-cairo">{t("plans.title")}</h2>
        <Button
          onClick={() => {
            setEditPlan(null);
            setShowForm(true);
          }}
          className="font-cairo"
        >
          <Plus className="w-4 h-4" />
          {t("plans.newPlan")}
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-muted-foreground font-cairo">{t("plans.empty")}</p>
          <Button
            variant="outline"
            className="mt-3 font-cairo"
            onClick={() => {
              setEditPlan(null);
              setShowForm(true);
            }}
          >
            {t("plans.newPlan")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className="hover:border-primary/30 hover:shadow-md transition-all"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="font-cairo">{plan.name}</CardTitle>
                  <Badge
                    variant={plan.is_active ? "success" : "secondary"}
                    className="font-cairo"
                  >
                    {plan.is_active ? t("plans.active") : t("plans.inactive")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  <p className="font-cairo text-muted-foreground">
                    {t("plans.duration")}:{" "}
                    <span className="text-foreground">{plan.duration_days}</span>
                  </p>
                  <p className="font-cairo text-muted-foreground">
                    {t("plans.price")}:{" "}
                    <span className="text-foreground text-lg font-semibold">
                      {formatPrice(plan.price_cents)}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(plan)}
                    className="font-cairo"
                  >
                    <Pencil className="w-4 h-4" />
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant={plan.is_active ? "ghost" : "default"}
                    size="sm"
                    onClick={() => toggleActive(plan)}
                    className="font-cairo"
                  >
                    {plan.is_active ? t("plans.inactive") : t("plans.active")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeleteError("");
                      setDeleteTarget(plan);
                    }}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <PlanForm
          plan={editPlan}
          onClose={() => {
            setShowForm(false);
            setEditPlan(null);
          }}
        />
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) {
            setDeleteTarget(null);
            setDeleteError("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-cairo">{t("common.delete")}</DialogTitle>
            <DialogDescription className="font-cairo">
              {deleteTarget?.name}?
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive font-cairo">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError("");
              }}
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
