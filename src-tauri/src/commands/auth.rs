use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::Deserialize;
use tauri::State;

use crate::db::{log_activity, Db};
use crate::error::{AppError, AppResult};
use crate::models::{AuthSession, SetupStatus, User};
use crate::session::{require_management, Sessions};

const MIN_PASSWORD_LENGTH: usize = 6;

fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| AppError::Auth(error.to_string()))?;
    Ok(hash.to_string())
}

fn verify_password(password: &str, encoded: &str) -> bool {
    PasswordHash::new(encoded)
        .ok()
        .and_then(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .ok()
        })
        .is_some()
}

fn validate_credentials(username: &str, password: &str) -> AppResult<()> {
    if username.trim().is_empty() {
        return Err(AppError::Validation("Username is required".into()));
    }
    if password.is_empty() {
        return Err(AppError::Validation("Password is required".into()));
    }
    if password.chars().count() < MIN_PASSWORD_LENGTH {
        return Err(AppError::Validation(format!(
            "Password must be at least {MIN_PASSWORD_LENGTH} characters"
        )));
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

fn validate_owner_update(
    is_owner: bool,
    access_level: Option<&str>,
    is_active: Option<bool>,
) -> AppResult<()> {
    if is_owner
        && (matches!(access_level, Some(level) if level != "management")
            || is_active == Some(false))
    {
        return Err(AppError::Conflict(
            "The original administrator role and active status cannot be changed".into(),
        ));
    }
    Ok(())
}

fn validate_user_deletion(
    actor_id: i64,
    target_id: i64,
    is_owner: bool,
    access_level: &str,
) -> AppResult<()> {
    if actor_id == target_id {
        return Err(AppError::Conflict(
            "You cannot delete your own account".into(),
        ));
    }
    if is_owner || access_level != "staff" {
        return Err(AppError::Conflict(
            "Only staff accounts can be deleted".into(),
        ));
    }
    Ok(())
}

fn row_to_user(row: &rusqlite::Row) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get("id")?,
        username: row.get("username")?,
        access_level: row.get("access_level")?,
        is_owner: row.get::<_, i64>("is_owner")? != 0,
        is_active: row.get::<_, i64>("is_active")? != 0,
        is_deleted: row.get::<_, i64>("is_deleted")? != 0,
        deleted_at: row.get("deleted_at")?,
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
    password: String,
    gym_name: Option<String>,
    language: String,
    theme: String,
) -> AppResult<AuthSession> {
    validate_credentials(&username, &password)?;
    validate_preferences(&language, &theme)?;
    let user = db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let count: i64 =
            transaction.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        if count > 0 {
            return Err(AppError::Conflict("Setup already completed".into()));
        }
        let pin_hash = hash_password(&password)?;
        transaction.execute(
            "INSERT INTO users (username, pin_hash, access_level, is_owner) VALUES (?1, ?2, 'management', 1)",
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
    password: String,
) -> AppResult<AuthSession> {
    let user = db.with_conn(|conn| {
        let result = conn.query_row(
            "SELECT id, pin_hash, is_active, is_deleted FROM users WHERE username = ?1 COLLATE NOCASE",
            rusqlite::params![username.trim()],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            },
        );
        let (id, pin_hash, is_active, is_deleted) = match result {
            Ok(value) => value,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Err(AppError::Auth("Invalid username or password".into()));
            }
            Err(error) => return Err(AppError::Sqlite(error)),
        };
        if is_active == 0 || is_deleted != 0 || !verify_password(&password, &pin_hash) {
            return Err(AppError::Auth("Invalid username or password".into()));
        }
        conn.execute(
            "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            rusqlite::params![id],
        )?;
        user_by_id(conn, id)
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
        let mut statement =
            conn.prepare("SELECT * FROM users WHERE is_deleted = 0 ORDER BY created_at")?;
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
    password: String,
    access_level: String,
) -> AppResult<User> {
    validate_credentials(&username, &password)?;
    validate_access_level(&access_level)?;
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let pin_hash = hash_password(&password)?;
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
    pub password: Option<String>,
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
    if let Some(ref password) = input.password {
        validate_credentials("user", password)?;
    }
    if let Some(ref access_level) = input.access_level {
        validate_access_level(access_level)?;
    }
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = user_by_id(&transaction, input.id)?;
        if before.is_deleted {
            return Err(AppError::NotFound("User not found".into()));
        }
        validate_owner_update(
            before.is_owner,
            input.access_level.as_deref(),
            input.is_active,
        )?;
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
        let pin_hash = input
            .password
            .as_ref()
            .map(|password| hash_password(password))
            .transpose()?;
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
        let mut before_details = serde_json::to_value(&before)?;
        let mut after_details = serde_json::to_value(&user)?;
        if input.password.is_some() {
            before_details["password_changed"] = serde_json::Value::Bool(false);
            after_details["password_changed"] = serde_json::Value::Bool(true);
        }
        let before_json = serde_json::to_string(&before_details)?;
        let after_json = serde_json::to_string(&after_details)?;
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

#[tauri::command]
pub async fn delete_user(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    id: i64,
) -> AppResult<()> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = user_by_id(&transaction, id)?;
        if before.is_deleted {
            return Err(AppError::NotFound("User not found".into()));
        }
        validate_user_deletion(actor_id, id, before.is_owner, &before.access_level)?;
        transaction.execute(
            "UPDATE users SET
                is_active = 0,
                is_deleted = 1,
                deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?1 AND is_deleted = 0",
            rusqlite::params![id],
        )?;
        let after = user_by_id(&transaction, id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&after)?;
        log_activity(
            &transaction,
            actor_id,
            "user.delete",
            Some("user"),
            Some(id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::{
        hash_password, validate_credentials, validate_owner_update, validate_user_deletion,
        verify_password,
    };

    #[test]
    fn password_requires_six_characters() {
        assert!(validate_credentials("user", "abcde").is_err());
        assert!(validate_credentials("user", "abcdef").is_ok());
        assert!(validate_credentials("user", "words and symbols !@#$").is_ok());
        assert!(validate_credentials("user", "").is_err());
    }

    #[test]
    fn hash_and_verify_password_roundtrip() {
        let password = "arbitrary password !";
        let hash = hash_password(password).unwrap();
        assert!(!hash.is_empty());
        assert!(verify_password(password, &hash));
        assert!(!verify_password("wrong", &hash));
    }

    #[test]
    fn hash_is_unique_per_call() {
        let first = hash_password("password").unwrap();
        let second = hash_password("password").unwrap();
        assert_ne!(first, second);
    }

    #[test]
    fn owner_role_and_active_status_are_immutable() {
        assert!(validate_owner_update(true, Some("staff"), None).is_err());
        assert!(validate_owner_update(true, None, Some(false)).is_err());
        assert!(validate_owner_update(true, Some("management"), Some(true)).is_ok());
        assert!(validate_owner_update(false, Some("staff"), Some(false)).is_ok());
    }

    #[test]
    fn only_other_non_owner_staff_users_can_be_deleted() {
        assert!(validate_user_deletion(1, 2, false, "staff").is_ok());
        assert!(validate_user_deletion(1, 1, false, "staff").is_err());
        assert!(validate_user_deletion(1, 2, true, "management").is_err());
        assert!(validate_user_deletion(1, 2, false, "management").is_err());
    }
}
