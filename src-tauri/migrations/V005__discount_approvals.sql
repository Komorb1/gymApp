CREATE TABLE subscriptions_v5 (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id                       INTEGER NOT NULL,
    plan_id                         INTEGER NOT NULL,
    member_snapshot_json            TEXT    NOT NULL CHECK (json_valid(member_snapshot_json)),
    plan_snapshot_json              TEXT    NOT NULL CHECK (json_valid(plan_snapshot_json)),
    start_date                      TEXT    NOT NULL,
    end_date                        TEXT    NOT NULL,
    status                          TEXT    NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'frozen', 'cancelled', 'pending', 'rejected')),
    frozen_at                       TEXT,
    frozen_until                    TEXT,
    paid_amount_cents               INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount_cents >= 0),
    notes                           TEXT,
    created_at                      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at                      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    discount_percent                INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
    is_paid                         INTEGER NOT NULL DEFAULT 1 CHECK (is_paid IN (0, 1)),
    discount_requested_by_user_id   INTEGER,
    discount_approval_status        TEXT CHECK (discount_approval_status IN ('pending', 'approved', 'rejected')),
    discount_reviewed_by_user_id    INTEGER,
    discount_reviewed_at            TEXT,
    renews_subscription_id          INTEGER,
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id),
    FOREIGN KEY (discount_requested_by_user_id) REFERENCES users(id),
    FOREIGN KEY (discount_reviewed_by_user_id) REFERENCES users(id),
    FOREIGN KEY (renews_subscription_id) REFERENCES subscriptions_v5(id)
);

INSERT INTO subscriptions_v5 (
    id, member_id, plan_id, member_snapshot_json, plan_snapshot_json,
    start_date, end_date, status, frozen_at, frozen_until,
    paid_amount_cents, notes, created_at, updated_at, discount_percent, is_paid
)
SELECT
    id, member_id, plan_id, member_snapshot_json, plan_snapshot_json,
    start_date, end_date, status, frozen_at, frozen_until,
    paid_amount_cents, notes, created_at, updated_at, discount_percent, is_paid
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_v5 RENAME TO subscriptions;

CREATE INDEX idx_subs_member ON subscriptions(member_id);
CREATE INDEX idx_subs_end_date ON subscriptions(end_date);
CREATE INDEX idx_subs_status ON subscriptions(status);
CREATE INDEX idx_subs_discount_requester ON subscriptions(discount_requested_by_user_id);
CREATE INDEX idx_subs_discount_approval ON subscriptions(discount_approval_status);
CREATE INDEX idx_subs_renews_subscription ON subscriptions(renews_subscription_id);
