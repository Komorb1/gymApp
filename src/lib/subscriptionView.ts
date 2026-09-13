import type { MemberReport, Subscription } from "./ipc";
import { fullName } from "./format";

export type OperationalSubscriptionGroups = {
  active: Subscription[];
  expiring: Subscription[];
  expired: Subscription[];
  frozen: Subscription[];
  pending: Subscription[];
};

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function groupOperationalSubscriptions(
  subscriptions: Subscription[],
  now = new Date(),
): OperationalSubscriptionGroups {
  const today = dateOnly(now);
  const soonDate = new Date(now);
  soonDate.setUTCDate(soonDate.getUTCDate() + 7);
  const soon = dateOnly(soonDate);
  const membersWithCurrentMembership = new Set(
    subscriptions
      .filter(
        (subscription) =>
          subscription.status === "frozen" ||
          (subscription.status === "active" && subscription.end_date >= today),
      )
      .map((subscription) => subscription.member_id),
  );
  const groups: OperationalSubscriptionGroups = {
    active: [],
    expiring: [],
    expired: [],
    frozen: [],
    pending: [],
  };

  for (const subscription of subscriptions) {
    if (subscription.status === "pending") {
      groups.pending.push(subscription);
    } else if (subscription.status === "frozen") {
      groups.frozen.push(subscription);
    } else if (
      subscription.status === "active" &&
      subscription.end_date < today
    ) {
      if (!membersWithCurrentMembership.has(subscription.member_id)) {
        groups.expired.push(subscription);
      }
    } else if (subscription.status === "active") {
      groups.active.push(subscription);
      if (subscription.end_date <= soon) groups.expiring.push(subscription);
    }
  }

  return groups;
}

export function showDiscount(discountPercent: number): boolean {
  return discountPercent > 0;
}

export function canReviewDiscount(subscription: Subscription): boolean {
  return (
    subscription.status === "pending" &&
    subscription.discount_approval_status === "pending"
  );
}

export type ReportMemberFilter = "all" | "active" | "deleted";

export type ReportSubscriptionStatusFilter =
  | "all"
  | "active"
  | "expired"
  | "frozen"
  | "cancelled"
  | "pending"
  | "rejected";

export type ReportPaymentFilter = "all" | "paid" | "unpaid";

export function filterMemberReports(
  reports: MemberReport[],
  search: string,
  memberFilter: ReportMemberFilter,
): MemberReport[] {
  const query = search.trim().toLocaleLowerCase();
  return reports.filter(({ member, subscriptions }) => {
    if (memberFilter === "active" && member.is_deleted) return false;
    if (memberFilter === "deleted" && !member.is_deleted) return false;
    if (!query) return true;
    return [
      fullName(member),
      member.phone,
      member.id_number ?? "",
      member.email ?? "",
      ...subscriptions.map((subscription) => subscription.plan_snapshot.name),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
}

export function filterReportSubscriptions(
  subscriptions: Subscription[],
  search: string,
  statusFilter: ReportSubscriptionStatusFilter,
  paymentFilter: ReportPaymentFilter,
  now = new Date(),
): Subscription[] {
  const query = search.trim().toLocaleLowerCase();
  const today = dateOnly(now);

  return subscriptions.filter((subscription) => {
    const derivedStatus =
      subscription.status === "active" && subscription.end_date < today
        ? "expired"
        : subscription.status;

    if (statusFilter !== "all" && derivedStatus !== statusFilter) return false;
    if (paymentFilter === "paid" && !subscription.is_paid) return false;
    if (paymentFilter === "unpaid" && subscription.is_paid) return false;
    if (!query) return true;

    return [subscription.plan_snapshot.name, subscription.notes ?? ""]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query);
  });
}
