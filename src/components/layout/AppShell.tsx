import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useNavStore } from "@/stores/nav";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { MembersPage } from "@/features/members/MembersPage";
import { MemberProfile } from "@/features/members/MemberProfile";
import { SubscriptionsPage } from "@/features/subscriptions/SubscriptionsPage";
import { PlansPage } from "@/features/plans/PlansPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { ActivityLogPage } from "@/features/activity/ActivityLogPage";

export function AppShell() {
  const page = useNavStore((s) => s.page);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="flex-1 overflow-auto p-6">
          {page === "dashboard" && <DashboardPage />}
          {page === "members" && <MembersPage />}
          {page === "member-profile" && <MemberProfile />}
          {page === "subscriptions" && <SubscriptionsPage />}
          {page === "plans" && <PlansPage />}
          {page === "activity" && <ActivityLogPage />}
          {page === "settings" && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
