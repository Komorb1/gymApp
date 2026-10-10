import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney, fullName, isExpired } from "@/lib/format";
import {
  listMemberReports,
  type MemberReport,
  type Subscription,
} from "@/lib/ipc";
import {
  filterMemberReports,
  filterReportSubscriptions,
  showDiscount,
  type ReportMemberFilter,
  type ReportPaymentFilter,
  type ReportSubscriptionStatusFilter,
} from "@/lib/subscriptionView";
import { useAuthStore } from "@/stores/auth";

function statusVariant(subscription: Subscription) {
  if (subscription.status === "active" && !isExpired(subscription.end_date)) {
    return "success" as const;
  }
  if (subscription.status === "frozen" || subscription.status === "pending") {
    return "warning" as const;
  }
  return "destructive" as const;
}

export function ReportsPage() {
  const { t } = useTranslation();
  const sessionToken = useAuthStore((state) => state.sessionToken ?? "");
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState<ReportMemberFilter>("all");
  const [selectedReport, setSelectedReport] = useState<MemberReport | null>(
    null,
  );
  const [detailSearch, setDetailSearch] = useState("");
  const [detailStatus, setDetailStatus] =
    useState<ReportSubscriptionStatusFilter>("all");
  const [detailPayment, setDetailPayment] =
    useState<ReportPaymentFilter>("all");
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["member-reports", sessionToken],
    queryFn: () => listMemberReports(sessionToken),
    enabled: !!sessionToken,
  });
  const filtered = filterMemberReports(reports, search, memberFilter);
  const filteredSubscriptions = useMemo(
    () =>
      filterReportSubscriptions(
        selectedReport?.subscriptions ?? [],
        detailSearch,
        detailStatus,
        detailPayment,
      ),
    [selectedReport, detailSearch, detailStatus, detailPayment],
  );

  if (selectedReport) {
    const { member, subscriptions } = selectedReport;
    return (
      <div className="space-y-5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedReport(null)}
          className="font-cairo"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold font-cairo">
              {fullName(member)}
            </h2>
            <p className="text-sm text-muted-foreground font-cairo">
              {member.phone}
              {member.id_number ? ` · ${member.id_number}` : ""}
            </p>
          </div>
          <Badge
            variant={member.is_deleted ? "destructive" : "success"}
            className="font-cairo"
          >
            {member.is_deleted
              ? t("reports.deletedMember")
              : t("members.active")}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={detailSearch}
              onChange={(event) => setDetailSearch(event.target.value)}
              placeholder={t("reports.detailSearchPlaceholder")}
              aria-label={t("reports.detailSearchPlaceholder")}
              className="ps-10 font-cairo"
            />
          </div>
          <select
            value={detailStatus}
            onChange={(event) =>
              setDetailStatus(
                event.target.value as ReportSubscriptionStatusFilter,
              )
            }
            aria-label={t("reports.statusFilter")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-cairo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{t("reports.filters.allStatuses")}</option>
            {[
              "active",
              "expired",
              "frozen",
              "cancelled",
              "pending",
              "rejected",
            ].map((status) => (
              <option key={status} value={status}>
                {t(`subscriptions.${status}`)}
              </option>
            ))}
          </select>
          <select
            value={detailPayment}
            onChange={(event) =>
              setDetailPayment(event.target.value as ReportPaymentFilter)
            }
            aria-label={t("reports.paymentFilter")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-cairo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{t("reports.filters.allPayments")}</option>
            <option value="paid">{t("subscriptions.paid")}</option>
            <option value="unpaid">{t("subscriptions.unpaid")}</option>
          </select>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                {[
                  "plan",
                  "startDate",
                  "endDate",
                  "status",
                  "payment",
                  "finalPrice",
                  "notes",
                ].map((key) => (
                  <th
                    key={key}
                    className="p-3 text-start font-medium text-muted-foreground font-cairo"
                  >
                    {t(`subscriptions.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSubscriptions.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="p-8 text-center text-muted-foreground font-cairo"
                  >
                    {t(
                      subscriptions.length === 0
                        ? "reports.noSubscriptions"
                        : "reports.noMatchingSubscriptions",
                    )}
                  </td>
                </tr>
              ) : (
                filteredSubscriptions.map((subscription) => (
                  <tr key={subscription.id} className="border-t border-border">
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
                        variant={statusVariant(subscription)}
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
                          subscription.is_paid ? "success" : "destructive"
                        }
                        className="font-cairo"
                      >
                        {t(
                          `subscriptions.${
                            subscription.is_paid
                              ? "paid"
                              : subscription.paid_amount_cents > 0
                                ? "partial"
                                : "unpaid"
                          }`,
                        )}
                      </Badge>
                    </td>
                    <td className="p-3 font-cairo">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          {formatMoney(subscription.paid_amount_cents)} /{" "}
                          {formatMoney(subscription.final_price_cents)}
                        </span>
                        {showDiscount(subscription.discount_percent) && (
                          <Badge variant="secondary" className="font-cairo">
                            {t("subscriptions.discount")}{" "}
                            {subscription.discount_percent}%
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="max-w-56 p-3 text-muted-foreground font-cairo">
                      {subscription.notes ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold font-cairo">{t("nav.reports")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-80 max-w-full">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("reports.searchPlaceholder")}
              className="ps-10 font-cairo"
            />
          </div>
          <select
            value={memberFilter}
            onChange={(event) =>
              setMemberFilter(event.target.value as ReportMemberFilter)
            }
            aria-label={t("reports.memberFilter")}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm font-cairo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">{t("reports.filters.all")}</option>
            <option value="active">{t("reports.filters.active")}</option>
            <option value="deleted">{t("reports.filters.deleted")}</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileText className="mb-3 h-12 w-12" />
          <p className="font-cairo">{t("reports.empty")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                  {t("subscriptions.member")}
                </th>
                <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                  {t("members.phone")}
                </th>
                <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                  {t("common.created")}
                </th>
                <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                  {t("subscriptions.status")}
                </th>
                <th className="p-3 text-start font-medium text-muted-foreground font-cairo">
                  {t("reports.allSubscriptions")}
                </th>
                <th className="p-3 text-end font-medium text-muted-foreground font-cairo">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((report) => (
                <tr
                  key={report.member.id}
                  className="border-t border-border hover:bg-muted/20"
                >
                  <td className="p-3 font-medium font-cairo">
                    {fullName(report.member)}
                  </td>
                  <td className="p-3 text-muted-foreground font-cairo">
                    {report.member.phone}
                  </td>
                  <td className="p-3 text-muted-foreground font-cairo">
                    {formatDate(report.member.created_at)}
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={
                        report.member.is_deleted ? "destructive" : "success"
                      }
                      className="font-cairo"
                    >
                      {report.member.is_deleted
                        ? t("reports.deletedMember")
                        : t("members.active")}
                    </Badge>
                  </td>
                  <td className="p-3 font-cairo">
                    {report.subscriptions.length}
                  </td>
                  <td className="p-3 text-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDetailSearch("");
                        setDetailStatus("all");
                        setDetailPayment("all");
                        setSelectedReport(report);
                      }}
                      className="font-cairo"
                    >
                      {t("reports.viewReport")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
