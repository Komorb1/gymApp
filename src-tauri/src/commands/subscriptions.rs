use rusqlite::types::Type;
use tauri::State;

use crate::db::{log_activity, Db};
use crate::error::{AppError, AppResult};
use crate::models::{
    CreateSubscriptionInput, DashboardStats, MemberSnapshot, PlanSnapshot, RenewSubscriptionInput,
    Subscription, UpdateSubscriptionInput,
};
use crate::session::{require_management, require_user, Sessions};

fn decode_json<T: serde::de::DeserializeOwned>(value: String) -> rusqlite::Result<T> {
    serde_json::from_str(&value)
        .map_err(|error| rusqlite::Error::FromSqlConversionFailure(0, Type::Text, Box::new(error)))
}

pub(crate) fn row_to_subscription(row: &rusqlite::Row) -> rusqlite::Result<Subscription> {
    Ok(Subscription {
        id: row.get("id")?,
        member_id: row.get("member_id")?,
        plan_id: row.get("plan_id")?,
        member_snapshot: decode_json(row.get("member_snapshot_json")?)?,
        plan_snapshot: decode_json(row.get("plan_snapshot_json")?)?,
        start_date: row.get("start_date")?,
        end_date: row.get("end_date")?,
        status: row.get("status")?,
        frozen_at: row.get("frozen_at")?,
        frozen_until: row.get("frozen_until")?,
        paid_amount_cents: row.get("paid_amount_cents")?,
        discount_percent: row.get("discount_percent")?,
        is_paid: row.get("is_paid")?,
        notes: row.get("notes")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn subscription_by_id(conn: &rusqlite::Connection, id: i64) -> AppResult<Subscription> {
    conn.query_row(
        "SELECT * FROM subscriptions WHERE id = ?1",
        rusqlite::params![id],
        row_to_subscription,
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            AppError::NotFound("Membership record not found".into())
        }
        other => AppError::Sqlite(other),
    })
}

fn member_snapshot(conn: &rusqlite::Connection, member_id: i64) -> AppResult<MemberSnapshot> {
    conn.query_row(
        "SELECT id, first_name, middle_name, last_name, id_number, phone,
                whatsapp_no, email, birth_date, notes, photo_path, created_at
         FROM members WHERE id = ?1 AND is_deleted = 0",
        rusqlite::params![member_id],
        |row| {
            Ok(MemberSnapshot {
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
                created_at: row.get("created_at")?,
            })
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Member not found".into()),
        other => AppError::Sqlite(other),
    })
}

fn plan_snapshot(
    conn: &rusqlite::Connection,
    plan_id: i64,
    require_active: bool,
) -> AppResult<PlanSnapshot> {
    conn.query_row(
        "SELECT id, name, duration_days, price_cents, is_active FROM plans WHERE id = ?1",
        rusqlite::params![plan_id],
        |row| {
            let is_active = row.get::<_, i64>("is_active")? != 0;
            Ok((
                PlanSnapshot {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    duration_days: row.get("duration_days")?,
                    price_cents: row.get("price_cents")?,
                },
                is_active,
            ))
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Plan not found".into()),
        other => AppError::Sqlite(other),
    })
    .and_then(|(plan, is_active)| {
        if require_active && !is_active {
            Err(AppError::Conflict("Plan is inactive".into()))
        } else {
            Ok(plan)
        }
    })
}

fn parse_date(value: &str, field: &str) -> AppResult<chrono::NaiveDate> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(format!("Invalid {field}")))
}

fn compute_end_date(start_date: chrono::NaiveDate, duration_days: i64) -> String {
    (start_date + chrono::Duration::days(duration_days))
        .format("%Y-%m-%d")
        .to_string()
}

fn clean_notes(notes: Option<String>) -> Option<String> {
    notes.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn discounted_price_cents(price_cents: i64, discount_percent: i64) -> AppResult<i64> {
    if !(0..=100).contains(&discount_percent) {
        return Err(AppError::Validation(
            "Discount percentage must be between 0 and 100".into(),
        ));
    }
    Ok((price_cents * (100 - discount_percent) + 50) / 100)
}

#[cfg(test)]
mod tests {
    use super::discounted_price_cents;

    #[test]
    fn discount_percentage_calculates_rounded_final_price() {
        assert_eq!(discounted_price_cents(3_255, 15).unwrap(), 2_767);
        assert_eq!(discounted_price_cents(5_000, 100).unwrap(), 0);
    }

    #[test]
    fn discount_percentage_must_be_between_zero_and_one_hundred() {
        assert!(discounted_price_cents(5_000, -1).is_err());
        assert!(discounted_price_cents(5_000, 101).is_err());
    }
}

#[tauri::command]
pub async fn list_subscriptions(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
) -> AppResult<Vec<Subscription>> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let mut statement = conn.prepare("SELECT * FROM subscriptions ORDER BY end_date DESC")?;
        let subscriptions = statement
            .query_map([], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(subscriptions)
    })
}

