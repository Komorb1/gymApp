use tauri::State;

use crate::db::log_activity;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{CreatePlanInput, Plan, UpdatePlanInput};

fn row_to_plan(row: &rusqlite::Row) -> rusqlite::Result<Plan> {
    Ok(Plan {
        id: row.get("id")?,
        name: row.get("name")?,
        duration_days: row.get("duration_days")?,
        price_cents: row.get("price_cents")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        branch_id: row.get("branch_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

#[tauri::command]
pub async fn list_plans(db: State<'_, Db>) -> AppResult<Vec<Plan>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare("SELECT * FROM plans ORDER BY name")?;
        let plans = stmt
            .query_map([], row_to_plan)?
            .map(|r| r.unwrap())
            .collect();
        Ok(plans)
    })
}

#[tauri::command]
pub async fn create_plan(
    db: State<'_, Db>,
    actor_id: i64,
    input: CreatePlanInput,
) -> AppResult<Plan> {
    db.with_conn(|conn| {
        conn.execute(
            "INSERT INTO plans (name, duration_days, price_cents) VALUES (?1, ?2, ?3)",
            rusqlite::params![input.name, input.duration_days, input.price_cents],
        )?;
        let new_id = conn.last_insert_rowid();
        log_activity(
            conn,
            actor_id,
            "plan.create",
            Some("plan"),
            Some(new_id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM plans WHERE id = ?1",
            rusqlite::params![new_id],
            row_to_plan,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn update_plan(
    db: State<'_, Db>,
    actor_id: i64,
    input: UpdatePlanInput,
) -> AppResult<Plan> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE plans SET \
                name = COALESCE(?1, name), \
                duration_days = COALESCE(?2, duration_days), \
                price_cents = COALESCE(?3, price_cents), \
                is_active = COALESCE(?4, is_active), \
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') \
             WHERE id = ?5",
            rusqlite::params![
                input.name,
                input.duration_days,
                input.price_cents,
                input.is_active.map(|b| b as i64),
                input.id,
            ],
        )?;
        log_activity(
            conn,
            actor_id,
            "plan.update",
            Some("plan"),
            Some(input.id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM plans WHERE id = ?1",
            rusqlite::params![input.id],
            row_to_plan,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn delete_plan(db: State<'_, Db>, actor_id: i64, id: i64) -> AppResult<()> {
    db.with_conn(|conn| {
        let sub_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM subscriptions WHERE plan_id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )?;
        if sub_count > 0 {
            return Err(AppError::Conflict(format!(
                "Cannot delete plan: {} subscription(s) reference it. Deactivate instead.",
                sub_count
            )));
        }
        let affected = conn.execute("DELETE FROM plans WHERE id = ?1", rusqlite::params![id])?;
        if affected == 0 {
            return Err(AppError::NotFound("Plan not found".into()));
        }
        log_activity(conn, actor_id, "plan.delete", Some("plan"), Some(id), None)?;
        Ok(())
    })
}
