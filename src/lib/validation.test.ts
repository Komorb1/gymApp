import { describe, expect, it } from "vitest";

import { memberSchema } from "./validation";

const validMember = {
  first_name: "Amina",
  middle_name: "",
  last_name: "",
  id_number: "",
  phone: "+90 555 000 0000",
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
