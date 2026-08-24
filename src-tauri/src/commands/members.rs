use std::path::PathBuf;

use serde::Deserialize;
use tauri::{AppHandle, Manager, State};

use crate::db::log_activity;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{CreateMemberInput, Member, MemberFlag, UpdateMemberInput};

fn row_to_member(row: &rusqlite::Row) -> rusqlite::Result<Member> {
    Ok(Member {
        id: row.get("id")?,
        first_name: row.get("first_name")?,
        last_name: row.get("last_name")?,
        phone: row.get("phone")?,
        email: row.get("email")?,
        gender: row.get("gender")?,
        birth_date: row.get("birth_date")?,
        photo_path: row.get("photo_path")?,
        is_deleted: row.get::<_, i64>("is_deleted")? != 0,
        deleted_at: row.get("deleted_at")?,
        branch_id: row.get("branch_id")?,
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

fn build_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .map(|term| {
            let clean: String = term.chars().filter(|c| c.is_alphanumeric()).collect();
            if clean.is_empty() {
                String::new()
            } else {
                format!("{}*", clean)
            }
        })
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub async fn list_members(db: State<'_, Db>) -> AppResult<Vec<Member>> {
    db.with_conn(|conn| {
        let mut stmt =
            conn.prepare("SELECT * FROM members WHERE is_deleted = 0 ORDER BY created_at DESC")?;
        let members = stmt
            .query_map([], row_to_member)?
            .map(|r| r.unwrap())
            .collect();
        Ok(members)
    })
}

#[tauri::command]
pub async fn search_members(db: State<'_, Db>, query: String) -> AppResult<Vec<Member>> {
    let fts_query = build_fts_query(&query);
    if fts_query.is_empty() {
        return list_members(db).await;
    }
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(
            "SELECT m.* FROM members_fts f \
             JOIN members m ON m.id = f.rowid \
             WHERE members_fts MATCH ?1 AND m.is_deleted = 0 \
             ORDER BY rank \
             LIMIT 50",
        )?;
        let members = stmt
            .query_map(rusqlite::params![fts_query], row_to_member)?
            .map(|r| r.unwrap())
            .collect();
        Ok(members)
    })
}

#[tauri::command]
pub async fn get_member(db: State<'_, Db>, id: i64) -> AppResult<Option<Member>> {
    db.with_conn(|conn| {
        let result = conn.query_row(
            "SELECT * FROM members WHERE id = ?1 AND is_deleted = 0",
            rusqlite::params![id],
            row_to_member,
        );
        match result {
            Ok(m) => Ok(Some(m)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Sqlite(e)),
        }
    })
}

#[tauri::command]
pub async fn create_member(
    db: State<'_, Db>,
    actor_id: i64,
    input: CreateMemberInput,
) -> AppResult<Member> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone, email, gender, birth_date) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                input.first_name,
                input.last_name,
                input.phone,
                input.email,
                input.gender,
                input.birth_date,
            ],
        )?;
        let new_id = conn.last_insert_rowid();
        log_activity(
            conn,
            actor_id,
            "member.create",
            Some("member"),
            Some(new_id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM members WHERE id = ?1",
            rusqlite::params![new_id],
            row_to_member,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn update_member(
    db: State<'_, Db>,
    actor_id: i64,
    input: UpdateMemberInput,
) -> AppResult<Member> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE members SET \
                first_name = COALESCE(?1, first_name), \
                last_name = COALESCE(?2, last_name), \
                phone = COALESCE(?3, phone), \
                email = COALESCE(?4, email), \
                gender = COALESCE(?5, gender), \
                birth_date = COALESCE(?6, birth_date), \
                photo_path = COALESCE(?7, photo_path), \
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') \
             WHERE id = ?8 AND is_deleted = 0",
            rusqlite::params![
                input.first_name,
                input.last_name,
                input.phone,
                input.email,
                input.gender,
                input.birth_date,
                input.photo_path,
                input.id,
            ],
        )?;
        log_activity(
            conn,
            actor_id,
            "member.update",
            Some("member"),
            Some(input.id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM members WHERE id = ?1",
            rusqlite::params![input.id],
            row_to_member,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn delete_member(db: State<'_, Db>, actor_id: i64, id: i64) -> AppResult<()> {
    db.with_conn(|conn| {
        let affected = conn.execute(
            "UPDATE members SET is_deleted = 1, deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), \
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1 AND is_deleted = 0",
            rusqlite::params![id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound("Member not found".into()));
        }
        log_activity(conn, actor_id, "member.delete", Some("member"), Some(id), None)?;
        Ok(())
    })
}

#[tauri::command]
pub async fn get_member_flags(db: State<'_, Db>, member_id: i64) -> AppResult<Vec<MemberFlag>> {
    db.with_conn(|conn| {
        let mut stmt =
            conn.prepare("SELECT * FROM member_flags WHERE member_id = ?1 ORDER BY flag")?;
        let flags = stmt
            .query_map(rusqlite::params![member_id], row_to_flag)?
            .map(|r| r.unwrap())
            .collect();
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
    actor_id: i64,
    input: SetFlagInput,
) -> AppResult<()> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO member_flags (member_id, flag, note) VALUES (?1, ?2, ?3) \
             ON CONFLICT (member_id, flag) DO UPDATE SET note = ?3",
            rusqlite::params![input.member_id, input.flag, input.note],
        )?;
        log_activity(
            conn,
            actor_id,
            "member.set_flag",
            Some("member"),
            Some(input.member_id),
            Some(&input.flag),
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn remove_member_flag(
    db: State<'_, Db>,
    actor_id: i64,
    member_id: i64,
    flag: String,
) -> AppResult<()> {
    db.with_conn(|conn| {
        conn.execute(
            "DELETE FROM member_flags WHERE member_id = ?1 AND flag = ?2",
            rusqlite::params![member_id, flag],
        )?;
        log_activity(
            conn,
            actor_id,
            "member.remove_flag",
            Some("member"),
            Some(member_id),
            Some(&flag),
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn save_photo(app: AppHandle, source_path: String, member_id: i64) -> AppResult<String> {
    let app_data_dir = app.path().app_data_dir()?;
    let photos_dir = app_data_dir.join("photos");
    std::fs::create_dir_all(&photos_dir)?;

    let source = PathBuf::from(&source_path);
    let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("jpg");

    let dest_name = format!("member_{}.{}", member_id, ext);
    let dest = photos_dir.join(&dest_name);

    std::fs::copy(&source, &dest)?;

    Ok(dest.to_string_lossy().to_string())
}
