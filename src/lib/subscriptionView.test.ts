import { describe, expect, it } from "vitest";

import type { MemberReport, Plan, Subscription } from "./ipc";
import {
  EXPIRED_WINDOW_DAYS,
  canReviewDiscount,
  discountedPriceCents,
  filterMemberReports,
  filterReportSubscriptions,
  groupOperationalSubscriptions,
  membershipPlanPriceCents,
  showDiscount,
} from "./subscriptionView";

const subscription = (
  id: number,
  memberId: number,
  status: Subscription["status"],
  endDate: string,
): Subscription => ({
  id,
  member_id: memberId,
  plan_id: 1,
  member_snapshot: {
    id: memberId,
    first_name: "Amina",
    middle_name: null,
    last_name: "Saleh",
    id_number: null,
    phone: "0500000000",
    whatsapp_no: null,
    email: null,
    birth_date: null,
    notes: null,
    photo_path: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  plan_snapshot: {
    id: 1,
    name: "Monthly",
    duration_days: 30,
    price_cents: 5000,
  },
  start_date: "2026-01-01",
  end_date: endDate,
  status,
  frozen_at: null,
  frozen_until: null,
  final_price_cents: 5000,
  paid_amount_cents: 5000,
  unpaid_amount_cents: 0,
  discount_percent: 0,
  is_paid: true,
  discount_requested_by_user_id: null,
  discount_approval_status: null,
  discount_reviewed_by_user_id: null,
  discount_reviewed_at: null,
  renews_subscription_id: null,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("subscription operational views", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("excludes historical expiries when the member has a current membership", () => {
    const old = subscription(1, 1, "active", "2026-09-01");
    const current = subscription(2, 1, "active", "2026-12-01");
    const expiredOnly = subscription(3, 2, "active", "2026-09-05");

    const groups = groupOperationalSubscriptions(
      [old, current, expiredOnly],
      now,
    );

    expect(groups.expired.map(({ id }) => id)).toEqual([3]);
  });

  it("lists only memberships expired within the last thirty days", () => {
    const recent = subscription(1, 1, "active", "2026-08-20");
    const ancient = subscription(2, 2, "active", "2026-07-01");

    const groups = groupOperationalSubscriptions([recent, ancient], now);

    expect(EXPIRED_WINDOW_DAYS).toBe(30);
    expect(groups.expired.map(({ id }) => id)).toEqual([1]);
  });

  it("keeps pending approvals visible in the active bucket", () => {
    const pending = subscription(1, 1, "pending", "2026-12-01");
    const rejected = subscription(2, 2, "rejected", "2026-09-01");

    const groups = groupOperationalSubscriptions([pending, rejected], now);

    expect(groups.active).toEqual([pending]);
    expect(groups.expired).toEqual([]);
  });

  it("collects partially paid memberships across every status", () => {
    const partialActive = {
      ...subscription(1, 1, "active", "2026-12-01"),
      paid_amount_cents: 2000,
      is_paid: false,
    };
    const partialOld = {
      ...subscription(2, 2, "active", "2026-07-01"),
      paid_amount_cents: 1000,
      is_paid: false,
    };
    const unpaid = {
      ...subscription(3, 3, "active", "2026-12-01"),
      paid_amount_cents: 0,
      is_paid: false,
    };
    const paidInFull = subscription(4, 4, "active", "2026-12-01");

    const groups = groupOperationalSubscriptions(
      [partialActive, partialOld, unpaid, paidInFull],
      now,
    );

    expect(groups.partial.map(({ id }) => id)).toEqual([1, 2]);
  });
});

describe("membership editing prices", () => {
  const plans: Plan[] = [
    {
      id: 1,
      name: "Monthly",
      duration_days: 30,
      price_cents: 9000,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    },
    {
      id: 2,
      name: "Quarterly",
      duration_days: 90,
      price_cents: 24000,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ];

  it("uses the stored plan price when the membership keeps its plan", () => {
    const membership = subscription(1, 1, "active", "2026-12-01");

    expect(membershipPlanPriceCents(membership, plans, 1)).toBe(5000);
    expect(
      discountedPriceCents(membershipPlanPriceCents(membership, plans, 1), 10),
    ).toBe(4500);
  });

  it("uses the current plan price when the membership switches plan", () => {
    const membership = subscription(1, 1, "active", "2026-12-01");

    expect(membershipPlanPriceCents(membership, plans, 2)).toBe(24000);
    expect(
      discountedPriceCents(membershipPlanPriceCents(membership, plans, 2), 25),
    ).toBe(18000);
  });
});

describe("membership presentation", () => {
  it("shows discount information only for positive discounts", () => {
    expect(showDiscount(0)).toBe(false);
    expect(showDiscount(15)).toBe(true);
  });

  it("shows discount review actions only for operationally pending requests", () => {
    const pending = {
      ...subscription(1, 1, "pending", "2026-12-01"),
      discount_approval_status: "pending" as const,
    };
    const cancelled = { ...pending, status: "cancelled" as const };

    expect(canReviewDiscount(pending)).toBe(true);
    expect(canReviewDiscount(cancelled)).toBe(false);
  });

  it("searches and filters reports while retaining deleted members", () => {
    const deletedReport = {
      member: {
        ...subscription(1, 7, "cancelled", "2026-01-01").member_snapshot,
        is_deleted: true,
        deleted_at: "2026-02-01",
        updated_at: "2026-02-01",
      },
      subscriptions: [subscription(1, 7, "cancelled", "2026-01-01")],
    } as MemberReport;
    const activeReport = {
      member: {
        ...deletedReport.member,
        id: 8,
        first_name: "Omar",
        is_deleted: false,
        deleted_at: null,
      },
      subscriptions: [subscription(2, 8, "active", "2026-12-01")],
    } as MemberReport;

    expect(
      filterMemberReports([deletedReport, activeReport], "Amina", "deleted"),
    ).toEqual([deletedReport]);
  });

  it("filters report details by search, derived status, and payment", () => {
    const expiredPaid = {
      ...subscription(1, 1, "active", "2026-01-01"),
      notes: "Legacy membership",
    };
    const activeUnpaid = {
      ...subscription(2, 1, "active", "2026-12-01"),
      is_paid: false,
      plan_snapshot: {
        ...subscription(2, 1, "active", "2026-12-01").plan_snapshot,
        name: "Annual Gold",
      },
    };

    expect(
      filterReportSubscriptions(
        [expiredPaid, activeUnpaid],
        "gold",
        "active",
        "unpaid",
        new Date("2026-09-13T12:00:00Z"),
      ),
    ).toEqual([activeUnpaid]);
    expect(
      filterReportSubscriptions(
        [expiredPaid, activeUnpaid],
        "legacy",
        "expired",
        "paid",
        new Date("2026-09-13T12:00:00Z"),
      ),
    ).toEqual([expiredPaid]);
  });
});
