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
});
