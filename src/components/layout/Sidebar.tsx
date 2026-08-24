import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ListChecks,
  Settings as SettingsIcon,
  Dumbbell,
  LogOut,
  ScrollText,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useNavStore, type Page } from "@/stores/nav";
import { useAuthStore } from "@/stores/auth";

const navItems: { page: Page; icon: React.ElementType; key: string }[] = [
  { page: "dashboard", icon: LayoutDashboard, key: "nav.dashboard" },
  { page: "members", icon: Users, key: "nav.members" },
  { page: "subscriptions", icon: CalendarDays, key: "nav.subscriptions" },
  { page: "plans", icon: ListChecks, key: "nav.plans" },
  { page: "activity", icon: ScrollText, key: "nav.activity" },
  { page: "settings", icon: SettingsIcon, key: "nav.settings" },
];

export function Sidebar() {
  const { t } = useTranslation();
  const { page, navigate } = useNavStore();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <aside className="w-60 shrink-0 bg-card border-e border-border flex flex-col">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shadow-sm shadow-primary/20">
          <Dumbbell className="w-5 h-5 text-primary" />
        </div>
        <span className="font-bold font-cairo text-lg">{t("app.name")}</span>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ page: p, icon: Icon, key }) => {
          const isActive =
            page === p || (page === "member-profile" && p === "members");
          return (
            <button
              key={p}
              onClick={() => navigate(p)}
              className={cn(
                "nav-button",
                isActive ? "nav-button-active" : "nav-button-inactive",
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {t(key)}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-border">
        <div className="flex items-center gap-2 px-3 py-2 text-sm">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
            {user?.username?.[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="font-cairo text-muted-foreground flex-1 truncate">
            {user?.username ?? ""}
          </span>
          <button
            onClick={logout}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label={t("auth.logout")}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
