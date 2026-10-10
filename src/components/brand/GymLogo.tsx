import logoUrl from "@/assets/Gym-Logo.jpg";
import { cn } from "@/lib/utils";

export function GymLogo({ className }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt=""
      className={cn("object-contain dark:invert", className)}
    />
  );
}
