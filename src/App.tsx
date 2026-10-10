import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

import { GymLogo } from "@/components/brand/GymLogo";
import { fetchSetupStatus, localSession } from "@/lib/ipc";
import { IS_LITE } from "@/lib/edition";
import { bootState, type BootState } from "@/lib/boot";
import { useAuthStore } from "@/stores/auth";
import { useSettings } from "@/hooks/useSettings";
import { useGymName } from "@/hooks/useGymName";
import { SetupWizard } from "@/features/auth/SetupWizard";
import { Login } from "@/features/auth/Login";
import { AppShell } from "@/components/layout/AppShell";

type AppState = BootState;

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
  const setSession = useAuthStore((s) => s.setSession);
  const [state, setState] = useState<AppState>("checking");

  useSettings();
  useGymName();

  useEffect(() => {
    if (user) return;
    let cancelled = false;
    setState((current) => (current === "setup" ? "checking" : current));
    async function start() {
      if (IS_LITE) {
        try {
          const session = await localSession();
          if (!cancelled) {
            setSession(session);
            setState(
              bootState({ isLite: true, hasSession: true, needsSetup: false }),
            );
          }
        } catch (error) {
          console.error("Lite session failed", error);
        }
        return;
      }
      try {
        const status = await fetchSetupStatus();
        if (!cancelled) {
          setState(
            bootState({
              isLite: false,
              hasSession: false,
              needsSetup: status.needs_setup,
            }),
          );
        }
      } catch {
        if (!cancelled) setState("login");
      }
    }
    start();
    return () => {
      cancelled = true;
    };
  }, [user, setSession]);

  if (state === "checking") return <LoadingScreen />;
  if (IS_LITE) return user ? <AppShell /> : <LoadingScreen />;
  if (state === "setup")
    return <SetupWizard onComplete={() => setState("login")} />;
  if (!user) return <Login />;
  return <AppShell />;
}

export default App;
