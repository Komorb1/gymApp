import { create } from "zustand";

import type { AuthSession, User } from "@/lib/ipc";

interface AuthState {
  user: User | null;
  sessionToken: string | null;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  sessionToken: null,
  setSession: (session) =>
    set({ user: session.user, sessionToken: session.session_token }),
  clearSession: () => set({ user: null, sessionToken: null }),
}));
