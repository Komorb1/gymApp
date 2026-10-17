ALTER TABLE subscriptions ADD COLUMN discount_amount_cents INTEGER NOT NULL DEFAULT 0
    CHECK (discount_amount_cents >= 0);