#[tauri::command]
pub async fn list_member_subscriptions(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    member_id: i64,
) -> AppResult<Vec<Subscription>> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let mut statement = conn
            .prepare("SELECT * FROM subscriptions WHERE member_id = ?1 ORDER BY created_at DESC")?;
        let subscriptions = statement
            .query_map(rusqlite::params![member_id], row_to_subscription)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(subscriptions)
    })
}

#[tauri::command]
pub async fn create_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: CreateSubscriptionInput,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, &sessions, &session_token)?;
        let member = member_snapshot(&transaction, input.member_id)?;
        let plan = plan_snapshot(&transaction, input.plan_id, true)?;
        let final_price_cents = discounted_price_cents(plan.price_cents, input.discount_percent)?;
        let start_date = match input.start_date {
            Some(value) => parse_date(&value, "start date")?,
            None => chrono::Utc::now().date_naive(),
        };
        let end_date = compute_end_date(start_date, plan.duration_days);
        let member_json = serde_json::to_string(&member)?;
        let plan_json = serde_json::to_string(&plan)?;
        transaction.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, paid_amount_cents, discount_percent, is_paid, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                input.member_id,
                input.plan_id,
                member_json,
                plan_json,
                start_date.format("%Y-%m-%d").to_string(),
                end_date,
                final_price_cents,
                input.discount_percent,
                input.is_paid,
                clean_notes(input.notes),
            ],
        )?;
        let new_id = transaction.last_insert_rowid();
        let subscription = subscription_by_id(&transaction, new_id)?;
        let after = serde_json::to_string(&subscription)?;
        log_activity(
            &transaction,
            actor_id,
            "subscription.create",
            Some("subscription"),
            Some(new_id),
            None,
            Some(&after),
        )?;
        transaction.commit()?;
        Ok(subscription)
    })
}

#[tauri::command]
pub async fn renew_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: RenewSubscriptionInput,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, &sessions, &session_token)?;
        let before = subscription_by_id(&transaction, input.subscription_id)?;
        let member = member_snapshot(&transaction, before.member_id)?;
        let plan_id = input.plan_id.unwrap_or(before.plan_id);
        let plan = plan_snapshot(&transaction, plan_id, true)?;
        let final_price_cents = discounted_price_cents(plan.price_cents, input.discount_percent)?;
        let today = chrono::Utc::now().date_naive();
        let previous_end = parse_date(&before.end_date, "membership end date")?;
        let start_date = previous_end.max(today);
        let end_date = compute_end_date(start_date, plan.duration_days);
        let member_json = serde_json::to_string(&member)?;
        let plan_json = serde_json::to_string(&plan)?;
        transaction.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, paid_amount_cents, discount_percent, is_paid, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                before.member_id,
                plan_id,
                member_json,
                plan_json,
                start_date.format("%Y-%m-%d").to_string(),
                end_date,
                final_price_cents,
                input.discount_percent,
                input.is_paid,
                clean_notes(input.notes),
            ],
        )?;
        let new_id = transaction.last_insert_rowid();
        transaction.execute(
            "UPDATE subscriptions SET
                status = 'cancelled',
                frozen_at = NULL,
                frozen_until = NULL,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?1",
            rusqlite::params![input.subscription_id],
        )?;
        let previous_after = subscription_by_id(&transaction, input.subscription_id)?;
        let subscription = subscription_by_id(&transaction, new_id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&serde_json::json!({
            "previous_membership": previous_after,
            "new_membership": subscription,
        }))?;
        log_activity(
            &transaction,
            actor_id,
            "subscription.renew",
            Some("subscription"),
            Some(new_id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(subscription)
    })
}

#[tauri::command]
pub async fn freeze_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    subscription_id: i64,
    frozen_until: String,
) -> AppResult<Subscription> {
    let frozen_until_date = parse_date(&frozen_until, "freeze end date")?;
    if frozen_until_date <= chrono::Utc::now().date_naive() {
        return Err(AppError::Validation(
            "Freeze end date must be in the future".into(),
        ));
    }
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = subscription_by_id(&transaction, subscription_id)?;
        if before.status != "active" {
            return Err(AppError::Conflict(
                "Only active memberships can be frozen".into(),
            ));
        }
        transaction.execute(
            "UPDATE subscriptions SET
                status = 'frozen',
                frozen_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                frozen_until = ?1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?2",
            rusqlite::params![frozen_until, subscription_id],
        )?;
        let subscription = subscription_by_id(&transaction, subscription_id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&subscription)?;
        log_activity(
            &transaction,
            actor_id,
            "subscription.freeze",
            Some("subscription"),
            Some(subscription_id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(subscription)
    })
}

