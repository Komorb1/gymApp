import { useTranslation } from "react-i18next";

import type { PaymentMethod } from "@/lib/ipc";
import { PAYMENT_METHODS, paymentMethodLabelKey } from "@/lib/paymentMethod";

type PaymentMethodPickerProps = {
  value: PaymentMethod | null;
  onChange: (value: PaymentMethod) => void;
};

export function PaymentMethodPicker({
  value,
  onChange,
}: PaymentMethodPickerProps) {
  const { t } = useTranslation();
  const options: { value: PaymentMethod; labelKey: string }[] =
    PAYMENT_METHODS.map((method) => ({
      value: method.value,
      labelKey: `subscriptions.paymentMethods.${method.key}`,
    }));

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.labelKey}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 min-w-24 p-2 rounded-md border text-sm font-cairo transition-colors ${
            value === option.value
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted"
          }`}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}

export function PaymentMethodValue({ value }: { value: PaymentMethod | null }) {
  const { t } = useTranslation();
  const labelKey = paymentMethodLabelKey(value);

  return (
    <span className="font-cairo whitespace-nowrap">
      {labelKey ? t(labelKey) : "—"}
    </span>
  );
}
