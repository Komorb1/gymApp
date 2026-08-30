import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Dumbbell, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginUser } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

export function Login() {
  const { t } = useTranslation();
  const setSession = useAuthStore((s) => s.setSession);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await loginUser(username.trim(), pin);
      setSession(session);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Dumbbell className="w-7 h-7 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-cairo">
            {t("auth.login")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="font-cairo">
                {t("auth.username")}
              </Label>
              <Input
                id="username"
                ref={usernameRef}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="font-cairo"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin" className="font-cairo">
                {t("auth.pin")}
              </Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="••••"
                className="font-cairo text-center tracking-widest"
              />
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
              {t("auth.login")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
