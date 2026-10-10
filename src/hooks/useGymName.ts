import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useSettings } from "@/hooks/useSettings";

export function useGymName(): string {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const name = settings?.gym_name?.trim() || t("app.name");

  useEffect(() => {
    document.title = name;
    getCurrentWindow()
      .setTitle(name)
      .catch(() => undefined);
  }, [name]);

  return name;
}
