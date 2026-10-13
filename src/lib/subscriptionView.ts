import type { MemberReport, Plan, Subscription } from "./ipc";
import { formatDate, fullName, isExpired } from "./format";

export type OperationalSubscriptionGroups = {
  active: Subscription[];
  expiring: Subscription[];
  expired: Subscription[];
  frozen: Subscription[];
  partial: Subscription[];
};

export const EXPIRING_WINDOW_DAYS = 7;
export const EXPIRED_WINDOW_DAYS = 30;

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftedDate(date: Date, days: number): string {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return dateOnly(shifted);
}

function holdsCurrentMembership(subscription: Subscription, today: string) {
  return (
    subscription.status === "frozen" ||
    subscription.status === "pending" ||
    (subscription.status === "active" && subscription.end_date >= today)
  );
}

export function groupOperationalSubscriptions(
  subscriptions: Subscription[],
  now = new Date(),
): OperationalSubscriptionGroups {
  const today = dateOnly(now);
  const soon = shiftedDate(now, EXPIRING_WINDOW_DAYS);
  const expirationFloor = shiftedDate(now, -EXPIRED_WINDOW_DAYS);
  const membersWithCurrentMembership = new Set(
    subscriptions
      .filter((subscription) => holdsCurrentMembership(subscription, today))
      .map((subscription) => subscription.member_id),
  );
  const groups: OperationalSubscriptionGroups = {
    active: [],
    expiring: [],
    expired: [],
    frozen: [],
    partial: [],
  };

  for (const subscription of subscriptions) {
    const status =
      subscription.status === "pending" ? "active" : subscription.status;

    if (status === "frozen") {
      groups.frozen.push(subscription);
    } else if (status === "active" && subscription.end_date < today) {
      if (
        subscription.end_date >= expirationFloor &&
        !membersWithCurrentMembership.has(subscription.member_id)
      ) {
        groups.expired.push(subscription);
      }
    } else if (status === "active") {
      groups.active.push(subscription);
      if (subscription.end_date <= soon) groups.expiring.push(subscription);
    }

    if (subscription.paid_amount_cents > 0 && !subscription.is_paid) {
      groups.partial.push(subscription);
    }
  }

  return groups;
}

export function showDiscount(discountPercent: number): boolean {
  return discountPercent > 0;
}

export function membershipPlanPriceCents(
  subscription: Subscription,
  plans: Plan[],
  selectedPlanId: number,
): number {
  if (selectedPlanId === subscription.plan_id) {
    return subscription.plan_snapshot.price_cents;
  }
  return (
    plans.find((plan) => plan.id === selectedPlanId)?.price_cents ??
    subscription.plan_snapshot.price_cents
  );
}

export function discountedPriceCents(
  priceCents: number,
  discountPercent: number,
): number {
  return Math.round((priceCents * (100 - discountPercent)) / 100);
}

export function canReviewDiscount(subscription: Subscription): boolean {
  return (
    subscription.status === "pending" &&
    subscription.discount_approval_status === "pending"
  );
}

export type DerivedMembershipStatus =
  "active" | "expired" | "frozen" | "cancelled" | "pending" | "rejected";

export function derivedMembershipStatus(
  subscription: Subscription,
  now = new Date(),
): DerivedMembershipStatus {
  if (
    subscription.status === "active" &&
    subscription.end_date < dateOnly(now)
  ) {
    return "expired";
  }
  return subscription.status;
}

export function paymentStatusKey(
  subscription: Subscription,
): "paid" | "partial" | "unpaid" {
  if (subscription.is_paid) return "paid";
  return subscription.paid_amount_cents > 0 ? "partial" : "unpaid";
}

export type MembershipSearchOptions = {
  now?: Date;
  labels?: (subscription: Subscription) => string[];
};

const SEARCH_SEPARATORS = /[^\p{L}\p{N}]+/gu;
const NON_DIGITS = /[^\p{N}]+/gu;
const DIGITS_ONLY = /^\p{N}+$/u;
const ARABIC_MARKS = /[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g;
const MIN_DATE_QUERY_DIGITS = 4;
const ID_PREFIXES = new Set(["id", "معرف", "المعرف", "عضوية", "العضوية"]);

function normalizedText(value: string): string {
  return value
    .replace(ARABIC_MARKS, "")
    .toLocaleLowerCase()
    .replace(SEARCH_SEPARATORS, " ")
    .trim();
}

export function filterMemberships(
  subscriptions: Subscription[],
  search: string,
  options: MembershipSearchOptions = {},
): Subscription[] {
  const query = normalizedText(search);
  if (query.length === 0) return subscriptions;

  const tokens = query.split(" ").filter(Boolean);
  const numeric = numericQuery(tokens);
  const dateQuery = digitQuery(search);

  return subscriptions.filter((subscription) => {
    if (numeric !== null) {
      if (String(subscription.id) === numeric) return true;
      return (
        numeric.length >= MIN_DATE_QUERY_DIGITS &&
        membershipDateDigits(subscription).some((value) =>
          value.includes(numeric),
        )
      );
    }

    if (dateQuery !== null) {
      return membershipDateDigits(subscription).some((value) =>
        value.includes(dateQuery),
      );
    }

    const { plan, exact } = membershipSearchFields(subscription, options);
    if (tokens.every((token) => plan.includes(token))) return true;
    return exact.includes(query);
  });
}

function numericQuery(tokens: string[]): string | null {
  const last = tokens[tokens.length - 1];
  if (!last || !DIGITS_ONLY.test(last)) return null;
  if (tokens.length === 1) return last;
  return tokens.slice(0, -1).every((token) => ID_PREFIXES.has(token))
    ? last
    : null;
}

function membershipSearchFields(
  subscription: Subscription,
  { now = new Date(), labels }: MembershipSearchOptions,
): { plan: string; exact: string[] } {
  return {
    plan: normalizedText(subscription.plan_snapshot.name),
    exact: [
      normalizedText(derivedMembershipStatus(subscription, now)),
      normalizedText(paymentStatusKey(subscription)),
      ...(labels?.(subscription) ?? []).map(normalizedText),
    ].filter(Boolean),
  };
}

function membershipDateDigits(subscription: Subscription): string[] {
  return [
    subscription.start_date,
    subscription.end_date,
    subscription.created_at.slice(0, 10),
    formatDate(subscription.start_date),
    formatDate(subscription.end_date),
    formatDate(subscription.created_at),
  ].map((value) => value.replace(NON_DIGITS, ""));
}

function digitQuery(search: string): string | null {
  const trimmed = search.trim();
  const digits = trimmed.replace(NON_DIGITS, "");
  if (digits.length < MIN_DATE_QUERY_DIGITS) return null;
  if (trimmed.replace(/[^\p{L}]+/gu, "").length > 0) return null;
  return digits;
}

export function renewConfirmationKey(
  subscription: Subscription,
): "subscriptions.renewConfirm" | "subscriptions.renewConfirmExpired" {
  return isExpired(subscription.end_date)
    ? "subscriptions.renewConfirmExpired"
    : "subscriptions.renewConfirm";
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
