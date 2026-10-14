import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MODAL_LAYER = "@radix-ui/react-dismissable-layer";

function lockfileVersions(packageName: string): string[] {
  const lockfile = readFileSync(join(process.cwd(), "pnpm-lock.yaml"), "utf8");
  const pattern = new RegExp(`'${packageName}@(\\d+\\.\\d+\\.\\d+)'`, "g");
  const versions = new Set<string>();
  for (const match of lockfile.matchAll(pattern)) {
    versions.add(match[1]);
  }
  return [...versions].sort();
}

describe("radix modal layer alignment", () => {
  it("resolves a single dismissable-layer build for dialogs and menus", () => {
    expect(lockfileVersions(MODAL_LAYER)).toHaveLength(1);
  });
});
