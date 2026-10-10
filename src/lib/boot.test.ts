import { describe, expect, it } from "vitest";

import { bootState } from "./boot";

describe("app boot state", () => {
  it("sends a logged out user with existing accounts to the login page", () => {
    expect(
      bootState({ isLite: false, hasSession: false, needsSetup: false }),
    ).toBe("login");
  });

  it("shows the setup wizard only while no account exists", () => {
    expect(
      bootState({ isLite: false, hasSession: false, needsSetup: true }),
    ).toBe("setup");
  });

  it("opens the app whenever a session exists", () => {
    expect(
      bootState({ isLite: false, hasSession: true, needsSetup: false }),
    ).toBe("app");
    expect(
      bootState({ isLite: false, hasSession: true, needsSetup: true }),
    ).toBe("app");
  });

  it("never shows setup or login in the lite edition", () => {
    expect(
      bootState({ isLite: true, hasSession: true, needsSetup: false }),
    ).toBe("app");
    expect(bootState({ isLite: true, hasSession: false, needsSetup: true })).toBe(
      "checking",
    );
  });
});
