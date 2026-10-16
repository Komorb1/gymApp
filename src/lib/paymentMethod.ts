import type { PaymentMethod } from "./ipc";

export type PaymentMethodKey = "cash" | "bankTransfer";

export const PAYMENT_METHODS: {
  value: PaymentMethod;
  key: PaymentMethodKey;
}[] = [
  { value: "cash", key: "cash" },
  { value: "bank_transfer", key: "bankTransfer" },
];

export function paymentMethodKey(
  value: string | null | undefined,
): PaymentMethodKey | null {
  const match = PAYMENT_METHODS.find((method) => method.value === value);
  return match ? match.key : null;
}

export function paymentMethodLabelKey(
  value: string | null | undefined,
): string | null {
  const key = paymentMethodKey(value);
  return key ? `subscriptions.paymentMethods.${key}` : null;
}
