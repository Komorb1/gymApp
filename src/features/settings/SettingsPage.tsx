import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { UsersManagement } from "./UsersManagement";

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [gymName, setGymName] = useState("");
  const [gymAddress, setGymAddress] = useState("");
  const [gymPhone, setGymPhone] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setGymName(settings.gym_name ?? "");
      setGymAddress(settings.gym_address ?? "");
      setGymPhone(settings.gym_phone ?? "");
    }
  }, [settings]);

  const handleSaveGymInfo = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(
      {
        gym_name: gymName || null,
        gym_address: gymAddress || null,
        gym_phone: gymPhone || null,
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  };

  const toggleLang = () => {
    const next = i18n.language === "ar" ? "en" : "ar";
    updateSettings.mutate({ language: next });
  };

  const toggleTheme = () => {
    const next = settings?.theme === "dark" ? "light" : "dark";
    updateSettings.mutate({ theme: next });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-cairo">{t("settings.gymInfo")}</CardTitle>
          <CardDescription className="font-cairo">
            {t("settings.gymName")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveGymInfo} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gymNameInput" className="font-cairo">
                {t("settings.gymName")}
              </Label>
              <Input
                id="gymNameInput"
                value={gymName}
                onChange={(e) => setGymName(e.target.value)}
                className="font-cairo"
                placeholder="Fit Gym"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gymAddressInput" className="font-cairo">
                {t("settings.gymAddress")}
              </Label>
              <Input
                id="gymAddressInput"
                value={gymAddress}
                onChange={(e) => setGymAddress(e.target.value)}
                className="font-cairo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gymPhoneInput" className="font-cairo">
                {t("settings.gymPhone")}
              </Label>
              <Input
                id="gymPhoneInput"
                value={gymPhone}
                onChange={(e) => setGymPhone(e.target.value)}
                className="font-cairo"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateSettings.isPending} className="font-cairo">
                {updateSettings.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {t("common.save")}
              </Button>
              {saved && (
                <span className="text-sm text-success font-cairo">Saved</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-cairo">{t("settings.appearance")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="font-cairo">{t("settings.language")}</Label>
            <div className="flex gap-1">
              <Button
                variant={i18n.language === "ar" ? "default" : "outline"}
                size="sm"
                onClick={toggleLang}
                className="font-cairo"
              >
                العربية
              </Button>
              <Button
                variant={i18n.language === "en" ? "default" : "outline"}
                size="sm"
                onClick={toggleLang}
                className="font-cairo"
              >
                English
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <Label className="font-cairo">{t("settings.theme")}</Label>
            <div className="flex gap-1">
              <Button
                variant={settings?.theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={toggleTheme}
                className="font-cairo"
              >
                {t("settings.dark")}
              </Button>
              <Button
                variant={settings?.theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={toggleTheme}
                className="font-cairo"
              >
                {t("settings.light")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-cairo">{t("settings.users")}</CardTitle>
        </CardHeader>
        <CardContent>
          <UsersManagement />
        </CardContent>
      </Card>
    </div>
  );
}
