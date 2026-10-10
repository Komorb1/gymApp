import * as React from "react";
import { Calendar } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const DateInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ className, onClick, ...props }, ref) => (
  <div className="relative flex items-center">
    <Input
      ref={ref}
      type="date"
      {...props}
      className={cn("pe-10", className)}
      onClick={(event) => {
        onClick?.(event);
        try {
          event.currentTarget.showPicker?.();
        } catch {
          // Some webviews reject a second picker request while one is open.
        }
      }}
    />
    <Calendar
      aria-hidden
      className="pointer-events-none absolute end-3 h-4 w-4 text-muted-foreground"
    />
  </div>
));

DateInput.displayName = "DateInput";
