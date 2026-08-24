import { convertFileSrc } from "@tauri-apps/api/core";

export function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function priceToCents(display: string): number {
  const parsed = parseFloat(display);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function memberPhotoUrl(photoPath: string | null): string | null {
  if (!photoPath) return null;
  try {
    return convertFileSrc(photoPath);
  } catch {
    return null;
  }
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    return date.toLocaleDateString();
  } catch {
    return iso;
  }
}

export function fullName(member: {
  first_name: string;
  last_name: string;
}): string {
  return `${member.first_name} ${member.last_name}`;
}

export function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  try {
    const target = new Date(isoDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  } catch {
    return null;
  }
}

export function isExpired(endDate: string): boolean {
  return daysUntil(endDate) !== null && (daysUntil(endDate) as number) < 0;
}

export function isExpiringSoon(endDate: string, withinDays = 7): boolean {
  const days = daysUntil(endDate);
  return days !== null && days >= 0 && days <= withinDays;
}
