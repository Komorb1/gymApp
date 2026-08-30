DROP TRIGGER IF EXISTS members_ai;
DROP TRIGGER IF EXISTS members_ad;
DROP TRIGGER IF EXISTS members_au;
DROP TABLE IF EXISTS members_fts;

ALTER TABLE users RENAME TO users_legacy;
ALTER TABLE members RENAME TO members_legacy;
ALTER TABLE plans RENAME TO plans_legacy;

CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    pin_hash        TEXT    NOT NULL,
    access_level    TEXT    NOT NULL DEFAULT 'staff'
                    CHECK (access_level IN ('management', 'staff')),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    last_login_at   TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO users (
    id, username, pin_hash, access_level, is_active, last_login_at, created_at, updated_at
)
SELECT id, username, pin_hash, 'management', is_active, last_login_at, created_at, updated_at
FROM users_legacy;

CREATE TABLE members (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name      TEXT    NOT NULL CHECK (length(trim(first_name)) > 0),
    middle_name     TEXT,
    last_name       TEXT    NOT NULL DEFAULT '',
    id_number       TEXT,
    phone           TEXT    NOT NULL CHECK (length(trim(phone)) > 0),
    whatsapp_no     TEXT,
    email           TEXT,
    birth_date      TEXT,
    notes           TEXT,
    photo_path      TEXT,
    is_deleted      INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO members (
    id, first_name, middle_name, last_name, id_number, phone, whatsapp_no,
    email, birth_date, notes, photo_path, is_deleted, deleted_at, created_at, updated_at
)
SELECT
    id,
    CASE WHEN length(trim(first_name)) > 0 THEN trim(first_name) ELSE 'Unknown' END,
    NULL,
    COALESCE(last_name, ''),
    NULL,
    CASE
        WHEN phone IS NOT NULL AND length(trim(phone)) > 0 THEN trim(phone)
        ELSE 'MISSING-' || id
    END,
    NULL,
    email,
    birth_date,
    NULL,
    photo_path,
    is_deleted,
    deleted_at,
    created_at,
    updated_at
FROM members_legacy;

CREATE TABLE plans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    duration_days   INTEGER NOT NULL CHECK (duration_days > 0),
    price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO plans (
    id, name, duration_days, price_cents, is_active, created_at, updated_at
)
SELECT id, name, duration_days, price_cents, is_active, created_at, updated_at
FROM plans_legacy;

CREATE TABLE subscriptions_v2 (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id               INTEGER NOT NULL,
    plan_id                 INTEGER NOT NULL,
    member_snapshot_json    TEXT    NOT NULL CHECK (json_valid(member_snapshot_json)),
    plan_snapshot_json      TEXT    NOT NULL CHECK (json_valid(plan_snapshot_json)),
    start_date              TEXT    NOT NULL,
    end_date                TEXT    NOT NULL,
    status                  TEXT    NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'frozen', 'cancelled')),
    frozen_at               TEXT,
    frozen_until            TEXT,
    paid_amount_cents       INTEGER NOT NULL DEFAULT 0 CHECK (paid_amount_cents >= 0),
    notes                   TEXT,
    created_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at              TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (plan_id)   REFERENCES plans(id)
);

INSERT INTO subscriptions_v2 (
    id, member_id, plan_id, member_snapshot_json, plan_snapshot_json,
    start_date, end_date, status, frozen_at, frozen_until,
    paid_amount_cents, notes, created_at, updated_at
)
SELECT
    s.id,
    s.member_id,
    s.plan_id,
    json_object(
        'id', m.id,
        'first_name', CASE
            WHEN length(trim(m.first_name)) > 0 THEN trim(m.first_name)
            ELSE 'Unknown'
        END,
        'middle_name', NULL,
        'last_name', m.last_name,
        'id_number', NULL,
        'phone', CASE
            WHEN m.phone IS NOT NULL AND length(trim(m.phone)) > 0 THEN trim(m.phone)
            ELSE 'MISSING-' || m.id
        END,
        'whatsapp_no', NULL,
        'email', m.email,
        'birth_date', m.birth_date,
        'notes', NULL,
        'photo_path', m.photo_path,
        'created_at', m.created_at
    ),
    json_object(
        'id', p.id,
        'name', p.name,
        'duration_days', p.duration_days,
        'price_cents', p.price_cents
    ),
    s.start_date,
    s.end_date,
    s.status,
    CASE WHEN s.status = 'frozen' THEN s.updated_at ELSE NULL END,
    s.frozen_until,
    CASE WHEN s.is_paid = 1 THEN p.price_cents ELSE 0 END,
    NULL,
    s.created_at,
    s.updated_at
