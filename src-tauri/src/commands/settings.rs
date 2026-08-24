use serde::Deserialize;
use tauri::State;

use crate::db::log_activity;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::Settings;

fn row_to_settings(row: &rusqlite::Row) -> rusqlite::Result<Settings> {
    Ok(Settings {
        gym_name: row.get("gym_name")?,
        gym_logo_path: row.get("gym_logo_path")?,
        gym_address: row.get("gym_address")?,
        gym_phone: row.get("gym_phone")?,
        language: row.get("language")?,
        theme: row.get("theme")?,
        session_timeout_minutes: row.get("session_timeout_minutes")?,
        auto_backup_enabled: row.get::<_, i64>("auto_backup_enabled")? != 0,
        last_backup_at: row.get("last_backup_at")?,
    })
}

#[tauri::command]
pub async fn get_settings(db: State<'_, Db>) -> AppResult<Settings> {
    db.with_conn(|conn| {
        conn.query_row("SELECT * FROM settings WHERE id = 1", [], row_to_settings)
            .map_err(AppError::Sqlite)
    })
}

#[derive(Deserialize)]
pub struct UpdateSettingsInput {
    pub gym_name: Option<String>,
    pub gym_logo_path: Option<String>,
    pub gym_address: Option<String>,
    pub gym_phone: Option<String>,
    pub language: Option<String>,
    pub theme: Option<String>,
    pub session_timeout_minutes: Option<i64>,
    pub auto_backup_enabled: Option<bool>,
}

#[tauri::command]
pub async fn update_settings(
    db: State<'_, Db>,
    actor_id: i64,
    input: UpdateSettingsInput,
) -> AppResult<Settings> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE settings SET
                gym_name = COALESCE(?1, gym_name),
                gym_logo_path = COALESCE(?2, gym_logo_path),
                gym_address = COALESCE(?3, gym_address),
                gym_phone = COALESCE(?4, gym_phone),
                language = COALESCE(?5, language),
                theme = COALESCE(?6, theme),
                session_timeout_minutes = COALESCE(?7, session_timeout_minutes),
                auto_backup_enabled = COALESCE(?8, auto_backup_enabled),
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = 1",
            rusqlite::params![
                input.gym_name,
                input.gym_logo_path,
                input.gym_address,
                input.gym_phone,
                input.language,
                input.theme,
                input.session_timeout_minutes,
                input.auto_backup_enabled.map(|b| b as i64),
            ],
        )?;
        log_activity(
            conn,
            actor_id,
            "settings.update",
            Some("settings"),
            None,
            None,
        )?;
        conn.query_row("SELECT * FROM settings WHERE id = 1", [], row_to_settings)
            .map_err(AppError::Sqlite)
    })
}
