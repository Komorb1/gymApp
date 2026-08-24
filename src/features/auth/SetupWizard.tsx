import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dumbbell, Loader2 } from "lucide-react";

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
import { setupFirstUser, updateSettings } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";
import { applyTheme, applyLanguage } from "@/hooks/useSettings";

export function SetupWizard() {
  const { t } = useTranslation();
  const setUser = useAuthStore((s) => s.setUser);

  const [gymName, setGymName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError(t("auth.username") + " — required");
      return;
    }
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    if (pin !== pinConfirm) {
      setError(t("setup.pinConfirm") + " — mismatch");
      return;
    }

    setLoading(true);
    try {
      applyTheme(theme);
      applyLanguage(language);

      const user = await setupFirstUser(username.trim(), pin, gymName.trim() || undefined);
      await updateSettings(user.id, { language, theme });
      setUser(user);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Dumbbell className="w-7 h-7 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-cairo">{t("setup.welcome")}</CardTitle>
          <CardDescription className="font-cairo">{t("setup.setupGym")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gymName" className="font-cairo">
                {t("settings.gymName")}
              </Label>
              <Input
                id="gymName"
                value={gymName}
                onChange={(e) => setGymName(e.target.value)}
                placeholder="Fit Gym"
                className="font-cairo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username" className="font-cairo">
                {t("auth.username")}
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="font-cairo"
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pin" className="font-cairo">
                  {t("auth.pin")}
                </Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••"
                  className="font-cairo text-center tracking-widest"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pinConfirm" className="font-cairo">
                  {t("setup.pinConfirm")}
                </Label>
                <Input
                  id="pinConfirm"
                  type="password"
                  inputMode="numeric"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••"
                  className="font-cairo text-center tracking-widest"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="font-cairo">{t("settings.language")}</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant={language === "ar" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 font-cairo"
                    onClick={() => {
                      setLanguage("ar");
                      applyLanguage("ar");
                    }}
                  >
                    العربية
                  </Button>
                  <Button
                    type="button"
                    variant={language === "en" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 font-cairo"
                    onClick={() => {
                      setLanguage("en");
                      applyLanguage("en");
                    }}
                  >
                    English
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-cairo">{t("settings.theme")}</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant={theme === "dark" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 font-cairo"
                    onClick={() => {
                      setTheme("dark");
                      applyTheme("dark");
                    }}
                  >
                    {t("settings.dark")}
                  </Button>
                  <Button
                    type="button"
                    variant={theme === "light" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 font-cairo"
                    onClick={() => {
                      setTheme("light");
                      applyTheme("light");
                    }}
                  >
                    {t("settings.light")}
                  </Button>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive font-cairo">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full font-cairo"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("setup.finish")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
