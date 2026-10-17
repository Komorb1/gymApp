import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  digitsOnly,
  fullPhoneNumber,
  isUaeMobileNumber,
  memberSchema,
  passwordSchema,
  phoneDigits,
  storedPhoneDigits,
} from "./validation";

const validMember = {
  first_name: "Amina",
  middle_name: "",
  last_name: "",
  id_number: "",
  phone: "55123456",
  email: "",
  birth_date: "",
  notes: "",
};

describe("member validation", () => {
  it("requires first name", () => {
    expect(
      memberSchema().safeParse({ ...validMember, first_name: "" }).success,
    ).toBe(false);
  });

  it("requires the 8 digits after +9715 for a new member", () => {
    expect(
      memberSchema().safeParse({ ...validMember, phone: "" }).success,
    ).toBe(false);
    expect(
      memberSchema().safeParse({ ...validMember, phone: "5512345" }).success,
    ).toBe(false);
    expect(
      memberSchema().safeParse({ ...validMember, phone: "5512345678" }).success,
    ).toBe(false);
    expect(
      memberSchema().safeParse({ ...validMember, phone: "055-1234" }).success,
    ).toBe(false);
    expect(memberSchema().safeParse(validMember).success).toBe(true);
  });

  it("lets an existing member keep an old-format number untouched", () => {
    expect(
      memberSchema(false).safeParse({ ...validMember, phone: "" }).success,
    ).toBe(true);
    expect(
      memberSchema(false).safeParse({ ...validMember, phone: "5512345" })
        .success,
    ).toBe(false);
  });

  it("accepts optional member details", () => {
    expect(memberSchema().safeParse(validMember).success).toBe(true);
  });

  it("keeps the phone number to digits while typing", () => {
    expect(digitsOnly("+971 55 500 0000")).toBe("971555000000");
    expect(digitsOnly("055-500-0000")).toBe("0555000000");
    expect(digitsOnly("971555000000")).toBe("971555000000");
    expect(phoneDigits("55-123-456")).toBe("55123456");
    expect(phoneDigits("55123456789")).toBe("55123456");
  });

  it("builds and reads the +9715 form", () => {
    expect(fullPhoneNumber("55123456")).toBe("+971555123456");
    expect(isUaeMobileNumber("+971555123456")).toBe(true);
    expect(isUaeMobileNumber("0551234567")).toBe(false);
    expect(storedPhoneDigits("+971555123456")).toBe("55123456");
    expect(storedPhoneDigits("0551234567")).toBeNull();
  });

  it("requires an entered ID number to contain exactly 15 digits", () => {
    expect(
      memberSchema().safeParse({
        ...validMember,
        id_number: "123456789012345",
      }).success,
    ).toBe(true);
    expect(
      memberSchema().safeParse({
        ...validMember,
        id_number: "12345678901234",
      }).success,
    ).toBe(false);
    expect(
      memberSchema().safeParse({
        ...validMember,
        id_number: "12345678901234a",
      }).success,
    ).toBe(false);
  });

  it("rejects a birth date in the future", () => {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    expect(
      memberSchema().safeParse({
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
