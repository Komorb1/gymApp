import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  digitsOnly,
  memberSchema,
  passwordSchema,
} from "./validation";

const validMember = {
  first_name: "Amina",
  middle_name: "",
  last_name: "",
  id_number: "",
  phone: "971555000000",
  email: "",
  birth_date: "",
  notes: "",
};

describe("member validation", () => {
  it("requires first name", () => {
    expect(
      memberSchema.safeParse({ ...validMember, first_name: "" }).success,
    ).toBe(false);
  });

  it("requires phone number", () => {
    expect(memberSchema.safeParse({ ...validMember, phone: "" }).success).toBe(
      false,
    );
  });

  it("accepts optional member details", () => {
    expect(memberSchema.safeParse(validMember).success).toBe(true);
  });

  it("keeps the phone number to digits while typing", () => {
    expect(digitsOnly("+971 55 500 0000")).toBe("971555000000");
    expect(digitsOnly("055-500-0000")).toBe("0555000000");
    expect(digitsOnly("971555000000")).toBe("971555000000");
  });

  it("requires an entered ID number to contain exactly 15 digits", () => {
    expect(
      memberSchema.safeParse({ ...validMember, id_number: "123456789012345" })
        .success,
    ).toBe(true);
    expect(
      memberSchema.safeParse({ ...validMember, id_number: "12345678901234" })
        .success,
    ).toBe(false);
    expect(
      memberSchema.safeParse({ ...validMember, id_number: "12345678901234a" })
        .success,
    ).toBe(false);
  });

  it("rejects a birth date in the future", () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    expect(
      memberSchema.safeParse({
        ...validMember,
        birth_date: tomorrow.toISOString().slice(0, 10),
      }).success,
    ).toBe(false);
  });
});

describe("password validation", () => {
  it("requires at least six characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6);
    expect(passwordSchema.safeParse("").success).toBe(false);
    expect(passwordSchema.safeParse("12345").success).toBe(false);
    expect(passwordSchema.safeParse("123456").success).toBe(true);
  });
});