FROM subscriptions s
JOIN members_legacy m ON m.id = s.member_id
JOIN plans_legacy p ON p.id = s.plan_id;

CREATE TABLE activity_logs_v2 (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    action          TEXT    NOT NULL,
    target_type     TEXT,
    target_id       INTEGER,
    before_details  TEXT,
    after_details   TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO activity_logs_v2 (
    id, user_id, action, target_type, target_id, before_details, after_details, created_at
)
SELECT id, user_id, action, target_type, target_id, NULL, details, created_at
FROM activity_logs;

CREATE TABLE settings_v2 (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    gym_name        TEXT,
    gym_address     TEXT,
    gym_phone       TEXT,
    language        TEXT    NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
    theme           TEXT    NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO settings_v2 (
    id, gym_name, gym_address, gym_phone, language, theme, updated_at
)
SELECT id, gym_name, gym_address, gym_phone, language, theme, updated_at
FROM settings;

CREATE TABLE member_flags_v2 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL,
    flag        TEXT    NOT NULL CHECK (flag IN ('medical', 'vip', 'owes_money', 'no_renewal', 'guest', 'staff')),
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (member_id) REFERENCES members(id),
    UNIQUE (member_id, flag)
);

INSERT INTO member_flags_v2 (id, member_id, flag, note, created_at)
SELECT id, member_id, flag, note, created_at
FROM member_flags;

DROP TABLE activity_logs;
DROP TABLE member_flags;
DROP TABLE subscriptions;
DROP TABLE settings;
DROP TABLE plans_legacy;
DROP TABLE members_legacy;
DROP TABLE users_legacy;
DROP TABLE branches;

ALTER TABLE subscriptions_v2 RENAME TO subscriptions;
ALTER TABLE activity_logs_v2 RENAME TO activity_logs;
ALTER TABLE settings_v2 RENAME TO settings;
ALTER TABLE member_flags_v2 RENAME TO member_flags;

CREATE INDEX idx_members_is_deleted ON members(is_deleted) WHERE is_deleted = 0;
CREATE INDEX idx_members_phone ON members(phone);
CREATE INDEX idx_members_whatsapp ON members(whatsapp_no);
CREATE INDEX idx_members_id_number ON members(id_number);
CREATE INDEX idx_plans_active ON plans(is_active) WHERE is_active = 1;
CREATE INDEX idx_subs_member ON subscriptions(member_id);
CREATE INDEX idx_subs_end_date ON subscriptions(end_date);
CREATE INDEX idx_subs_status ON subscriptions(status);
CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at);
CREATE INDEX idx_activity_action ON activity_logs(action);
CREATE INDEX idx_activity_target ON activity_logs(target_type, target_id);
CREATE INDEX idx_flags_flag ON member_flags(flag);

CREATE VIRTUAL TABLE members_fts USING fts5(
    first_name,
    middle_name,
    last_name,
    phone,
    whatsapp_no,
    id_number,
    content='members',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER members_ai AFTER INSERT ON members BEGIN
    INSERT INTO members_fts(rowid, first_name, middle_name, last_name, phone, whatsapp_no, id_number)
    VALUES (new.id, new.first_name, new.middle_name, new.last_name, new.phone, new.whatsapp_no, new.id_number);
END;

CREATE TRIGGER members_ad AFTER DELETE ON members BEGIN
    INSERT INTO members_fts(members_fts, rowid, first_name, middle_name, last_name, phone, whatsapp_no, id_number)
    VALUES ('delete', old.id, old.first_name, old.middle_name, old.last_name, old.phone, old.whatsapp_no, old.id_number);
END;

CREATE TRIGGER members_au AFTER UPDATE ON members BEGIN
    INSERT INTO members_fts(members_fts, rowid, first_name, middle_name, last_name, phone, whatsapp_no, id_number)
    VALUES ('delete', old.id, old.first_name, old.middle_name, old.last_name, old.phone, old.whatsapp_no, old.id_number);
    INSERT INTO members_fts(rowid, first_name, middle_name, last_name, phone, whatsapp_no, id_number)
    VALUES (new.id, new.first_name, new.middle_name, new.last_name, new.phone, new.whatsapp_no, new.id_number);
END;

INSERT INTO members_fts(rowid, first_name, middle_name, last_name, phone, whatsapp_no, id_number)
SELECT id, first_name, middle_name, last_name, phone, whatsapp_no, id_number
FROM members;
