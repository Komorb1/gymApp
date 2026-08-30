use tauri::State;

use crate::db::{log_activity, Db};
use crate::error::{AppError, AppResult};
use crate::models::{CreatePlanInput, Plan, UpdatePlanInput};
use crate::session::{require_management, require_user, Sessions};

fn row_to_plan(row: &rusqlite::Row) -> rusqlite::Result<Plan> {
    Ok(Plan {
        id: row.get("id")?,
        name: row.get("name")?,
        duration_days: row.get("duration_days")?,
        price_cents: row.get("price_cents")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn plan_by_id(conn: &rusqlite::Connection, id: i64) -> AppResult<Plan> {
    conn.query_row(
        "SELECT * FROM plans WHERE id = ?1",
        rusqlite::params![id],
        row_to_plan,
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Plan not found".into()),
        other => AppError::Sqlite(other),
    })
}

fn validate_plan(name: &str, duration_days: i64, price_cents: i64) -> AppResult<()> {
    if name.trim().is_empty() {
        return Err(AppError::Validation("Plan name is required".into()));
    }
    if duration_days <= 0 || price_cents < 0 {
        return Err(AppError::Validation(
            "Invalid plan duration or price".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn list_plans(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
) -> AppResult<Vec<Plan>> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let mut statement = conn.prepare("SELECT * FROM plans ORDER BY name")?;
        let plans = statement
            .query_map([], row_to_plan)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(plans)
    })
}

#[tauri::command]
pub async fn create_plan(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: CreatePlanInput,
) -> AppResult<Plan> {
    validate_plan(&input.name, input.duration_days, input.price_cents)?;
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        transaction.execute(
            "INSERT INTO plans (name, duration_days, price_cents) VALUES (?1, ?2, ?3)",
            rusqlite::params![input.name.trim(), input.duration_days, input.price_cents],
        )?;
        let new_id = transaction.last_insert_rowid();
        let plan = plan_by_id(&transaction, new_id)?;
        let after = serde_json::to_string(&plan)?;
        log_activity(
            &transaction,
            actor_id,
            "plan.create",
            Some("plan"),
            Some(new_id),
            None,
            Some(&after),
        )?;
        transaction.commit()?;
        Ok(plan)
    })
}

#[tauri::command]
pub async fn update_plan(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: UpdatePlanInput,
) -> AppResult<Plan> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = plan_by_id(&transaction, input.id)?;
        let name = input.name.unwrap_or_else(|| before.name.clone());
        let duration_days = input.duration_days.unwrap_or(before.duration_days);
        let price_cents = input.price_cents.unwrap_or(before.price_cents);
        validate_plan(&name, duration_days, price_cents)?;
        transaction.execute(
            "UPDATE plans SET
                name = ?1,
                duration_days = ?2,
                price_cents = ?3,
                is_active = ?4,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?5",
            rusqlite::params![
                name.trim(),
                duration_days,
                price_cents,
                input.is_active.unwrap_or(before.is_active) as i64,
                input.id,
            ],
        )?;
        let plan = plan_by_id(&transaction, input.id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&plan)?;
        log_activity(
            &transaction,
            actor_id,
            "plan.update",
            Some("plan"),
            Some(input.id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(plan)
    })
}

#[tauri::command]
pub async fn delete_plan(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    id: i64,
) -> AppResult<()> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = plan_by_id(&transaction, id)?;
        let subscription_count: i64 = transaction.query_row(
            "SELECT COUNT(*) FROM subscriptions WHERE plan_id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )?;
        if subscription_count > 0 {
            return Err(AppError::Conflict(format!(
                "Cannot delete plan: {subscription_count} membership record(s) reference it. Deactivate it instead."
            )));
        }
        transaction.execute("DELETE FROM plans WHERE id = ?1", rusqlite::params![id])?;
        let before_json = serde_json::to_string(&before)?;
        log_activity(
            &transaction,
            actor_id,
            "plan.delete",
            Some("plan"),
            Some(id),
            Some(&before_json),
            None,
        )?;
        transaction.commit()?;
        Ok(())
    })
}
