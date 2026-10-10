import type { Page } from "@/stores/nav";

export const LITE_HIDDEN_PAGES: Page[] = ["settings", "reports", "activity"];

export function isPageAvailable(page: Page, isLite: boolean): boolean {
  return !isLite || !LITE_HIDDEN_PAGES.includes(page);
}
