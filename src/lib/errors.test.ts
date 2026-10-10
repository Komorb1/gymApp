import { describe, expect, it } from "vitest";

import { errorMessage } from "./errors";

const translate = (key: string) =>
  key === "members.phoneTaken" ? "Duplicated number" : key;

describe("ipc error messages", () => {
  it("localizes a duplicated WhatsApp number conflict", () => {
    expect(
      errorMessage(
        "Conflict: This WhatsApp number is already registered for another member",
        translate,
      ),
    ).toBe("Duplicated number");
  });

  it("keeps unrelated errors untouched", () => {
    expect(errorMessage("Validation error: First name is required", translate)).toBe(
      "Validation error: First name is required",
    );
  });
});
