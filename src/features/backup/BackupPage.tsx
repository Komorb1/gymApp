import { useTranslation } from "react-i18next";

import { BackupPanel } from "./BackupPanel";

export function BackupPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold font-cairo">{t("backup.title")}</h2>
      <BackupPanel />
    </div>
  );
}
