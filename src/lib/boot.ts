export type BootState = "checking" | "setup" | "login" | "app";

export function bootState(options: {
  isLite: boolean;
  hasSession: boolean;
  needsSetup: boolean;
}): BootState {
  if (options.isLite) return options.hasSession ? "app" : "checking";
  if (options.hasSession) return "app";
  return options.needsSetup ? "setup" : "login";
}
