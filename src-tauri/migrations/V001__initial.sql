-- V001: Initial schema for GymApp v1
-- 7 tables + 1 FTS5 virtual table + 3 sync triggers + indexes + seed data

-- =============================================================================
-- 1. branches (v2 multi-branch stub — v1 ships with one "Main Branch" row)
-- =============================================================================
CREATE TABLE branches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- =============================================================================
-- 2. users (flat — no roles in v1; argon2 PIN hash)
-- =============================================================================
CREATE TABLE users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    pin_hash       TEXT    NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    last_login_at   TEXT,
    branch_id       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================================================
-- 3. members (soft-delete via is_deleted; gender kept but hidden in v1 UI)
-- =============================================================================
CREATE TABLE members (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name      TEXT    NOT NULL,
    last_name       TEXT    NOT NULL,
    phone           TEXT,
    email           TEXT,
    gender          TEXT    CHECK (gender IN ('male', 'female')),
    birth_date      TEXT,
    photo_path      TEXT,
    is_deleted      INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)),
    deleted_at      TEXT,
    branch_id       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_members_is_deleted ON members(is_deleted) WHERE is_deleted = 0;
CREATE INDEX idx_members_phone ON members(phone);
CREATE INDEX idx_members_branch ON members(branch_id);

-- =============================================================================
-- 4. plans (no allowed_entries in v1; price stored as INTEGER cents)
-- =============================================================================
CREATE TABLE plans (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    duration_days   INTEGER NOT NULL CHECK (duration_days > 0),
    price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    branch_id       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_plans_active ON plans(is_active) WHERE is_active = 1;

-- =============================================================================
-- 5. subscriptions (no remaining_sessions, no notes in v1; 'expired' is derived)
-- =============================================================================
CREATE TABLE subscriptions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id       INTEGER NOT NULL,
    plan_id         INTEGER NOT NULL,
    start_date      TEXT    NOT NULL,
    end_date        TEXT    NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'frozen', 'cancelled')),
    frozen_until    TEXT,
    is_paid         INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0, 1)),
    branch_id       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (member_id) REFERENCES members(id),
    FOREIGN KEY (plan_id)   REFERENCES plans(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE INDEX idx_subs_member ON subscriptions(member_id);
CREATE INDEX idx_subs_end_date ON subscriptions(end_date);
CREATE INDEX idx_subs_status ON subscriptions(status);

-- =============================================================================
-- 6. activity_logs (audit trail — append-only, no updated_at)
-- =============================================================================
CREATE TABLE activity_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    action          TEXT    NOT NULL,
    target_type     TEXT,
    target_id       INTEGER,
    details         TEXT,
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_created ON activity_logs(created_at);
CREATE INDEX idx_activity_action ON activity_logs(action);
CREATE INDEX idx_activity_target ON activity_logs(target_type, target_id);

-- =============================================================================
-- 7. settings (singleton — one row, id = 1; no setup_complete flag)
-- =============================================================================
CREATE TABLE settings (
    id                          INTEGER PRIMARY KEY CHECK (id = 1),
    gym_name                    TEXT,
    gym_logo_path               TEXT,
    gym_address                 TEXT,
    gym_phone                   TEXT,
    language                    TEXT    NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
    theme                       TEXT    NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    session_timeout_minutes     INTEGER NOT NULL DEFAULT 10 CHECK (session_timeout_minutes > 0),
    auto_backup_enabled         INTEGER NOT NULL DEFAULT 1 CHECK (auto_backup_enabled IN (0, 1)),
    last_backup_at              TEXT,
    branch_id                   INTEGER NOT NULL DEFAULT 1,
    updated_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- =============================================================================
-- 8. member_flags (separate table — queryable; flag list CHECK-constrained)
-- =============================================================================
CREATE TABLE member_flags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id   INTEGER NOT NULL,
    flag        TEXT    NOT NULL CHECK (flag IN ('medical', 'vip', 'owes_money', 'no_renewal', 'guest', 'staff')),
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (member_id) REFERENCES members(id),
    UNIQUE (member_id, flag)
);

CREATE INDEX idx_flags_flag ON member_flags(flag);

-- =============================================================================
-- 9. members_fts (FTS5 virtual table — syncs first_name, last_name, phone)
-- =============================================================================
CREATE VIRTUAL TABLE members_fts USING fts5(
    first_name,
    last_name,
    phone,
    content='members',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

-- Triggers to keep FTS in sync (external content table pattern)
CREATE TRIGGER members_ai AFTER INSERT ON members BEGIN
    INSERT INTO members_fts(rowid, first_name, last_name, phone)
    VALUES (new.id, new.first_name, new.last_name, new.phone);
END;

CREATE TRIGGER members_ad AFTER DELETE ON members BEGIN
    INSERT INTO members_fts(members_fts, rowid, first_name, last_name, phone)
    VALUES ('delete', old.id, old.first_name, old.last_name, old.phone);
END;

CREATE TRIGGER members_au AFTER UPDATE ON members BEGIN
    INSERT INTO members_fts(members_fts, rowid, first_name, last_name, phone)
    VALUES ('delete', old.id, old.first_name, old.last_name, old.phone);
    INSERT INTO members_fts(rowid, first_name, last_name, phone)
    VALUES (new.id, new.first_name, new.last_name, new.phone);
END;

-- =============================================================================
-- Seeds
-- =============================================================================
INSERT INTO branches (id, name, is_active) VALUES (1, 'Main Branch', 1);
INSERT INTO settings (id, gym_name, language, theme) VALUES (1, NULL, 'ar', 'dark');
