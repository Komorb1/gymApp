import { useState, useEffect } from "react";
import { Dumbbell, Loader2 } from "lucide-react";

import { fetchSetupStatus } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";
import { useSettings } from "@/hooks/useSettings";
import { SetupWizard } from "@/features/auth/SetupWizard";
import { Login } from "@/features/auth/Login";
import { AppShell } from "@/components/layout/AppShell";

type AppState = "checking" | "setup" | "login" | "app";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Dumbbell className="w-6 h-6 text-primary" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

function App() {
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<AppState>("checking");

  useSettings();

  useEffect(() => {
    async function check() {
      try {
        const status = await fetchSetupStatus();
        setState(status.needs_setup ? "setup" : "login");
      } catch {
        setState("login");
      }
    }
    check();
  }, []);

  if (state === "checking") return <LoadingScreen />;
  if (state === "setup" && !user) return <SetupWizard />;
  if (!user) return <Login />;
  return <AppShell />;
}

export default App;
