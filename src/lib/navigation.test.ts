import { describe, expect, it } from "vitest";

import { LITE_HIDDEN_PAGES, isPageAvailable } from "./navigation";
import type { Page } from "@/stores/nav";

describe("edition navigation", () => {
  it("keeps the operational pages in both editions", () => {
    for (const page of [
      "dashboard",
      "members",
      "member-profile",
      "subscriptions",
      "plans",
    ] as Page[]) {
      expect(isPageAvailable(page, true)).toBe(true);
      expect(isPageAvailable(page, false)).toBe(true);
    }
  });

  it("hides settings, reports and activity from the lite edition only", () => {
    expect(LITE_HIDDEN_PAGES).toEqual(["settings", "reports", "activity"]);
    for (const page of LITE_HIDDEN_PAGES) {
      expect(isPageAvailable(page, true)).toBe(false);
      expect(isPageAvailable(page, false)).toBe(true);
    }
  });
});
