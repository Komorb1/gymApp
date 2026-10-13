import { create } from "zustand";

export type Page =
  | "dashboard"
  | "members"
  | "subscriptions"
  | "plans"
  | "reports"
  | "settings"
  | "member-profile"
  | "activity"
  | "backup";

export type MemberProfileTab = "overview" | "subs";

interface NavState {
  page: Page;
  memberId: number | null;
  memberProfileTab: MemberProfileTab;
  navigate: (
    page: Page,
    memberId?: number,
    memberProfileTab?: MemberProfileTab,
  ) => void;
  setMemberProfileTab: (tab: MemberProfileTab) => void;
}

export const useNavStore = create<NavState>((set) => ({
  page: "dashboard",
  memberId: null,
  memberProfileTab: "overview",
  navigate: (page, memberId, memberProfileTab) =>
    set({
      page,
      memberId: memberId ?? null,
      memberProfileTab: memberProfileTab ?? "overview",
    }),
  setMemberProfileTab: (tab) => set({ memberProfileTab: tab }),
}));
