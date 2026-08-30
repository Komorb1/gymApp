ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_owner IN (0, 1));

UPDATE users
SET is_owner = 1
WHERE id = (SELECT MIN(id) FROM users);

CREATE UNIQUE INDEX idx_users_single_owner ON users(is_owner) WHERE is_owner = 1;

ALTER TABLE subscriptions ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0
    CHECK (discount_percent BETWEEN 0 AND 100);

UPDATE subscriptions
SET paid_amount_cents = CAST(json_extract(plan_snapshot_json, '$.price_cents') AS INTEGER);

UPDATE members SET whatsapp_no = phone;

UPDATE subscriptions
SET member_snapshot_json = json_set(
    member_snapshot_json,
    '$.whatsapp_no',
    json_extract(member_snapshot_json, '$.phone')
);
