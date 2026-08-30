use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::Deserialize;
use tauri::State;

use crate::db::{log_activity, Db};
use crate::error::{AppError, AppResult};
use crate::models::{AuthSession, SetupStatus, User};
use crate::session::{require_management, Sessions};

fn hash_pin(pin: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|error| AppError::Auth(error.to_string()))?;
    Ok(hash.to_string())
}

fn verify_pin(pin: &str, encoded: &str) -> bool {
    PasswordHash::new(encoded)
        .ok()
        .and_then(|parsed| {
            Argon2::default()
                .verify_password(pin.as_bytes(), &parsed)
                .ok()
        })
        .is_some()
}

fn validate_credentials(username: &str, pin: &str) -> AppResult<()> {
    if username.trim().is_empty() {
        return Err(AppError::Validation("Username is required".into()));
    }
    if !(4..=6).contains(&pin.len()) || !pin.chars().all(|character| character.is_ascii_digit()) {
        return Err(AppError::Validation(
            "PIN must contain 4 to 6 digits".into(),
        ));
    }
    Ok(())
}

fn validate_access_level(access_level: &str) -> AppResult<()> {
    if matches!(access_level, "management" | "staff") {
        Ok(())
    } else {
        Err(AppError::Validation("Invalid access level".into()))
    }
}

fn validate_preferences(language: &str, theme: &str) -> AppResult<()> {
    if !matches!(language, "ar" | "en") {
        return Err(AppError::Validation("Invalid language".into()));
    }
    if !matches!(theme, "dark" | "light") {
        return Err(AppError::Validation("Invalid theme".into()));
    }
    Ok(())
}

fn row_to_user(row: &rusqlite::Row) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get("id")?,
        username: row.get("username")?,
        access_level: row.get("access_level")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        last_login_at: row.get("last_login_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn user_by_id(conn: &rusqlite::Connection, id: i64) -> AppResult<User> {
    conn.query_row(
        "SELECT * FROM users WHERE id = ?1",
        rusqlite::params![id],
        row_to_user,
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("User not found".into()),
        other => AppError::Sqlite(other),
    })
}

#[tauri::command]
pub async fn setup_status(db: State<'_, Db>) -> AppResult<SetupStatus> {
    db.with_conn(|conn| {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        Ok(SetupStatus {
            needs_setup: count == 0,
        })
    })
}

#[tauri::command]
pub async fn setup_first_user(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    username: String,
    pin: String,
    gym_name: Option<String>,
    language: String,
    theme: String,
) -> AppResult<AuthSession> {
    validate_credentials(&username, &pin)?;
    validate_preferences(&language, &theme)?;
    let user = db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let count: i64 =
            transaction.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        if count > 0 {
            return Err(AppError::Conflict("Setup already completed".into()));
        }
        let pin_hash = hash_pin(&pin)?;
        transaction.execute(
            "INSERT INTO users (username, pin_hash, access_level) VALUES (?1, ?2, 'management')",
            rusqlite::params![username.trim(), pin_hash],
        )?;
        let user_id = transaction.last_insert_rowid();
        transaction.execute(
            "UPDATE settings SET
                gym_name = ?1,
                language = ?2,
                theme = ?3,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = 1",
            rusqlite::params![gym_name.as_deref().map(str::trim), language, theme],
        )?;
        let user = user_by_id(&transaction, user_id)?;
        let after = serde_json::to_string(&user)?;
        log_activity(
            &transaction,
            user_id,
            "user.create",
            Some("user"),
            Some(user_id),
            None,
            Some(&after),
        )?;
        transaction.commit()?;
        Ok(user)
    })?;
    let session_token = sessions.issue(user.id)?;
    Ok(AuthSession {
        user,
        session_token,
    })
}

