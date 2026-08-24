use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize)]
pub struct ActivityLog {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub action: String,
    pub target_type: Option<String>,
    pub target_id: Option<i64>,
    pub details: Option<String>,
    pub created_at: String,
}

fn row_to_log(row: &rusqlite::Row) -> rusqlite::Result<ActivityLog> {
    Ok(ActivityLog {
        id: row.get("id")?,
        user_id: row.get("user_id")?,
        username: row.get("username").unwrap_or_else(|_| "unknown".into()),
        action: row.get("action")?,
        target_type: row.get("target_type")?,
        target_id: row.get("target_id")?,
        details: row.get("details")?,
        created_at: row.get("created_at")?,
    })
}

#[tauri::command]
pub async fn list_activity_logs(
    db: State<'_, Db>,
    limit: Option<i64>,
) -> AppResult<Vec<ActivityLog>> {
    let limit = limit.unwrap_or(100).min(500);
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT a.*, u.username FROM activity_logs a \
             LEFT JOIN users u ON u.id = a.user_id \
             ORDER BY a.created_at DESC LIMIT ?1",
        )?;
        let logs = stmt
            .query_map(rusqlite::params![limit], row_to_log)?
            .map(|r| r.unwrap())
            .collect();
        Ok(logs)
    })
}
