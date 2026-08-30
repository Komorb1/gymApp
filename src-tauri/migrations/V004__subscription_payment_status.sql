ALTER TABLE subscriptions ADD COLUMN is_paid INTEGER NOT NULL DEFAULT 1
    CHECK (is_paid IN (0, 1));
