use std::sync::Mutex;

use refinery::embed_migrations;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

embed_migrations!("migrations");

pub struct Db(pub Mutex<Connection>);

pub fn init(app: &AppHandle) -> AppResult<Db> {
    let app_data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("gymapp.db");

    let mut conn = Connection::open(&db_path)?;

    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 5000;",
    )?;

    let migration_report = migrations::runner()
        .run(&mut conn)
        .map_err(|e| AppError::Migration(e.to_string()))?;

    let applied = migration_report.applied_migrations();
    if !applied.is_empty() {
        eprintln!("[db] applied {} migration(s): {:?}", applied.len(), applied);
    }

    auto_unfreeze(&conn)?;

    Ok(Db(Mutex::new(conn)))
}

fn auto_unfreeze(conn: &Connection) -> AppResult<()> {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let affected = conn.execute(
        "UPDATE subscriptions SET \
            status = 'active', \
            end_date = date(end_date, '+' || MAX(0, CAST(julianday(frozen_until) - julianday(date(frozen_at)) AS INTEGER)) || ' days'), \
            frozen_at = NULL, \
            frozen_until = NULL, \
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') \
         WHERE status = 'frozen' AND frozen_at IS NOT NULL AND frozen_until IS NOT NULL AND frozen_until <= ?1",
        rusqlite::params![today],
    )?;
    if affected > 0 {
        eprintln!("[db] auto-unfroze {} subscription(s)", affected);
    }
    Ok(())
}

impl Db {
    pub fn with_conn<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&mut Connection) -> AppResult<T>,
    {
        let mut guard = self
            .0
            .lock()
            .map_err(|e| AppError::Io(std::io::Error::other(e.to_string())))?;
        // Ensure foreign_keys pragma is set on this thread
        guard.execute_batch("PRAGMA foreign_keys = ON;")?;
        f(&mut guard)
    }
}

pub fn log_activity(
    conn: &Connection,
    user_id: i64,
    action: &str,
    target_type: Option<&str>,
    target_id: Option<i64>,
    before_details: Option<&str>,
    after_details: Option<&str>,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO activity_logs (user_id, action, target_type, target_id, before_details, after_details) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            user_id,
            action,
            target_type,
            target_id,
            before_details,
            after_details
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use rusqlite::Connection;

    fn test_db() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::runner().run(&mut conn).unwrap();
        conn
    }

    #[test]
    fn migration_creates_all_tables() {
        let conn = test_db();
        let tables: Vec<String> = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        for expected in [
            "users",
            "members",
            "plans",
            "subscriptions",
            "activity_logs",
            "settings",
            "member_flags",
        ] {
            assert!(
                tables.contains(&expected.to_string()),
                "missing table: {expected}"
            );
        }
    }

    #[test]
    fn members_fts_virtual_table_exists() {
        let conn = test_db();
        let fts_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master \
                 WHERE type='table' AND name='members_fts'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(fts_exists, "members_fts virtual table missing");
    }

    #[test]
    fn branch_scaffolding_is_removed() {
        let conn = test_db();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'branches'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn seed_settings_singleton_exists() {
        let conn = test_db();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let (id, language, theme): (i64, String, String) = conn
            .query_row(
                "SELECT id, language, theme FROM settings WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(id, 1);
        assert_eq!(language, "ar");
        assert_eq!(theme, "dark");
    }

    #[test]
    fn fts_search_finds_member_by_name() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone) \
             VALUES ('Ahmed', 'Ali', '+1234567890')",
            [],
        )
        .unwrap();
        let results: Vec<String> = conn
            .prepare(
                "SELECT m.first_name FROM members_fts f \
                 JOIN members m ON m.id = f.rowid \
                 WHERE members_fts MATCH 'ahmed' AND m.is_deleted = 0",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0], "Ahmed");
    }

    #[test]
    fn fts_search_finds_member_by_phone() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone) \
             VALUES ('Sara', 'Hassan', '+9876543210')",
            [],
        )
        .unwrap();
        // FTS5 prefix query: tokens starting with '9876' match '9876543210'
        let results: Vec<String> = conn
            .prepare(
                "SELECT m.first_name FROM members_fts f \
                 JOIN members m ON m.id = f.rowid \
                 WHERE members_fts MATCH '9876*' AND m.is_deleted = 0",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0], "Sara");
    }

    #[test]
    fn fts_excludes_soft_deleted_members() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone, is_deleted) \
             VALUES ('Deleted', 'User', '+1111', 1)",
            [],
        )
        .unwrap();
        let results: Vec<String> = conn
            .prepare(
                "SELECT m.first_name FROM members_fts f \
                 JOIN members m ON m.id = f.rowid \
                 WHERE members_fts MATCH 'deleted' AND m.is_deleted = 0",
            )
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();
        assert!(
            results.is_empty(),
            "soft-deleted member should be filtered out"
        );
    }

    #[test]
    fn foreign_keys_enforced() {
        let conn = test_db();
        let result = conn.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json, start_date, end_date
             ) VALUES (999, 999, '{}', '{}', '2026-01-01', '2026-02-01')",
            [],
        );
        assert!(
            result.is_err(),
            "FK should block insert with non-existent member/plan"
        );
    }

    #[test]
    fn check_constraints_enforced() {
        let conn = test_db();
        let r1 = conn.execute(
            "INSERT INTO members (first_name, last_name, phone) VALUES ('', 'B', '')",
            [],
        );
        assert!(r1.is_err(), "first name and phone should be required");

        conn.execute(
            "INSERT INTO members (first_name, last_name, phone) VALUES ('Test', 'Member', '123')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO plans (name, duration_days, price_cents) \
             VALUES ('Test Plan', 30, 5000)",
            [],
        )
        .unwrap();
        let r2 = conn.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, status
             ) VALUES (1, 1, '{}', '{}', '2026-01-01', '2026-02-01', 'expired')",
            [],
        );
        assert!(
            r2.is_err(),
            "status='expired' should violate CHECK (status must be derived, not stored)"
        );
    }

    #[test]
    fn cascade_soft_delete_keeps_subscriptions() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone) VALUES ('Soft', 'Delete', '123')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO plans (name, duration_days, price_cents) \
             VALUES ('Monthly', 30, 5000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json, start_date, end_date
             ) VALUES (1, 1, '{}', '{}', '2026-01-01', '2026-02-01')",
            [],
        )
        .unwrap();
        // Soft-delete the member (no hard DELETE)
        conn.execute(
            "UPDATE members SET is_deleted = 1, deleted_at = '2026-08-24T00:00:00Z' WHERE id = 1",
            [],
        )
        .unwrap();
        let sub_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM subscriptions WHERE member_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            sub_count, 1,
            "subscriptions should survive soft-delete of member"
        );
    }

    #[test]
    fn updated_at_default_works() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone) VALUES ('Time', 'Stamp', '123')",
            [],
        )
        .unwrap();
        let created_at: String = conn
            .query_row("SELECT created_at FROM members WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(
            created_at.contains('T') && created_at.ends_with('Z'),
            "created_at should be ISO 8601 UTC, got: {created_at}"
        );
    }
}
