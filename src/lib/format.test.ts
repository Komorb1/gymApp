import { describe, expect, it } from "vitest";

import { fullName, paymentStatus, priceToCents } from "./format";

describe("membership formatting", () => {
  it("uses optional middle names without adding empty spacing", () => {
    expect(
      fullName({
        first_name: "Amina",
        middle_name: "Noor",
        last_name: "Saleh",
      }),
    ).toBe("Amina Noor Saleh");
    expect(
      fullName({ first_name: "Amina", middle_name: null, last_name: "Saleh" }),
    ).toBe("Amina Saleh");
  });

  it("converts editable payment values to integer cents", () => {
    expect(priceToCents("49.95")).toBe(4995);
    expect(priceToCents("0")).toBe(0);
  });

  it("derives unpaid, partial, and paid states from amounts", () => {
    expect(paymentStatus(0, 5000)).toBe("unpaid");
    expect(paymentStatus(2500, 5000)).toBe("partial");
    expect(paymentStatus(5000, 5000)).toBe("paid");
  });
});
