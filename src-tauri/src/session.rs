use std::collections::HashMap;
use std::sync::Mutex;

use rand::rngs::OsRng;
use rand::RngCore;
use rusqlite::Connection;

use crate::error::{AppError, AppResult};

pub struct Sessions(Mutex<HashMap<String, i64>>);

impl Sessions {
    pub fn new() -> Self {
        Self(Mutex::new(HashMap::new()))
    }

    pub fn issue(&self, user_id: i64) -> AppResult<String> {
        let mut bytes = [0_u8; 32];
        OsRng.fill_bytes(&mut bytes);
        let token = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        self.0
            .lock()
            .map_err(|error| AppError::Auth(error.to_string()))?
            .insert(token.clone(), user_id);
        Ok(token)
    }

    pub fn revoke(&self, token: &str) -> AppResult<()> {
        self.0
            .lock()
            .map_err(|error| AppError::Auth(error.to_string()))?
            .remove(token);
        Ok(())
    }

    fn user_id(&self, token: &str) -> AppResult<i64> {
        self.0
            .lock()
            .map_err(|error| AppError::Auth(error.to_string()))?
            .get(token)
            .copied()
            .ok_or_else(|| AppError::Auth("Authentication required".into()))
    }
}

pub fn require_user(conn: &Connection, sessions: &Sessions, token: &str) -> AppResult<i64> {
    let user_id = sessions.user_id(token)?;
    let active: bool = conn
        .query_row(
            "SELECT is_active FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |row| Ok(row.get::<_, i64>(0)? != 0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::Auth("Authentication required".into())
            }
            other => AppError::Sqlite(other),
        })?;
    if !active {
        return Err(AppError::Auth("User is deactivated".into()));
    }
    Ok(user_id)
}

pub fn require_management(
    conn: &Connection,
    sessions: &Sessions,
    token: &str,
) -> AppResult<i64> {
    let user_id = require_user(conn, sessions, token)?;
    let access_level: String = conn.query_row(
        "SELECT access_level FROM users WHERE id = ?1",
        rusqlite::params![user_id],
        |row| row.get(0),
    )?;
    if access_level != "management" {
        return Err(AppError::Auth("Management access required".into()));
    }
    Ok(user_id)
}
