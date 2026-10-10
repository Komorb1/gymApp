import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { GymLogo } from "@/components/brand/GymLogo";
import { fetchSetupStatus } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";
import { useSettings } from "@/hooks/useSettings";
import { useGymName } from "@/hooks/useGymName";
import { SetupWizard } from "@/features/auth/SetupWizard";
import { Login } from "@/features/auth/Login";
import { AppShell } from "@/components/layout/AppShell";

type AppState = "checking" | "setup" | "login" | "app";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <GymLogo className="w-14 h-14" />
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

function App() {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<AppState>("checking");

  useSettings();
  useGymName();

  useEffect(() => {
    if (user) return;
    let cancelled = false;
    setState((current) => (current === "setup" ? "checking" : current));
    async function check() {
      try {
        const status = await fetchSetupStatus();
        if (!cancelled) setState(status.needs_setup ? "setup" : "login");
      } catch {
        if (!cancelled) setState("login");
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (state === "checking") return <LoadingScreen />;
  if (state === "setup")
    return <SetupWizard onComplete={() => setState("login")} />;
  if (!user) return <Login />;
  return <AppShell />;
}

export default App;
