import type { Page } from "@/stores/nav";

export const LITE_HIDDEN_PAGES: Page[] = ["settings", "reports", "activity"];
export const FULL_HIDDEN_PAGES: Page[] = ["backup"];

export function isPageAvailable(page: Page, isLite: boolean): boolean {
  if (isLite) return !LITE_HIDDEN_PAGES.includes(page);
  return !FULL_HIDDEN_PAGES.includes(page);
}
