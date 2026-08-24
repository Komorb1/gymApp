import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText, Search, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import { formatDate } from "@/lib/format";

const actionColors: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "secondary"
> = {
  "member.create": "success",
  "member.update": "default",
  "member.delete": "destructive",
  "member.set_flag": "warning",
  "member.remove_flag": "secondary",
  "plan.create": "success",
  "plan.update": "default",
  "plan.delete": "destructive",
  "subscription.create": "success",
  "subscription.renew": "default",
  "subscription.freeze": "warning",
  "subscription.unfreeze": "default",
  "subscription.cancel": "destructive",
  "subscription.set_paid": "default",
  "user.create": "success",
  "user.update": "default",
  "settings.update": "secondary",
  "backup.create": "secondary",
};

const LOGS_PER_PAGE = 10;

export function ActivityLogPage() {
  const { t } = useTranslation();
  const { data: logs = [], isLoading } = useActivityLogs(500);

  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const users = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.username));
    return Array.from(set).sort();
  }, [logs]);

  const actions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (userFilter !== "all" && l.username !== userFilter) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${l.username} ${l.action} ${l.target_type ?? ""} ${l.details ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, userFilter, actionFilter, search]);

  const totalPages = Math.ceil(filtered.length / LOGS_PER_PAGE);
  const pagedLogs = filtered.slice(page * LOGS_PER_PAGE, (page + 1) * LOGS_PER_PAGE);

  const resetPage = () => setPage(0);

  const formatAction = (action: string) => t(`activity.actions.${action}`, { defaultValue: action });
  const formatTarget = (target: string | null) => target ? t(`activity.targets.${target}`, { defaultValue: target }) : "—";

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder={t("common.search")}
              className="ps-10 font-cairo"
            />
          </div>
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              resetPage();
            }}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm font-cairo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-card dark:text-foreground"
          >
            <option value="all">{t("common.user")}: {t("common.all")}</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              resetPage();
            }}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm font-cairo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-card dark:text-foreground"
          >
            <option value="all">{t("common.action")}: {t("common.all")}</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {formatAction(a)}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ScrollText className="w-12 h-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground font-cairo">{t("activity.noResults")}</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                      {t("common.date")}
                    </th>
                    <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                      {t("common.user")}
                    </th>
                    <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                      {t("common.action")}
                    </th>
                    <th className="text-start font-medium text-muted-foreground p-3 font-cairo">
                      {t("common.target")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-t border-border hover:bg-muted/20 transition-colors"
                    >
                      <td className="p-3 font-cairo text-muted-foreground whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="p-3 font-cairo font-medium">{log.username}</td>
                      <td className="p-3">
                        <Badge
                          variant={actionColors[log.action] ?? "secondary"}
                          className="font-cairo"
                        >
                          {formatAction(log.action)}
                        </Badge>
                      </td>
                      <td className="p-3 font-cairo text-muted-foreground">
                        {formatTarget(log.target_type)}
                        {log.details ? ` · ${log.details}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="font-cairo"
                >
                  {t("common.prev")}
                </Button>
                <span className="text-sm text-muted-foreground font-cairo">
                  {t("common.page")} {page + 1} {t("common.of")} {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="font-cairo"
                >
                  {t("common.next")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
