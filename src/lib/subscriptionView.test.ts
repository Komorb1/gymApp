import { describe, expect, it } from "vitest";

import { formatDate } from "./format";
import type { MemberReport, Plan, Subscription } from "./ipc";
import {
  EXPIRED_WINDOW_DAYS,
  canReviewDiscount,
  derivedMembershipStatus,
  discountedPriceCents,
  filterMemberReports,
  filterMemberships,
  filterReportSubscriptions,
  groupOperationalSubscriptions,
  membershipMember,
  membershipPlanPriceCents,
  renewConfirmationKey,
  renewalStartDate,
  renewalStartsTheNextDay,
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
  payment_method: null,
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

  it("collects partially paid memberships across every status except cancelled", () => {
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
    const cancelled = {
      ...subscription(5, 5, "cancelled", "2026-12-01"),
      paid_amount_cents: 1000,
      is_paid: false,
    };
    const rejected = {
      ...subscription(6, 6, "rejected", "2026-12-01"),
      paid_amount_cents: 1000,
      is_paid: false,
    };

    const groups = groupOperationalSubscriptions(
      [partialActive, partialOld, unpaid, paidInFull, cancelled, rejected],
      now,
    );

    expect(groups.partial.map(({ id }) => id)).toEqual([1, 2, 6]);
  });

  it("drops a cancelled membership from every operational bucket", () => {
    const cancelled = {
      ...subscription(1, 1, "cancelled", "2026-12-01"),
      paid_amount_cents: 1000,
      is_paid: false,
    };

    const groups = groupOperationalSubscriptions([cancelled], now);

    expect(groups.active).toEqual([]);
    expect(groups.expiring).toEqual([]);
    expect(groups.expired).toEqual([]);
    expect(groups.frozen).toEqual([]);
    expect(groups.partial).toEqual([]);
  });
});

