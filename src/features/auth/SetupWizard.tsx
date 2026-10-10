import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { GymLogo } from "@/components/brand/GymLogo";
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
import { setupFirstUser } from "@/lib/ipc";
import { MIN_PASSWORD_LENGTH, passwordSchema } from "@/lib/validation";
import { useAuthStore } from "@/stores/auth";
import { applyTheme, applyLanguage } from "@/hooks/useSettings";

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const { t } = useTranslation();
  const setSession = useAuthStore((s) => s.setSession);

  const [gymName, setGymName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [language, setLanguage] = useState<"ar" | "en">("ar");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError(t("auth.usernameRequired"));
      return;
    }
    if (!password) {
      setError(t("auth.passwordRequired"));
      return;
    }
    if (!passwordSchema.safeParse(password).success) {
      setError(t("auth.passwordTooShort"));
      return;
    }
    if (password !== passwordConfirm) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      applyTheme(theme);
      applyLanguage(language);

      const session = await setupFirstUser(
        username.trim(),
        password,
        gymName.trim() || undefined,
        language,
        theme,
      );
      setSession(session);
      onComplete();
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
            <GymLogo className="w-20 h-20" />
          </div>
          <CardTitle className="text-2xl font-cairo">
            {t("setup.welcome")}
          </CardTitle>
          <CardDescription className="font-cairo">
            {t("setup.setupGym")}
          </CardDescription>
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
                <Label htmlFor="password" className="font-cairo">
                  {t("auth.password")}
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  className="font-cairo"
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passwordConfirm" className="font-cairo">
                  {t("auth.confirmPassword")}
                </Label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  className="font-cairo"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-cairo">
              {t("auth.passwordHint", { count: MIN_PASSWORD_LENGTH })}
            </p>

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
