ALTER TABLE settings ADD COLUMN backup_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (backup_enabled IN (0, 1));
ALTER TABLE settings ADD COLUMN backup_time TEXT NOT NULL DEFAULT '20:00';
ALTER TABLE settings ADD COLUMN backup_folder TEXT;
ALTER TABLE settings ADD COLUMN last_backup_at TEXT;
ALTER TABLE settings ADD COLUMN last_backup_error TEXT;
