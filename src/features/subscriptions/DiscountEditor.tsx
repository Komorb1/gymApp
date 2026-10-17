import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currencySymbol, formatMoney } from "@/lib/format";

export type DiscountKind = "percent" | "amount";

type DiscountEditorProps = {
  kind: DiscountKind;
  onKindChange: (kind: DiscountKind) => void;
  percent: string;
  onPercentChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  planPriceCents: number;
  finalPriceCents: number;
};

export function DiscountEditor({
  kind,
  onKindChange,
  percent,
  onPercentChange,
  amount,
  onAmountChange,
  planPriceCents,
  finalPriceCents,
}: DiscountEditorProps) {
  const { t } = useTranslation();
  const kinds: DiscountKind[] = ["percent", "amount"];

  return (
    <div className="space-y-2">
      <Label className="font-cairo">{t("subscriptions.discountKind")}</Label>
      <div className="flex flex-wrap gap-2">
        {kinds.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onKindChange(option)}
            className={`flex-1 min-w-24 p-2 rounded-md border text-sm font-cairo transition-colors ${
              kind === option
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted"
            }`}
          >
            {t(`subscriptions.discountKinds.${option}`)}
          </button>
        ))}
      </div>

      {kind === "percent" ? (
        <Input
          type="number"
          min={0}
          max={100}
          step="1"
          value={percent}
          onChange={(event) => onPercentChange(event.target.value)}
          className="font-cairo"
          aria-label={t("subscriptions.discountPercent")}
        />
      ) : (
        <div className="space-y-2">
          <Label className="font-cairo">
            {t("subscriptions.discountAmount")}
          </Label>
          <div className="relative flex items-center">
            <Input
              type="number"
              min={0}
              max={planPriceCents / 100}
              step="0.01"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              className="pe-14 font-cairo"
              aria-label={t("subscriptions.discountAmount")}
            />
            <span className="pointer-events-none absolute end-3 text-sm text-muted-foreground font-cairo">
              {currencySymbol()}
            </span>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground font-cairo">
        {t("subscriptions.finalPrice")}: {formatMoney(finalPriceCents)}
      </p>
    </div>
  );
}
