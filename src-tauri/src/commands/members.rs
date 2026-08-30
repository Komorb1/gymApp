use std::path::PathBuf;

use serde::Deserialize;
use tauri::{AppHandle, Manager, State};

use crate::db::{log_activity, Db};
use crate::error::{AppError, AppResult};
use crate::models::{CreateMemberInput, Member, MemberFlag, MemberReport, UpdateMemberInput};
use crate::session::{require_management, require_user, Sessions};

fn row_to_member(row: &rusqlite::Row) -> rusqlite::Result<Member> {
    Ok(Member {
        id: row.get("id")?,
        first_name: row.get("first_name")?,
        middle_name: row.get("middle_name")?,
        last_name: row.get("last_name")?,
        id_number: row.get("id_number")?,
        phone: row.get("phone")?,
        whatsapp_no: row.get("whatsapp_no")?,
        email: row.get("email")?,
        birth_date: row.get("birth_date")?,
        notes: row.get("notes")?,
        photo_path: row.get("photo_path")?,
        is_deleted: row.get::<_, i64>("is_deleted")? != 0,
        deleted_at: row.get("deleted_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_flag(row: &rusqlite::Row) -> rusqlite::Result<MemberFlag> {
    Ok(MemberFlag {
        id: row.get("id")?,
        member_id: row.get("member_id")?,
        flag: row.get("flag")?,
        note: row.get("note")?,
        created_at: row.get("created_at")?,
    })
}

fn member_by_id(conn: &rusqlite::Connection, id: i64) -> AppResult<Member> {
    conn.query_row(
        "SELECT * FROM members WHERE id = ?1",
        rusqlite::params![id],
        row_to_member,
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Member not found".into()),
        other => AppError::Sqlite(other),
    })
}

fn validate_member(first_name: &str, phone: &str) -> AppResult<()> {
    if first_name.trim().is_empty() {
        return Err(AppError::Validation("First name is required".into()));
    }
    if phone.trim().is_empty() {
        return Err(AppError::Validation("Phone number is required".into()));
    }
    Ok(())
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn build_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter_map(|term| {
            let clean: String = term
                .chars()
                .filter(|character| character.is_alphanumeric())
                .collect();
            (!clean.is_empty()).then(|| format!("{clean}*"))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn ensure_member_has_no_subscriptions(conn: &rusqlite::Connection, id: i64) -> AppResult<()> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM subscriptions WHERE member_id = ?1",
        rusqlite::params![id],
        |row| row.get(0),
    )?;
    if count > 0 {
        return Err(AppError::Conflict(
            "A member with subscription history cannot be deleted".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_members(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
) -> AppResult<Vec<Member>> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let mut statement =
            conn.prepare("SELECT * FROM members WHERE is_deleted = 0 ORDER BY created_at DESC")?;
        let members = statement
            .query_map([], row_to_member)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(members)
    })
}

#[tauri::command]
pub async fn search_members(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    query: String,
) -> AppResult<Vec<Member>> {
    let fts_query = build_fts_query(&query);
    if fts_query.is_empty() {
        return list_members(db, sessions, session_token).await;
    }
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let mut statement = conn.prepare(
            "SELECT m.* FROM members_fts f
             JOIN members m ON m.id = f.rowid
             WHERE members_fts MATCH ?1 AND m.is_deleted = 0
             ORDER BY rank
             LIMIT 50",
        )?;
        let members = statement
            .query_map(rusqlite::params![fts_query], row_to_member)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(members)
    })
}

#[tauri::command]
pub async fn get_member(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    id: i64,
) -> AppResult<Option<Member>> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let result = conn.query_row(
            "SELECT * FROM members WHERE id = ?1 AND is_deleted = 0",
            rusqlite::params![id],
            row_to_member,
        );
        match result {
            Ok(member) => Ok(Some(member)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(AppError::Sqlite(error)),
        }
    })
}

