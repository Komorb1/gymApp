const DUPLICATE_PHONE_MARKER = "already registered for another member";

export function errorMessage(
  error: unknown,
  translate: (key: string) => string,
): string {
  const raw = String(error);
  if (raw.includes(DUPLICATE_PHONE_MARKER)) {
    return translate("members.phoneTaken");
  }
  return raw;
}