#[tauri::command]
pub async fn login(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    username: String,
    pin: String,
) -> AppResult<AuthSession> {
    let user = db.with_conn(|conn| {
        let result = conn.query_row(
            "SELECT id, pin_hash, is_active FROM users WHERE username = ?1 COLLATE NOCASE",
            rusqlite::params![username.trim()],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        );
        let (id, pin_hash, is_active) = match result {
            Ok(value) => value,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Err(AppError::Auth("Invalid username or PIN".into()));
            }
            Err(error) => return Err(AppError::Sqlite(error)),
        };
        if is_active == 0 || !verify_pin(&pin, &pin_hash) {
            return Err(AppError::Auth("Invalid username or PIN".into()));
        }
        let transaction = conn.transaction()?;
        let before = user_by_id(&transaction, id)?;
        transaction.execute(
            "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            rusqlite::params![id],
        )?;
        let user = user_by_id(&transaction, id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&user)?;
        log_activity(
            &transaction,
            id,
            "auth.login",
            Some("user"),
            Some(id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(user)
    })?;
    let session_token = sessions.issue(user.id)?;
    Ok(AuthSession {
        user,
        session_token,
    })
}

#[tauri::command]
pub async fn logout(sessions: State<'_, Sessions>, session_token: String) -> AppResult<()> {
    sessions.revoke(&session_token)
}

#[tauri::command]
pub async fn list_users(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
) -> AppResult<Vec<User>> {
    db.with_conn(|conn| {
        require_management(conn, &sessions, &session_token)?;
        let mut statement = conn.prepare("SELECT * FROM users ORDER BY created_at")?;
        let users = statement
            .query_map([], row_to_user)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(users)
    })
}

#[tauri::command]
pub async fn create_user(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    username: String,
    pin: String,
    access_level: String,
) -> AppResult<User> {
    validate_credentials(&username, &pin)?;
    validate_access_level(&access_level)?;
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let pin_hash = hash_pin(&pin)?;
        transaction
            .execute(
                "INSERT INTO users (username, pin_hash, access_level) VALUES (?1, ?2, ?3)",
                rusqlite::params![username.trim(), pin_hash, access_level],
            )
            .map_err(|error| match error {
                rusqlite::Error::SqliteFailure(sqlite_error, _)
                    if sqlite_error.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    AppError::Conflict(format!("Username '{}' already exists", username.trim()))
                }
                other => AppError::Sqlite(other),
            })?;
        let new_id = transaction.last_insert_rowid();
        let user = user_by_id(&transaction, new_id)?;
        let after = serde_json::to_string(&user)?;
        log_activity(
            &transaction,
            actor_id,
            "user.create",
            Some("user"),
            Some(new_id),
            None,
            Some(&after),
        )?;
        transaction.commit()?;
        Ok(user)
    })
}

#[derive(Deserialize)]
pub struct UpdateUserInput {
    pub id: i64,
    pub username: Option<String>,
    pub pin: Option<String>,
    pub access_level: Option<String>,
    pub is_active: Option<bool>,
}

#[tauri::command]
pub async fn update_user(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: UpdateUserInput,
) -> AppResult<User> {
    if let Some(ref username) = input.username {
        if username.trim().is_empty() {
            return Err(AppError::Validation("Username is required".into()));
        }
    }
    if let Some(ref pin) = input.pin {
        validate_credentials("user", pin)?;
    }
    if let Some(ref access_level) = input.access_level {
        validate_access_level(access_level)?;
    }
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = user_by_id(&transaction, input.id)?;
        let removes_management = input.is_active == Some(false)
            || matches!(input.access_level.as_deref(), Some(level) if level != "management");
        if input.id == actor_id && input.is_active == Some(false) {
            return Err(AppError::Conflict(
                "You cannot deactivate your own account".into(),
            ));
        }
        if input.id == actor_id
            && matches!(input.access_level.as_deref(), Some(level) if level != "management")
        {
            return Err(AppError::Conflict(
                "You cannot remove your own management access".into(),
            ));
        }
        if before.is_active && before.access_level == "management" && removes_management {
            let manager_count: i64 = transaction.query_row(
                "SELECT COUNT(*) FROM users WHERE is_active = 1 AND access_level = 'management'",
                [],
                |row| row.get(0),
            )?;
            if manager_count <= 1 {
                return Err(AppError::Conflict(
                    "At least one active management user is required".into(),
                ));
            }
        }
        let pin_hash = input.pin.as_ref().map(|pin| hash_pin(pin)).transpose()?;
        transaction
            .execute(
                "UPDATE users SET
                    username = COALESCE(?1, username),
                    pin_hash = COALESCE(?2, pin_hash),
                    access_level = COALESCE(?3, access_level),
                    is_active = COALESCE(?4, is_active),
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE id = ?5",
                rusqlite::params![
                    input.username.as_deref().map(str::trim),
                    pin_hash,
                    input.access_level,
                    input.is_active.map(|is_active| is_active as i64),
                    input.id,
                ],
            )
            .map_err(|error| match error {
                rusqlite::Error::SqliteFailure(sqlite_error, _)
                    if sqlite_error.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    AppError::Conflict("Username already exists".into())
                }
                other => AppError::Sqlite(other),
            })?;
        let user = user_by_id(&transaction, input.id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&user)?;
        log_activity(
            &transaction,
            actor_id,
            "user.update",
            Some("user"),
            Some(input.id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(user)
    })
}

#[cfg(test)]
mod tests {
    use super::{hash_pin, verify_pin};

    #[test]
    fn hash_and_verify_pin_roundtrip() {
        let pin = "1234";
        let hash = hash_pin(pin).unwrap();
        assert!(!hash.is_empty());
        assert!(verify_pin(pin, &hash));
        assert!(!verify_pin("wrong", &hash));
    }

    #[test]
    fn hash_is_unique_per_call() {
        let first = hash_pin("1234").unwrap();
        let second = hash_pin("1234").unwrap();
        assert_ne!(first, second);
    }
}
