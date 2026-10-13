import type { ComponentType, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const ROW_ACTION_MENU_THRESHOLD = 3;

export type RowAction = {
  key: string;
  label: string;
  onSelect: () => void;
  variant?: "default" | "destructive" | "outline" | "ghost";
  destructive?: boolean;
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
};

export function RowActions({ actions }: { actions: RowAction[] }) {
  const { t, i18n } = useTranslation();

  if (actions.length === 0) return null;

  const select = (event: MouseEvent, action: RowAction) => {
    event.stopPropagation();
    action.onSelect();
  };

  if (actions.length >= ROW_ACTION_MENU_THRESHOLD) {
    return (
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="px-2"
              onClick={(event) => event.stopPropagation()}
              aria-label={t("common.moreActions")}
              title={t("common.moreActions")}
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={i18n.dir() === "rtl" ? "start" : "end"}
            className="w-52"
          >
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.key}
                disabled={action.disabled}
                onSelect={() => action.onSelect()}
                className={cn(
                  "font-cairo cursor-pointer",
                  action.destructive &&
                    "text-destructive focus:text-destructive",
                )}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const iconOnly = actions.every((action) => action.icon);

  return (
    <div className="flex items-center justify-end gap-1">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.key}
            variant={action.variant ?? "outline"}
            size={iconOnly ? "icon" : "sm"}
            onClick={(event) => select(event, action)}
            disabled={action.disabled}
            aria-label={action.label}
            title={iconOnly ? action.label : undefined}
            className={cn(
              "font-cairo",
              action.destructive && "text-destructive hover:text-destructive",
            )}
          >
            {Icon ? <Icon className="w-4 h-4" /> : action.label}
          </Button>
        );
      })}
    </div>
  );
}