describe("renewal start dates", () => {
  const now = new Date("2026-10-16T09:30:00Z");

  it("starts the day after the last day of a membership that is still current", () => {
    expect(
      renewalStartDate(subscription(1, 1, "active", "2026-12-01"), now),
    ).toBe("2026-12-02");
  });

  it("starts tomorrow when the membership's last day is today", () => {
    expect(
      renewalStartDate(subscription(1, 1, "active", "2026-10-16"), now),
    ).toBe("2026-10-17");
  });

  it("starts today when the membership already expired", () => {
    expect(
      renewalStartDate(subscription(1, 1, "active", "2026-10-01"), now),
    ).toBe("2026-10-16");
    expect(
      renewalStartsTheNextDay(subscription(1, 1, "active", "2026-10-01"), now),
    ).toBe(false);
  });

  it("never reuses the previous membership's last day", () => {
    const current = subscription(1, 1, "active", "2027-01-31");

    expect(renewalStartsTheNextDay(current, now)).toBe(true);
    expect(renewalStartDate(current, now) > current.end_date).toBe(true);
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

describe("membership lookup", () => {
  const now = new Date("2026-09-13T12:00:00Z");
  const first = subscription(12, 1, "active", "2026-10-30");
  const second = subscription(34, 2, "active", "2026-12-01");
  const rows = [first, second];

  it("derives the displayed status from the end date", () => {
    expect(derivedMembershipStatus(first, now)).toBe("active");
    expect(
      derivedMembershipStatus(subscription(5, 3, "active", "2026-09-01"), now),
    ).toBe("expired");
    expect(
      derivedMembershipStatus(
        subscription(6, 4, "cancelled", "2026-09-01"),
        now,
      ),
    ).toBe("cancelled");
  });

  it("finds a membership by its unique id, with or without the prefix", () => {
    expect(filterMemberships(rows, "#12", { now })).toEqual([first]);
    expect(filterMemberships(rows, "34", { now })).toEqual([second]);
    expect(filterMemberships(rows, "id 34", { now })).toEqual([second]);
    expect(filterMemberships(rows, "  ", { now })).toEqual(rows);
  });

  it("keeps a numeric query on the membership id alone", () => {
    const idFive = subscription(5, 3, "active", "2026-11-01");
    const planFive = {
      ...subscription(8, 4, "active", "2026-11-01"),
      plan_snapshot: { ...second.plan_snapshot, name: "plan 5" },
      member_snapshot: {
        ...second.member_snapshot,
        phone: "0500000005",
        id_number: "5",
      },
    };

    expect(filterMemberships([idFive, planFive], "5", { now })).toEqual([
      idFive,
    ]);
    expect(filterMemberships([idFive, planFive], "#5", { now })).toEqual([
      idFive,
    ]);
  });

  it("matches every plan term inside the plan name only", () => {
    const planTwo = {
      ...second,
      plan_snapshot: { ...second.plan_snapshot, name: "plan 2" },
    };
    const planOne = {
      ...first,
      plan_snapshot: { ...first.plan_snapshot, name: "plan 1" },
      member_snapshot: { ...first.member_snapshot, phone: "0500000002" },
    };
    const candidates = [planTwo, planOne];

    expect(filterMemberships(candidates, "plan 2", { now })).toEqual([planTwo]);
    expect(filterMemberships(candidates, "PLAN 2", { now })).toEqual([planTwo]);
    expect(filterMemberships(candidates, "plan", { now })).toEqual(candidates);
    expect(filterMemberships(candidates, "plan 3", { now })).toEqual([]);
  });

  it("finds a membership by start, end, or created date", () => {
    expect(filterMemberships(rows, "2026-10-30", { now })).toEqual([first]);
    expect(
      filterMemberships(rows, formatDate(second.end_date), { now }),
    ).toEqual([second]);
    expect(
      filterMemberships(rows, formatDate(second.created_at), { now }),
    ).toEqual([first, second]);
    expect(filterMemberships(rows, "2026", { now })).toEqual(rows);
  });

  it("matches a stored status or payment value without matching part of it", () => {
    const unpaid = { ...first, is_paid: false, paid_amount_cents: 0 };
    const partlyPaid = { ...first, is_paid: false, paid_amount_cents: 2000 };
    const candidates = [second, unpaid, partlyPaid];

    expect(filterMemberships(candidates, "paid", { now })).toEqual([second]);
    expect(filterMemberships(candidates, "unpaid", { now })).toEqual([unpaid]);
    expect(filterMemberships(candidates, "partial", { now })).toEqual([
      partlyPaid,
    ]);
  });

  it("matches a localized status label in the active language", () => {
    const expired = subscription(7, 3, "active", "2026-09-01");
    const labels = (membership: Subscription) => [
      derivedMembershipStatus(membership, now) === "expired" ? "منتهي" : "نشط",
    ];

    expect(
      filterMemberships([first, expired], "منتهي", { now, labels }),
    ).toEqual([expired]);
    expect(filterMemberships([first, expired], "نشط", { now, labels })).toEqual(
      [first],
    );
    expect(filterMemberships([first, expired], "منتهي", { now })).toEqual([]);
  });

  it("matches a diacritic-bearing label with plain typed letters", () => {
    const frozen = { ...first, status: "frozen" as const };
    const labels = () => ["مجمّد", "مدفوع جزئيًا"];

    expect(filterMemberships([frozen], "مجمد", { now, labels })).toEqual([
      frozen,
    ]);
    expect(filterMemberships([frozen], "مدفوع جزئيا", { now, labels })).toEqual(
      [frozen],
    );
    expect(filterMemberships([frozen], "مجمّ", { now, labels })).toEqual([]);
  });

  it("accepts an id query with a spoken prefix in either language", () => {
    expect(filterMemberships(rows, "معرف 12", { now })).toEqual([first]);
    expect(filterMemberships(rows, "معرف العضوية 12", { now })).toEqual([
      first,
    ]);
    expect(filterMemberships(rows, "plan 12", { now })).toEqual([]);
  });
});

describe("renewal confirmation", () => {
  it("warns that an expired membership starts over instead of staying active", () => {
    expect(
      renewConfirmationKey(subscription(1, 1, "active", "2026-12-01")),
    ).toBe("subscriptions.renewConfirm");
    expect(
      renewConfirmationKey(subscription(2, 2, "active", "2020-01-01")),
    ).toBe("subscriptions.renewConfirmExpired");
  });
});

describe("membership member details", () => {
  it("shows the member as they are recorded now", () => {
    const row = subscription(1, 1, "active", "2026-12-01");
    const renamed = {
      ...row,
      member: {
        ...row.member_snapshot,
        first_name: "Abdulsalam",
        phone: "0506787651",
        is_deleted: false,
        deleted_at: null,
        updated_at: "2026-10-14T00:00:00Z",
      },
    };

    expect(membershipMember(renamed).first_name).toBe("Abdulsalam");
    expect(membershipMember(renamed).phone).toBe("0506787651");
    expect(renamed.member_snapshot.first_name).toBe("Amina");
  });

  it("falls back to the stored snapshot when the member is not attached", () => {
    const row = subscription(1, 1, "active", "2026-12-01");

    expect(membershipMember(row)).toEqual(row.member_snapshot);
    expect(membershipMember({ ...row, member: null })).toEqual(
      row.member_snapshot,
    );
  });
});
