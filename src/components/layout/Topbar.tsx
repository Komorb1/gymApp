import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  useSettings,
  useUpdateSettings,
  applyTheme,
} from "@/hooks/useSettings";
import { useNavStore, type Page } from "@/stores/nav";

const pageTitles: Record<Page, string> = {
  dashboard: "nav.dashboard",
  members: "nav.members",
  "member-profile": "nav.members",
  subscriptions: "nav.subscriptions",
  plans: "nav.plans",
  activity: "nav.activity",
  reports: "nav.reports",
  settings: "nav.settings",
};

export function Topbar() {
  const { t, i18n } = useTranslation();
  const page = useNavStore((s) => s.page);
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const toggleLang = () => {
    const next = i18n.language === "ar" ? "en" : "ar";
    updateSettings.mutate({ language: next });
  };

  const toggleTheme = () => {
    const next = settings?.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    updateSettings.mutate({ theme: next });
  };

  return (
    <header className="h-14 shrink-0 border-b border-border bg-card flex items-center px-4 gap-3">
      <h1 className="text-lg font-semibold font-cairo">
        {t(pageTitles[page])}
      </h1>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={toggleLang}
        className="font-cairo"
      >
        {i18n.language === "ar" ? "EN" : "ع"}
      </Button>

      <Button variant="ghost" size="icon" onClick={toggleTheme}>
        {settings?.theme === "dark" ? (
          <Sun className="w-5 h-5" />
        ) : (
          <Moon className="w-5 h-5" />
        )}
      </Button>
    </header>
  );
}