#[tauri::command]
pub async fn create_member(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: CreateMemberInput,
) -> AppResult<Member> {
    validate_member(&input.first_name, &input.phone)?;
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, &sessions, &session_token)?;
        transaction.execute(
            "INSERT INTO members (
                first_name, middle_name, last_name, id_number, phone,
                whatsapp_no, email, birth_date, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                input.first_name.trim(),
                clean_optional(input.middle_name),
                input.last_name.unwrap_or_default().trim(),
                clean_optional(input.id_number),
                input.phone.trim(),
                input.phone.trim(),
                clean_optional(input.email),
                clean_optional(input.birth_date),
                clean_optional(input.notes),
            ],
        )?;
        let new_id = transaction.last_insert_rowid();
        let member = member_by_id(&transaction, new_id)?;
        let after = serde_json::to_string(&member)?;
        log_activity(
            &transaction,
            actor_id,
            "member.create",
            Some("member"),
            Some(new_id),
            None,
            Some(&after),
        )?;
        transaction.commit()?;
        Ok(member)
    })
}

#[tauri::command]
pub async fn update_member(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: UpdateMemberInput,
) -> AppResult<Member> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, &sessions, &session_token)?;
        let before = member_by_id(&transaction, input.id)?;
        if before.is_deleted {
            return Err(AppError::NotFound("Member not found".into()));
        }
        let first_name = input
            .first_name
            .unwrap_or_else(|| before.first_name.clone());
        let phone = input.phone.unwrap_or_else(|| before.phone.clone());
        validate_member(&first_name, &phone)?;
        let middle_name = input.middle_name.unwrap_or(before.middle_name.clone());
        let last_name = input.last_name.unwrap_or_else(|| before.last_name.clone());
        let id_number = input.id_number.unwrap_or(before.id_number.clone());
        let email = input.email.unwrap_or(before.email.clone());
        let birth_date = input.birth_date.unwrap_or(before.birth_date.clone());
        let notes = input.notes.unwrap_or(before.notes.clone());
        let photo_path = input.photo_path.unwrap_or(before.photo_path.clone());
        transaction.execute(
            "UPDATE members SET
                first_name = ?1,
                middle_name = ?2,
                last_name = ?3,
                id_number = ?4,
                phone = ?5,
                whatsapp_no = ?6,
                email = ?7,
                birth_date = ?8,
                notes = ?9,
                photo_path = ?10,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?11 AND is_deleted = 0",
            rusqlite::params![
                first_name.trim(),
                clean_optional(middle_name),
                last_name.trim(),
                clean_optional(id_number),
                phone.trim(),
                phone.trim(),
                clean_optional(email),
                clean_optional(birth_date),
                clean_optional(notes),
                clean_optional(photo_path),
                input.id,
            ],
        )?;
        let member = member_by_id(&transaction, input.id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&member)?;
        log_activity(
            &transaction,
            actor_id,
            "member.update",
            Some("member"),
            Some(input.id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(member)
    })
}

#[tauri::command]
pub async fn delete_member(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    id: i64,
) -> AppResult<()> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = member_by_id(&transaction, id)?;
        ensure_member_has_no_subscriptions(&transaction, id)?;
        let affected = transaction.execute(
            "UPDATE members SET
                is_deleted = 1,
                deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?1 AND is_deleted = 0",
            rusqlite::params![id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound("Member not found".into()));
        }
        let after = member_by_id(&transaction, id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&after)?;
        log_activity(
            &transaction,
            actor_id,
            "member.delete",
            Some("member"),
            Some(id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(())
    })
}

#[tauri::command]
pub async fn get_member_flags(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    member_id: i64,
) -> AppResult<Vec<MemberFlag>> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let mut statement =
            conn.prepare("SELECT * FROM member_flags WHERE member_id = ?1 ORDER BY flag")?;
        let flags = statement
            .query_map(rusqlite::params![member_id], row_to_flag)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(flags)
    })
}

#[derive(Deserialize)]
pub struct SetFlagInput {
    pub member_id: i64,
    pub flag: String,
    pub note: Option<String>,
}

