use serde::Serialize;
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;
use crate::session::{require_user, Sessions};

#[derive(Debug, Clone, Serialize)]
pub struct ActivityLog {
    pub id: i64,
    pub user_id: i64,
    pub username: String,
    pub action: String,
    pub target_type: Option<String>,
    pub target_id: Option<i64>,
    pub before_details: Option<String>,
    pub after_details: Option<String>,
    pub created_at: String,
}

fn row_to_log(row: &rusqlite::Row) -> rusqlite::Result<ActivityLog> {
    Ok(ActivityLog {
        id: row.get("id")?,
        user_id: row.get("user_id")?,
        username: row
            .get("username")
            .unwrap_or_else(|_| "unknown".to_string()),
        action: row.get("action")?,
        target_type: row.get("target_type")?,
        target_id: row.get("target_id")?,
        before_details: row.get("before_details")?,
        after_details: row.get("after_details")?,
        created_at: row.get("created_at")?,
    })
}

#[tauri::command]
pub async fn list_activity_logs(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    limit: Option<i64>,
) -> AppResult<Vec<ActivityLog>> {
    let limit = limit.unwrap_or(100).clamp(1, 500);
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let mut statement = conn.prepare(
            "SELECT a.*, u.username FROM activity_logs a
             LEFT JOIN users u ON u.id = a.user_id
             WHERE NOT (
                 a.action = 'settings.update'
                 AND COALESCE(json_extract(a.before_details, '$.gym_name'), '') = COALESCE(json_extract(a.after_details, '$.gym_name'), '')
                 AND COALESCE(json_extract(a.before_details, '$.gym_address'), '') = COALESCE(json_extract(a.after_details, '$.gym_address'), '')
                 AND COALESCE(json_extract(a.before_details, '$.gym_phone'), '') = COALESCE(json_extract(a.after_details, '$.gym_phone'), '')
             )
             ORDER BY a.created_at DESC LIMIT ?1",
        )?;
        let logs = statement
            .query_map(rusqlite::params![limit], row_to_log)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(logs)
    })
}
