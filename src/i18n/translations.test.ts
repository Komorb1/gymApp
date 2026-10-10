import { describe, expect, it } from "vitest";

import ar from "./ar.json";
import en from "./en.json";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, nested]) => keyPaths(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value as Record<string, unknown>).flatMap(stringValues);
}

describe("translations", () => {
  it("define the same keys in Arabic and English", () => {
    expect(keyPaths(ar).sort()).toEqual(keyPaths(en).sort());
  });

  it("never leave a translation empty", () => {
    expect(stringValues(ar).filter((text) => text.trim().length === 0)).toEqual(
      [],
    );
    expect(stringValues(en).filter((text) => text.trim().length === 0)).toEqual(
      [],
    );
  });
});
