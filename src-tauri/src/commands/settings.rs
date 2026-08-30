use serde::Deserialize;
use tauri::State;

use crate::db::{log_activity, Db};
use crate::error::{AppError, AppResult};
use crate::models::{deserialize_nullable, Settings};
use crate::session::{require_management, Sessions};

fn row_to_settings(row: &rusqlite::Row) -> rusqlite::Result<Settings> {
    Ok(Settings {
        gym_name: row.get("gym_name")?,
        gym_address: row.get("gym_address")?,
        gym_phone: row.get("gym_phone")?,
        language: row.get("language")?,
        theme: row.get("theme")?,
    })
}

fn settings(conn: &rusqlite::Connection) -> AppResult<Settings> {
    conn.query_row("SELECT * FROM settings WHERE id = 1", [], row_to_settings)
        .map_err(AppError::Sqlite)
}

#[tauri::command]
pub async fn get_settings(db: State<'_, Db>) -> AppResult<Settings> {
    db.with_conn(|conn| settings(conn))
}

#[derive(Deserialize)]
pub struct UpdateSettingsInput {
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub gym_name: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub gym_address: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub gym_phone: Option<Option<String>>,
    pub language: Option<String>,
    pub theme: Option<String>,
}

#[tauri::command]
pub async fn update_settings(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: UpdateSettingsInput,
) -> AppResult<Settings> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = settings(&transaction)?;
        let gym_name = input.gym_name.unwrap_or_else(|| before.gym_name.clone());
        let gym_address = input
            .gym_address
            .unwrap_or_else(|| before.gym_address.clone());
        let gym_phone = input.gym_phone.unwrap_or_else(|| before.gym_phone.clone());
        let language = input
            .language
            .unwrap_or_else(|| before.language.clone());
        let theme = input.theme.unwrap_or_else(|| before.theme.clone());
        if !matches!(language.as_str(), "ar" | "en") {
            return Err(AppError::Validation("Invalid language".into()));
        }
        if !matches!(theme.as_str(), "dark" | "light") {
            return Err(AppError::Validation("Invalid theme".into()));
        }
        transaction.execute(
            "UPDATE settings SET
                gym_name = ?1,
                gym_address = ?2,
                gym_phone = ?3,
                language = ?4,
                theme = ?5,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = 1",
            rusqlite::params![gym_name, gym_address, gym_phone, language, theme],
        )?;
        let after = settings(&transaction)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&after)?;
        log_activity(
            &transaction,
            actor_id,
            "settings.update",
            Some("settings"),
            Some(1),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(after)
    })
}

#[cfg(test)]
mod tests {
    use super::UpdateSettingsInput;

    #[test]
    fn settings_patch_distinguishes_missing_and_null_fields() {
        let partial: UpdateSettingsInput =
            serde_json::from_str(r#"{"language":"en"}"#).unwrap();
        let cleared: UpdateSettingsInput =
            serde_json::from_str(r#"{"gym_phone":null}"#).unwrap();

        assert_eq!(partial.gym_name, None);
        assert_eq!(partial.language.as_deref(), Some("en"));
        assert_eq!(cleared.gym_phone, Some(None));
    }
}
