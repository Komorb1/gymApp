import * as React from "react";

import { Input } from "@/components/ui/input";

export const DateInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input">
>(({ onClick, ...props }, ref) => (
  <Input
    ref={ref}
    type="date"
    {...props}
    onClick={(event) => {
      onClick?.(event);
      try {
        event.currentTarget.showPicker?.();
      } catch {
        // Some webviews reject a second picker request while one is open.
      }
    }}
  />
));

DateInput.displayName = "DateInput";
