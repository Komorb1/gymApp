import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { RotateCw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useDashboardStats,
  useSubscriptions,
  useRenewSubscription,
} from "@/hooks/useSubscriptions";
import { useNavStore } from "@/stores/nav";
import { isExpiringSoon, memberPhotoUrl, formatDate } from "@/lib/format";

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useDashboardStats();
  const { data: subs = [] } = useSubscriptions();
  const renewMut = useRenewSubscription();
  const navigate = useNavStore((s) => s.navigate);

  const expiringSoon = useMemo(
    () =>
      subs
        .filter((s) => s.status === "active" && isExpiringSoon(s.end_date, 7))
        .sort((a, b) => a.end_date.localeCompare(b.end_date))
        .slice(0, 10),
    [subs],
  );

  const tiles = [
    {
      label: t("dashboard.activeMembers"),
      value: stats?.active_members ?? "—",
    },
    {
      label: t("dashboard.expiringThisWeek"),
      value: stats?.expiring_this_week ?? "—",
    },
    {
      label: t("dashboard.expiredOverdue"),
      value: stats?.expired_overdue ?? "—",
    },
    { label: t("dashboard.totalMembers"), value: stats?.total_members ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((tile, i) => (
          <Card
            key={i}
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => {
              if (i === 0 || i === 3) navigate("members");
              else navigate("subscriptions");
            }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground font-cairo">
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold font-cairo">
                {isLoading ? "…" : tile.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-cairo">
            {t("dashboard.expiringSoon")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expiringSoon.length === 0 ? (
            <p className="text-sm text-muted-foreground font-cairo">
              {t("subscriptions.noActiveSubs")}
            </p>
          ) : (
            <div className="space-y-2">
              {expiringSoon.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/30 transition-colors"
                >
                  {memberPhotoUrl(s.member_snapshot.photo_path) ? (
                    <img
                      src={memberPhotoUrl(s.member_snapshot.photo_path)!}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                      {s.member_snapshot.first_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-cairo font-medium truncate">
                      {[
                        s.member_snapshot.first_name,
                        s.member_snapshot.middle_name,
                        s.member_snapshot.last_name,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                    <p className="text-xs text-muted-foreground font-cairo">
                      {s.plan_snapshot.name} · {formatDate(s.end_date)}
                    </p>
                  </div>
                  <Badge variant="warning" className="font-cairo">
                    {t("subscriptions.expiring")}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      renewMut.mutate({
                        subscription_id: s.id,
                        plan_id: s.plan_id,
                        discount_percent: s.discount_percent,
                        notes: null,
                      })
                    }
                    disabled={renewMut.isPending}
                    aria-label={t("subscriptions.renew")}
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
