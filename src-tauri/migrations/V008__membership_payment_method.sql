ALTER TABLE subscriptions ADD COLUMN payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'bank_transfer'));