#[tauri::command]
pub async fn set_member_flag(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: SetFlagInput,
) -> AppResult<()> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, &sessions, &session_token)?;
        let before = transaction
            .query_row(
                "SELECT * FROM member_flags WHERE member_id = ?1 AND flag = ?2",
                rusqlite::params![input.member_id, input.flag],
                row_to_flag,
            )
            .ok();
        transaction.execute(
            "INSERT INTO member_flags (member_id, flag, note) VALUES (?1, ?2, ?3)
             ON CONFLICT (member_id, flag) DO UPDATE SET note = excluded.note",
            rusqlite::params![input.member_id, input.flag, clean_optional(input.note)],
        )?;
        let after = transaction.query_row(
            "SELECT * FROM member_flags WHERE member_id = ?1 AND flag = ?2",
            rusqlite::params![input.member_id, input.flag],
            row_to_flag,
        )?;
        let before_json = before.as_ref().map(serde_json::to_string).transpose()?;
        let after_json = serde_json::to_string(&after)?;
        log_activity(
            &transaction,
            actor_id,
            "member.set_flag",
            Some("member"),
            Some(input.member_id),
            before_json.as_deref(),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(())
    })
}

#[tauri::command]
pub async fn remove_member_flag(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    member_id: i64,
    flag: String,
) -> AppResult<()> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, &sessions, &session_token)?;
        let before = transaction
            .query_row(
                "SELECT * FROM member_flags WHERE member_id = ?1 AND flag = ?2",
                rusqlite::params![member_id, flag],
                row_to_flag,
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => {
                    AppError::NotFound("Member flag not found".into())
                }
                other => AppError::Sqlite(other),
            })?;
        transaction.execute(
            "DELETE FROM member_flags WHERE member_id = ?1 AND flag = ?2",
            rusqlite::params![member_id, flag],
        )?;
        let before_json = serde_json::to_string(&before)?;
        log_activity(
            &transaction,
            actor_id,
            "member.remove_flag",
            Some("member"),
            Some(member_id),
            Some(&before_json),
            None,
        )?;
        transaction.commit()?;
        Ok(())
    })
}

#[tauri::command]
pub async fn save_photo(
    app: AppHandle,
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    source_path: String,
    member_id: i64,
) -> AppResult<String> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        member_by_id(conn, member_id)?;
        Ok(())
    })?;
    let source = PathBuf::from(&source_path);
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| AppError::Validation("Image extension is required".into()))?;
    if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp") {
        return Err(AppError::Validation("Unsupported image type".into()));
    }
    if std::fs::metadata(&source)?.len() > 10 * 1024 * 1024 {
        return Err(AppError::Validation(
            "Image must be 10 MB or smaller".into(),
        ));
    }
    let photos_dir = app.path().app_data_dir()?.join("photos");
    std::fs::create_dir_all(&photos_dir)?;
    let destination = photos_dir.join(format!("member_{member_id}.{extension}"));
    std::fs::copy(source, &destination)?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn list_member_reports(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
) -> AppResult<Vec<MemberReport>> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let mut member_statement =
            conn.prepare("SELECT * FROM members ORDER BY created_at DESC")?;
        let members = member_statement
            .query_map([], row_to_member)?
            .collect::<Result<Vec<_>, _>>()?;
        let mut subscription_statement = conn
            .prepare("SELECT * FROM subscriptions WHERE member_id = ?1 ORDER BY created_at DESC")?;
        let mut reports = Vec::with_capacity(members.len());
        for member in members {
            let subscriptions = subscription_statement
                .query_map(
                    rusqlite::params![member.id],
                    crate::commands::subscriptions::row_to_subscription,
                )?
                .collect::<Result<Vec<_>, _>>()?;
            reports.push(MemberReport {
                member,
                subscriptions,
            });
        }
        Ok(reports)
    })
}

#[cfg(test)]
mod tests {
    use super::ensure_member_has_no_subscriptions;
    use crate::db::migrations;
    use rusqlite::Connection;

    #[test]
    fn member_with_any_subscription_cannot_be_deleted() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::runner().run(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone, whatsapp_no) VALUES ('Test', '', '123', '123')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO plans (name, duration_days, price_cents) VALUES ('Monthly', 30, 5000)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date
             ) VALUES (1, 1, '{}', '{}', '2026-01-01', '2026-02-01')",
            [],
        )
        .unwrap();

        assert!(ensure_member_has_no_subscriptions(&conn, 1).is_err());
    }
}
