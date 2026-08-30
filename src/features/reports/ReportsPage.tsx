import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Search,
  Users,
  CalendarDays,
  BadgePercent,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatPrice, fullName, isExpired } from "@/lib/format";
import { listMemberReports } from "@/lib/ipc";
import { useAuthStore } from "@/stores/auth";

export function ReportsPage() {
  const { t } = useTranslation();
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const [search, setSearch] = useState("");
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["member-reports", sessionToken],
    queryFn: () => listMemberReports(sessionToken),
    enabled: !!sessionToken,
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return reports;
    return reports.filter(({ member, subscriptions }) =>
      [
        fullName(member),
        member.phone,
        member.id_number ?? "",
        member.email ?? "",
        ...subscriptions.map((subscription) => subscription.plan_snapshot.name),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [reports, search]);

  const totals = useMemo(
    () => ({
      members: reports.length,
      subscriptions: reports.reduce(
        (sum, report) => sum + report.subscriptions.length,
        0,
      ),
      discounts: reports.reduce(
        (sum, report) =>
          sum +
          report.subscriptions.reduce(
            (subscriptionSum, subscription) =>
              subscriptionSum +
              (subscription.plan_snapshot.price_cents -
                subscription.paid_amount_cents),
            0,
          ),
        0,
      ),
    }),
    [reports],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground font-cairo">
                {t("reports.allMembers")}
              </p>
              <p className="text-2xl font-bold">{totals.members}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <CalendarDays className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground font-cairo">
                {t("reports.allSubscriptions")}
              </p>
              <p className="text-2xl font-bold">{totals.subscriptions}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <BadgePercent className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground font-cairo">
                {t("reports.totalDiscounts")}
              </p>
              <p className="text-2xl font-bold">
                {formatPrice(totals.discounts)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("reports.searchPlaceholder")}
          className="ps-10 font-cairo"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileText className="mb-3 h-12 w-12" />
          <p className="font-cairo">{t("reports.empty")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(({ member, subscriptions }) => (
            <Card key={member.id} className="overflow-hidden">
              <CardHeader className="border-b border-border bg-muted/20 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="font-cairo text-lg">
                      {fullName(member)}
                    </CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground font-cairo">
                      <a
                        href={`https://wa.me/${member.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {member.phone}
                      </a>
                      {member.id_number && <span>· {member.id_number}</span>}
                      <span>· {formatDate(member.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={member.is_deleted ? "destructive" : "success"}
                      className="font-cairo"
                    >
                      {member.is_deleted
                        ? t("reports.deletedMember")
                        : t("members.active")}
                    </Badge>
                    <Badge variant="secondary" className="font-cairo">
                      {subscriptions.length} {t("reports.subscriptionsCount")}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {subscriptions.length === 0 ? (
                  <p className="p-5 text-sm text-muted-foreground font-cairo">
                    {t("reports.noSubscriptions")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                            {t("subscriptions.plan")}
                          </th>
                          <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                            {t("subscriptions.startDate")}
                          </th>
                          <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                            {t("subscriptions.endDate")}
                          </th>
                          <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                            {t("subscriptions.status")}
                          </th>
                          <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                            {t("subscriptions.payment")}
                          </th>
                          <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                            {t("subscriptions.discount")}
                          </th>
                          <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                            {t("subscriptions.finalPrice")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {subscriptions.map((subscription) => (
                          <tr
                            key={subscription.id}
                            className="border-t border-border"
                          >
                            <td className="p-3 font-cairo">
                              {subscription.plan_snapshot.name}
                            </td>
                            <td className="p-3 text-muted-foreground font-cairo">
                              {formatDate(subscription.start_date)}
                            </td>
                            <td className="p-3 text-muted-foreground font-cairo">
                              {formatDate(subscription.end_date)}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={
                                  subscription.status === "active" &&
                                  !isExpired(subscription.end_date)
                                    ? "success"
                                    : subscription.status === "frozen"
                                      ? "warning"
                                      : "destructive"
                                }
                                className="font-cairo"
                              >
                                {subscription.status === "active" &&
                                isExpired(subscription.end_date)
                                  ? t("subscriptions.expired")
                                  : t(`subscriptions.${subscription.status}`)}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={
                                  subscription.is_paid
                                    ? "success"
                                    : "destructive"
                                }
                                className="font-cairo"
                              >
                                {t(
                                  `subscriptions.${subscription.is_paid ? "paid" : "unpaid"}`,
                                )}
                              </Badge>
                            </td>
                            <td className="p-3 font-cairo">
                              {subscription.discount_percent}%
                            </td>
                            <td className="p-3 font-semibold font-cairo">
                              {formatPrice(subscription.paid_amount_cents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
