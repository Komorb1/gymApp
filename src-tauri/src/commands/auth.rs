use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::Deserialize;
use tauri::State;

use crate::db::log_activity;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{SetupStatus, User};

fn hash_pin(pin: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|e| AppError::Auth(e.to_string()))?;
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

fn row_to_user(row: &rusqlite::Row) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get("id")?,
        username: row.get("username")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        last_login_at: row.get("last_login_at")?,
        branch_id: row.get("branch_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

#[tauri::command]
pub async fn setup_status(db: State<'_, Db>) -> AppResult<SetupStatus> {
    db.with_conn(|conn| {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM users WHERE is_active = 1",
            [],
            |row| row.get(0),
        )?;
        Ok(SetupStatus {
            needs_setup: count == 0,
        })
    })
}

#[tauri::command]
pub async fn setup_first_user(
    db: State<'_, Db>,
    username: String,
    pin: String,
    gym_name: Option<String>,
) -> AppResult<User> {
    db.with_conn(|conn| {
        let count: i64 =
            conn.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
        if count > 0 {
            return Err(AppError::Conflict("Setup already completed".into()));
        }
        let pin_hash = hash_pin(&pin)?;
        conn.execute(
            "INSERT INTO users (username, pin_hash) VALUES (?1, ?2)",
            rusqlite::params![username, pin_hash],
        )?;
        let user_id = conn.last_insert_rowid();
        if let Some(ref name) = gym_name {
            conn.execute(
                "UPDATE settings SET gym_name = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = 1",
                rusqlite::params![name],
            )?;
        }
        log_activity(conn, user_id, "user.create", Some("user"), Some(user_id), None)?;
        conn.query_row(
            "SELECT * FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            row_to_user,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn login(db: State<'_, Db>, username: String, pin: String) -> AppResult<User> {
    db.with_conn(|conn| {
        let result = conn.query_row(
            "SELECT id, pin_hash, is_active FROM users WHERE username = ?1 COLLATE NOCASE",
            rusqlite::params![username],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        );
        match result {
            Ok((id, pin_hash, is_active)) => {
                if is_active == 0 {
                    return Err(AppError::Auth("User is deactivated".into()));
                }
                if !verify_pin(&pin, &pin_hash) {
                    return Err(AppError::Auth("Invalid PIN".into()));
                }
                conn.execute(
                    "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
                    rusqlite::params![id],
                )?;
                conn.query_row(
                    "SELECT * FROM users WHERE id = ?1",
                    rusqlite::params![id],
                    row_to_user,
                )
                .map_err(AppError::Sqlite)
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                Err(AppError::Auth("Invalid username".into()))
            }
            Err(e) => Err(AppError::Sqlite(e)),
        }
    })
}

#[tauri::command]
pub async fn get_user_by_id(db: State<'_, Db>, id: i64) -> AppResult<Option<User>> {
    db.with_conn(|conn| {
        let result = conn.query_row(
            "SELECT * FROM users WHERE id = ?1 AND is_active = 1",
            rusqlite::params![id],
            row_to_user,
        );
        match result {
            Ok(user) => Ok(Some(user)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Sqlite(e)),
        }
    })
}

#[tauri::command]
pub async fn list_users(db: State<'_, Db>) -> AppResult<Vec<User>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare("SELECT * FROM users ORDER BY created_at")?;
        let users = stmt
            .query_map([], row_to_user)?
            .map(|r| r.unwrap())
            .collect();
        Ok(users)
    })
}

#[tauri::command]
pub async fn create_user(
    db: State<'_, Db>,
    actor_id: i64,
    username: String,
    pin: String,
) -> AppResult<User> {
    db.with_conn(|conn| {
        let pin_hash = hash_pin(&pin)?;
        conn.execute(
            "INSERT INTO users (username, pin_hash) VALUES (?1, ?2)",
            rusqlite::params![username, pin_hash],
        )
        .map_err(|e| match e {
            rusqlite::Error::SqliteFailure(err, _)
                if err.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                AppError::Conflict(format!("Username '{}' already exists", username))
            }
            other => AppError::Sqlite(other),
        })?;
        let new_id = conn.last_insert_rowid();
        log_activity(
            conn,
            actor_id,
            "user.create",
            Some("user"),
            Some(new_id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM users WHERE id = ?1",
            rusqlite::params![new_id],
            row_to_user,
        )
        .map_err(AppError::Sqlite)
    })
}

#[derive(Deserialize)]
pub struct UpdateUserInput {
    pub id: i64,
    pub username: Option<String>,
    pub pin: Option<String>,
    pub is_active: Option<bool>,
}

#[tauri::command]
pub async fn update_user(
    db: State<'_, Db>,
    actor_id: i64,
    input: UpdateUserInput,
) -> AppResult<User> {
    db.with_conn(|conn| {
        let pin_hash = input.pin.as_ref().map(|p| hash_pin(p)).transpose()?;
        conn.execute(
            "UPDATE users SET
                username = COALESCE(?1, username),
                pin_hash = COALESCE(?2, pin_hash),
                is_active = COALESCE(?3, is_active),
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?4",
            rusqlite::params![
                input.username,
                pin_hash,
                input.is_active.map(|b| b as i64),
                input.id,
            ],
        )
        .map_err(|e| match e {
            rusqlite::Error::SqliteFailure(err, _)
                if err.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                AppError::Conflict("Username already exists".into())
            }
            other => AppError::Sqlite(other),
        })?;
        log_activity(
            conn,
            actor_id,
            "user.update",
            Some("user"),
            Some(input.id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM users WHERE id = ?1",
            rusqlite::params![input.id],
            row_to_user,
        )
        .map_err(AppError::Sqlite)
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
        let h1 = hash_pin("1234").unwrap();
        let h2 = hash_pin("1234").unwrap();
        assert_ne!(h1, h2, "argon2 uses random salt — hashes must differ");
        assert!(verify_pin("1234", &h1));
        assert!(verify_pin("1234", &h2));
    }
}
