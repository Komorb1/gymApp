ALTER TABLE users ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0
    CHECK (is_deleted IN (0, 1));

ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE INDEX idx_users_is_deleted ON users(is_deleted) WHERE is_deleted = 0;

ALTER TABLE subscriptions ADD COLUMN final_price_cents INTEGER NOT NULL DEFAULT 0
    CHECK (final_price_cents >= 0);

UPDATE subscriptions
SET final_price_cents = paid_amount_cents,
    paid_amount_cents = CASE WHEN is_paid = 1 THEN paid_amount_cents ELSE 0 END;
