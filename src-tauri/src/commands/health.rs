use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

#[derive(Serialize)]
pub struct DbHealth {
    pub branches_count: i64,
    pub settings_exists: bool,
    pub users_count: i64,
    pub members_count: i64,
    pub plans_count: i64,
    pub db_version: String,
}

#[tauri::command]
pub async fn db_health(db: State<'_, Db>) -> AppResult<DbHealth> {
    db.with_conn(|conn| {
        let branches_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM branches", [], |row| row.get(0))?;
        let settings_exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM settings WHERE id = 1",
            [],
            |row| row.get(0),
        )?;
        let users_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        let members_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM members WHERE is_deleted = 0",
            [],
            |row| row.get(0),
        )?;
        let plans_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM plans", [], |row| row.get(0))?;
        let db_version: String = conn.query_row("SELECT sqlite_version()", [], |row| row.get(0))?;
        Ok(DbHealth {
            branches_count,
            settings_exists,
            users_count,
            members_count,
            plans_count,
            db_version,
        })
    })
}
