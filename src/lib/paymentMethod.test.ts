import { describe, expect, it } from "vitest";

import ar from "@/i18n/ar.json";
import en from "@/i18n/en.json";
import {
  PAYMENT_METHODS,
  paymentMethodKey,
  paymentMethodLabelKey,
} from "./paymentMethod";

type Locale = { subscriptions: { paymentMethods: Record<string, string> } };

describe("payment method labels", () => {
  it("maps stored values to their locale keys", () => {
    expect(paymentMethodKey("cash")).toBe("cash");
    expect(paymentMethodKey("bank_transfer")).toBe("bankTransfer");
    expect(paymentMethodLabelKey("bank_transfer")).toBe(
      "subscriptions.paymentMethods.bankTransfer",
    );
  });

  it("shows nothing for memberships that predate the field", () => {
    expect(paymentMethodKey(null)).toBeNull();
    expect(paymentMethodKey(undefined)).toBeNull();
    expect(paymentMethodLabelKey(null)).toBeNull();
    expect(paymentMethodLabelKey("cheque")).toBeNull();
  });

  it("offers cash and bank transfer only", () => {
    expect(PAYMENT_METHODS.map((method) => method.value)).toEqual([
      "cash",
      "bank_transfer",
    ]);
  });

  it("labels every offered method in both locales", () => {
    for (const locale of [ar, en] as Locale[]) {
      for (const method of PAYMENT_METHODS) {
        expect(
          locale.subscriptions.paymentMethods[method.key]?.trim().length,
        ).toBeGreaterThan(0);
      }
      expect(
        locale.subscriptions.paymentMethods.unset.trim().length,
      ).toBeGreaterThan(0);
    }
  });
});
