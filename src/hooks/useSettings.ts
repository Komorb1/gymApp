import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import i18n from "@/i18n/config";
import {
  fetchSettings,
  updateSettings,
  type Settings,
  type UpdateSettingsInput,
} from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

export function applyTheme(theme: "dark" | "light") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function applyLanguage(lang: "ar" | "en") {
  i18n.changeLanguage(lang);
}

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const s = await fetchSettings();
      applyTheme(s.theme);
      applyLanguage(s.language);
      return s;
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const sessionToken = useAuthStore((s) => s.sessionToken ?? "");

  return useMutation({
    mutationFn: (input: UpdateSettingsInput) =>
      updateSettings(sessionToken, input),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      applyTheme(data.theme);
      applyLanguage(data.language);
    },
  });
}
