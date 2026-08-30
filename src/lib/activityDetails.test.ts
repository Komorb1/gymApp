import { describe, expect, it } from "vitest";

import { activityChanges } from "./activityDetails";

describe("activity change details", () => {
  it("shows only meaningful fields that changed", () => {
    const before = JSON.stringify({
      id: 7,
      first_name: "Ali",
      phone: "0500000000",
      notes: null,
      updated_at: "2026-01-01T00:00:00Z",
    });
    const after = JSON.stringify({
      id: 7,
      first_name: "Ali",
      phone: "0511111111",
      notes: "VIP",
      updated_at: "2026-01-02T00:00:00Z",
    });

    expect(activityChanges(before, after)).toEqual([
      { field: "phone", before: "0500000000", after: "0511111111" },
      { field: "notes", before: null, after: "VIP" },
    ]);
  });

  it("turns subscription snapshots into readable member and plan fields", () => {
    const after = JSON.stringify({
      id: 3,
      member_snapshot: {
        first_name: "Sara",
        middle_name: null,
        last_name: "Ahmed",
        phone: "0522222222",
      },
      plan_snapshot: { name: "Monthly", price_cents: 5000 },
      discount_percent: 10,
      is_paid: false,
    });

    expect(activityChanges(null, after)).toEqual([
      { field: "member", before: null, after: "Sara Ahmed" },
      { field: "phone", before: null, after: "0522222222" },
      { field: "plan", before: null, after: "Monthly" },
      { field: "price_cents", before: null, after: 5000 },
      { field: "discount_percent", before: null, after: 10 },
      { field: "is_paid", before: null, after: false },
    ]);
  });

  it("uses the new membership when rendering renewal details", () => {
    const before = JSON.stringify({
      start_date: "2026-01-01",
      end_date: "2026-02-01",
    });
    const after = JSON.stringify({
      previous_membership: { status: "cancelled" },
      new_membership: { start_date: "2026-02-01", end_date: "2026-03-01" },
    });

    expect(activityChanges(before, after)).toEqual([
      { field: "start_date", before: "2026-01-01", after: "2026-02-01" },
      { field: "end_date", before: "2026-02-01", after: "2026-03-01" },
    ]);
  });
});
