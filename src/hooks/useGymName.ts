import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { useSettings } from "@/hooks/useSettings";
import { IS_LITE } from "@/lib/edition";

export function useGymName(): string {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const name = settings?.gym_name?.trim() || t("app.name");

  useEffect(() => {
    document.title = IS_LITE ? t("app.liteName") : name;
    if (IS_LITE) return;
    getCurrentWindow()
      .setTitle(name)
      .catch(() => undefined);
  }, [name, t]);

  return name;
}
