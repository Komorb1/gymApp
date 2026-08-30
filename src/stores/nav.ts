import { create } from "zustand";

export type Page =
  | "dashboard"
  | "members"
  | "subscriptions"
  | "plans"
  | "reports"
  | "settings"
  | "member-profile"
  | "activity";

interface NavState {
  page: Page;
  memberId: number | null;
  navigate: (page: Page, memberId?: number) => void;
}

export const useNavStore = create<NavState>((set) => ({
  page: "dashboard",
  memberId: null,
  navigate: (page, memberId) => set({ page, memberId: memberId ?? null }),
}));