#[tauri::command]
pub async fn unfreeze_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    subscription_id: i64,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = subscription_by_id(&transaction, subscription_id)?;
        if before.status != "frozen" {
            return Err(AppError::Conflict("Membership is not frozen".into()));
        }
        let frozen_at = before
            .frozen_at
            .as_deref()
            .and_then(|value| value.get(..10))
            .ok_or_else(|| AppError::Validation("Missing freeze start date".into()))?;
        let frozen_at_date = parse_date(frozen_at, "freeze start date")?;
        let today = chrono::Utc::now().date_naive();
        let extension_days = (today - frozen_at_date).num_days().max(0);
        let current_end = parse_date(&before.end_date, "membership end date")?;
        let new_end = (current_end + chrono::Duration::days(extension_days))
            .format("%Y-%m-%d")
            .to_string();
        transaction.execute(
            "UPDATE subscriptions SET
                status = 'active',
                frozen_at = NULL,
                frozen_until = NULL,
                end_date = ?1,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?2",
            rusqlite::params![new_end, subscription_id],
        )?;
        let subscription = subscription_by_id(&transaction, subscription_id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&subscription)?;
        log_activity(
            &transaction,
            actor_id,
            "subscription.unfreeze",
            Some("subscription"),
            Some(subscription_id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(subscription)
    })
}

#[tauri::command]
pub async fn update_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: UpdateSubscriptionInput,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, &sessions, &session_token)?;
        let before = subscription_by_id(&transaction, input.subscription_id)?;
        let final_price_cents =
            discounted_price_cents(before.plan_snapshot.price_cents, input.discount_percent)?;
        transaction.execute(
            "UPDATE subscriptions SET
                paid_amount_cents = ?1,
                discount_percent = ?2,
                is_paid = ?3,
                notes = ?4,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?5",
            rusqlite::params![
                final_price_cents,
                input.discount_percent,
                input.is_paid,
                clean_notes(input.notes),
                input.subscription_id,
            ],
        )?;
        let subscription = subscription_by_id(&transaction, input.subscription_id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&subscription)?;
        log_activity(
            &transaction,
            actor_id,
            "subscription.update",
            Some("subscription"),
            Some(input.subscription_id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(subscription)
    })
}

#[tauri::command]
pub async fn get_dashboard_stats(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
) -> AppResult<DashboardStats> {
    db.with_conn(|conn| {
        require_user(conn, &sessions, &session_token)?;
        let today = chrono::Utc::now().date_naive();
        let today_string = today.format("%Y-%m-%d").to_string();
        let week_later = (today + chrono::Duration::days(7))
            .format("%Y-%m-%d")
            .to_string();
        let total_members: i64 = conn.query_row(
            "SELECT COUNT(*) FROM members WHERE is_deleted = 0",
            [],
            |row| row.get(0),
        )?;
        let active_members: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s
             JOIN members m ON m.id = s.member_id
             WHERE s.status = 'active' AND s.end_date >= ?1 AND m.is_deleted = 0",
            rusqlite::params![today_string],
            |row| row.get(0),
        )?;
        let expiring_this_week: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s
             JOIN members m ON m.id = s.member_id
             WHERE s.status = 'active' AND s.end_date >= ?1 AND s.end_date <= ?2
             AND m.is_deleted = 0",
            rusqlite::params![today_string, week_later],
            |row| row.get(0),
        )?;
        let expired_overdue: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s
             JOIN members m ON m.id = s.member_id
             WHERE s.status = 'active' AND s.end_date < ?1 AND m.is_deleted = 0",
            rusqlite::params![today_string],
            |row| row.get(0),
        )?;
        Ok(DashboardStats {
            active_members,
            expiring_this_week,
            expired_overdue,
            total_members,
        })
    })
}

#[tauri::command]
pub async fn cancel_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    subscription_id: i64,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, &sessions, &session_token)?;
        let before = subscription_by_id(&transaction, subscription_id)?;
        if before.status == "cancelled" {
            return Err(AppError::Conflict("Membership is already cancelled".into()));
        }
        transaction.execute(
            "UPDATE subscriptions SET
                status = 'cancelled',
                frozen_at = NULL,
                frozen_until = NULL,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?1",
            rusqlite::params![subscription_id],
        )?;
        let subscription = subscription_by_id(&transaction, subscription_id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&subscription)?;
        log_activity(
            &transaction,
            actor_id,
            "subscription.cancel",
            Some("subscription"),
            Some(subscription_id),
            Some(&before_json),
            Some(&after_json),
        )?;
        transaction.commit()?;
        Ok(subscription)
    })
}
