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
        final_price_cents: row.get("final_price_cents")?,
        paid_amount_cents: row.get("paid_amount_cents")?,
        unpaid_amount_cents: (row.get::<_, i64>("final_price_cents")?
            - row.get::<_, i64>("paid_amount_cents")?)
        .max(0),
        discount_percent: row.get("discount_percent")?,
        is_paid: row.get("is_paid")?,
        discount_requested_by_user_id: row.get("discount_requested_by_user_id")?,
        discount_approval_status: row.get("discount_approval_status")?,
        discount_reviewed_by_user_id: row.get("discount_reviewed_by_user_id")?,
        discount_reviewed_at: row.get("discount_reviewed_at")?,
        renews_subscription_id: row.get("renews_subscription_id")?,
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

fn validate_paid_amount(final_price_cents: i64, paid_amount_cents: i64) -> AppResult<()> {
    if paid_amount_cents < 0 || paid_amount_cents > final_price_cents {
        return Err(AppError::Validation(
            "Paid amount must be between zero and the final price".into(),
        ));
    }
    Ok(())
}

fn ensure_membership_is_editable(end_date: &str, today: &str) -> AppResult<()> {
    if end_date < today {
        return Err(AppError::Conflict(
            "Expired memberships cannot be edited".into(),
        ));
    }
    Ok(())
}

fn ensure_no_current_membership(
    conn: &rusqlite::Connection,
    member_id: i64,
    excluded_subscription_id: Option<i64>,
    today: &str,
) -> AppResult<()> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM subscriptions
         WHERE member_id = ?1
           AND status IN ('active', 'frozen')
           AND end_date >= ?2
           AND (?3 IS NULL OR id != ?3)",
        rusqlite::params![member_id, today, excluded_subscription_id],
        |row| row.get(0),
    )?;
    if count > 0 {
        return Err(AppError::Conflict(
            "Member already has an active membership".into(),
        ));
    }
    Ok(())
}

fn membership_creation_status(access_level: &str, discount_percent: i64) -> &'static str {
    if access_level == "staff" && discount_percent > 0 {
        "pending"
    } else {
        "active"
    }
}

fn reviewed_membership_status(approve: bool) -> &'static str {
    if approve {
        "active"
    } else {
        "rejected"
    }
}

fn edited_membership_status(
    before_status: &str,
    approval_status: Option<&str>,
    access_level: &str,
    previous_discount: i64,
    new_discount: i64,
) -> &'static str {
    if before_status == "cancelled" {
        return "cancelled";
    }
    if new_discount == 0 {
        return if before_status == "frozen" {
            "frozen"
        } else {
            "active"
        };
    }
    let discount_changed = new_discount != previous_discount;
    if approval_status == Some("pending") || before_status == "pending" {
        return "pending";
    }
    if approval_status == Some("rejected") && !discount_changed {
        return "rejected";
    }
    if access_level == "staff" && discount_changed {
        return "pending";
    }
    if before_status == "frozen" {
        "frozen"
    } else {
        "active"
    }
}

fn can_review_discount_request(status: &str, approval_status: Option<&str>) -> bool {
    status == "pending" && approval_status == Some("pending")
}

fn expired_overdue_count(conn: &rusqlite::Connection, today: &str) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s
         JOIN members m ON m.id = s.member_id
         WHERE s.status = 'active' AND s.end_date < ?1 AND m.is_deleted = 0
         AND NOT EXISTS (
             SELECT 1 FROM subscriptions current
             WHERE current.member_id = s.member_id
               AND current.status IN ('active', 'frozen')
               AND current.end_date >= ?1
         )",
        rusqlite::params![today],
        |row| row.get(0),
    )?)
}

fn user_access_level(conn: &rusqlite::Connection, user_id: i64) -> AppResult<String> {
    conn.query_row(
        "SELECT access_level FROM users WHERE id = ?1",
        rusqlite::params![user_id],
        |row| row.get(0),
    )
    .map_err(AppError::Sqlite)
}

#[cfg(test)]
mod tests {
    use super::{
        can_review_discount_request, discounted_price_cents, edited_membership_status,
        ensure_membership_is_editable, ensure_no_current_membership, expired_overdue_count,
        membership_creation_status, reviewed_membership_status, validate_paid_amount,
    };
    use crate::db::migrations;
    use rusqlite::Connection;

    #[test]
    fn paid_amount_must_be_within_the_final_price() {
        assert!(validate_paid_amount(10_000, 0).is_ok());
        assert!(validate_paid_amount(10_000, 5_000).is_ok());
        assert!(validate_paid_amount(10_000, 10_000).is_ok());
        assert!(validate_paid_amount(10_000, -1).is_err());
        assert!(validate_paid_amount(10_000, 10_001).is_err());
    }

    #[test]
    fn expired_memberships_cannot_be_edited() {
        assert!(ensure_membership_is_editable("2026-01-01", "2026-01-01").is_ok());
        assert!(ensure_membership_is_editable("2025-12-31", "2026-01-01").is_err());
    }

    #[test]
    fn member_cannot_have_two_current_memberships() {
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
                start_date, end_date, status
             ) VALUES (1, 1, '{}', '{}', '2026-01-01', '2026-02-01', 'active')",
            [],
        )
        .unwrap();

        assert!(ensure_no_current_membership(&conn, 1, None, "2026-01-15").is_err());
        assert!(ensure_no_current_membership(&conn, 1, Some(1), "2026-01-15").is_ok());
        assert!(ensure_no_current_membership(&conn, 1, None, "2026-02-02").is_ok());
    }

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

    #[test]
    fn staff_discount_requires_management_approval() {
        assert_eq!(membership_creation_status("staff", 10), "pending");
        assert_eq!(membership_creation_status("staff", 0), "active");
        assert_eq!(membership_creation_status("management", 10), "active");
    }

    #[test]
    fn management_can_approve_or_reject_pending_membership() {
        assert_eq!(reviewed_membership_status(true), "active");
        assert_eq!(reviewed_membership_status(false), "rejected");
    }

    #[test]
    fn membership_edits_preserve_reviewed_discount_states() {
        assert_eq!(
            edited_membership_status("rejected", Some("rejected"), "staff", 10, 10),
            "rejected"
        );
        assert_eq!(
            edited_membership_status("pending", Some("pending"), "management", 10, 10),
            "pending"
        );
        assert_eq!(
            edited_membership_status("pending", Some("pending"), "management", 10, 15),
            "pending"
        );
        assert_eq!(
            edited_membership_status("cancelled", Some("pending"), "management", 10, 10),
            "cancelled"
        );
    }

    #[test]
    fn staff_can_resubmit_changed_rejected_discount() {
        assert_eq!(
            edited_membership_status("rejected", Some("rejected"), "staff", 10, 15),
            "pending"
        );
    }

    #[test]
    fn only_operationally_pending_discount_requests_can_be_reviewed() {
        assert!(can_review_discount_request("pending", Some("pending")));
        assert!(!can_review_discount_request("cancelled", Some("pending")));
        assert!(!can_review_discount_request("rejected", Some("pending")));
    }

    #[test]
    fn renewed_member_is_not_counted_as_expired() {
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
        for (start_date, end_date) in [("2026-01-01", "2026-02-01"), ("2026-02-01", "2026-03-01")] {
            conn.execute(
                "INSERT INTO subscriptions (
                    member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                    start_date, end_date, status
                 ) VALUES (1, 1, '{}', '{}', ?1, ?2, 'active')",
                rusqlite::params![start_date, end_date],
            )
            .unwrap();
        }

        assert_eq!(expired_overdue_count(&conn, "2026-02-15").unwrap(), 0);
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
        let access_level = user_access_level(&transaction, actor_id)?;
        let member = member_snapshot(&transaction, input.member_id)?;
        let plan = plan_snapshot(&transaction, input.plan_id, true)?;
        let final_price_cents = discounted_price_cents(plan.price_cents, input.discount_percent)?;
        validate_paid_amount(final_price_cents, input.paid_amount_cents)?;
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        ensure_no_current_membership(&transaction, input.member_id, None, &today)?;
        let status = membership_creation_status(&access_level, input.discount_percent);
        let discount_requester = (status == "pending").then_some(actor_id);
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
                start_date, end_date, status, final_price_cents, paid_amount_cents,
                discount_percent, is_paid,
                discount_requested_by_user_id, discount_approval_status, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                input.member_id,
                input.plan_id,
                member_json,
                plan_json,
                start_date.format("%Y-%m-%d").to_string(),
                end_date,
                status,
                final_price_cents,
                input.paid_amount_cents,
                input.discount_percent,
                input.paid_amount_cents == final_price_cents,
                discount_requester,
                discount_requester.map(|_| "pending"),
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
        let access_level = user_access_level(&transaction, actor_id)?;
        let before = subscription_by_id(&transaction, input.subscription_id)?;
        let member = member_snapshot(&transaction, before.member_id)?;
        let plan_id = input.plan_id.unwrap_or(before.plan_id);
        let plan = plan_snapshot(&transaction, plan_id, true)?;
        let final_price_cents = discounted_price_cents(plan.price_cents, input.discount_percent)?;
        validate_paid_amount(final_price_cents, input.paid_amount_cents)?;
        let status = membership_creation_status(&access_level, input.discount_percent);
        let discount_requester = (status == "pending").then_some(actor_id);
        let today = chrono::Utc::now().date_naive();
        ensure_no_current_membership(
            &transaction,
            before.member_id,
            Some(input.subscription_id),
            &today.format("%Y-%m-%d").to_string(),
        )?;
        let previous_end = parse_date(&before.end_date, "membership end date")?;
        let start_date = previous_end.max(today);
        let end_date = compute_end_date(start_date, plan.duration_days);
        let member_json = serde_json::to_string(&member)?;
        let plan_json = serde_json::to_string(&plan)?;
        transaction.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, status, final_price_cents, paid_amount_cents,
                discount_percent, is_paid,
                discount_requested_by_user_id, discount_approval_status, renews_subscription_id, notes
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                before.member_id,
                plan_id,
                member_json,
                plan_json,
                start_date.format("%Y-%m-%d").to_string(),
                end_date,
                status,
                final_price_cents,
                input.paid_amount_cents,
                input.discount_percent,
                input.paid_amount_cents == final_price_cents,
                discount_requester,
                discount_requester.map(|_| "pending"),
                input.subscription_id,
                clean_notes(input.notes),
            ],
        )?;
        let new_id = transaction.last_insert_rowid();
        if status == "active" {
            transaction.execute(
                "UPDATE subscriptions SET
                    status = 'cancelled',
                    frozen_at = NULL,
                    frozen_until = NULL,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                 WHERE id = ?1",
                rusqlite::params![input.subscription_id],
            )?;
        }
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
        let access_level = user_access_level(&transaction, actor_id)?;
        let before = subscription_by_id(&transaction, input.subscription_id)?;
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        ensure_membership_is_editable(&before.end_date, &today)?;
        let plan = if input.plan_id == before.plan_id {
            before.plan_snapshot.clone()
        } else {
            plan_snapshot(&transaction, input.plan_id, false)?
        };
        let start_date = parse_date(&input.start_date, "start date")?;
        let end_date = parse_date(&input.end_date, "end date")?;
        if end_date < start_date {
            return Err(AppError::Validation(
                "End date must not be before start date".into(),
            ));
        }
        let final_price_cents = discounted_price_cents(plan.price_cents, input.discount_percent)?;
        validate_paid_amount(final_price_cents, input.paid_amount_cents)?;
        let discount_changed = input.discount_percent != before.discount_percent;
        let status = edited_membership_status(
            &before.status,
            before.discount_approval_status.as_deref(),
            &access_level,
            before.discount_percent,
            input.discount_percent,
        );
        let creates_staff_request =
            status == "pending" && access_level == "staff" && discount_changed;
        let management_approved_discount = access_level == "management"
            && input.discount_percent > 0
            && discount_changed
            && status != "pending";
        if matches!(status, "active" | "frozen") {
            ensure_no_current_membership(
                &transaction,
                before.member_id,
                Some(input.subscription_id),
                &today,
            )?;
        }
        let discount_requester = if creates_staff_request {
            Some(actor_id)
        } else if input.discount_percent == 0 {
            None
        } else {
            before.discount_requested_by_user_id
        };
        let discount_approval_status = if input.discount_percent == 0 {
            None
        } else if status == "pending" {
            Some("pending")
        } else if management_approved_discount {
            Some("approved")
        } else {
            before.discount_approval_status.as_deref()
        };
        let discount_reviewer = if status == "pending" || input.discount_percent == 0 {
            None
        } else if management_approved_discount {
            Some(actor_id)
        } else {
            before.discount_reviewed_by_user_id
        };
        let plan_json = serde_json::to_string(&plan)?;
        transaction.execute(
            "UPDATE subscriptions SET
                plan_id = ?1,
                plan_snapshot_json = ?2,
                start_date = ?3,
                end_date = ?4,
                status = ?5,
                final_price_cents = ?6,
                paid_amount_cents = ?7,
                discount_percent = ?8,
                is_paid = ?9,
                discount_requested_by_user_id = ?10,
                discount_approval_status = ?11,
                discount_reviewed_by_user_id = ?12,
                discount_reviewed_at = CASE
                    WHEN ?13 = 1 THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                    WHEN ?12 IS NULL THEN NULL
                    ELSE discount_reviewed_at
                END,
                notes = ?14,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?15",
            rusqlite::params![
                input.plan_id,
                plan_json,
                input.start_date,
                input.end_date,
                status,
                final_price_cents,
                input.paid_amount_cents,
                input.discount_percent,
                input.paid_amount_cents == final_price_cents,
                discount_requester,
                discount_approval_status,
                discount_reviewer,
                management_approved_discount,
                clean_notes(input.notes),
                input.subscription_id,
            ],
        )?;
        if status == "active" && before.status == "pending" {
            if let Some(previous_id) = before.renews_subscription_id {
                transaction.execute(
                    "UPDATE subscriptions SET status = 'cancelled', frozen_at = NULL,
                        frozen_until = NULL,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                     WHERE id = ?1",
                    rusqlite::params![previous_id],
                )?;
            }
        }
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

fn review_discount_request(
    db: &Db,
    sessions: &Sessions,
    session_token: &str,
    subscription_id: i64,
    approve: bool,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let transaction = conn.transaction()?;
        let actor_id = require_management(&transaction, sessions, session_token)?;
        let before = subscription_by_id(&transaction, subscription_id)?;
        if !can_review_discount_request(&before.status, before.discount_approval_status.as_deref())
        {
            return Err(AppError::Conflict(
                "Only pending discount requests can be reviewed".into(),
            ));
        }
        let reviewed_status = reviewed_membership_status(approve);
        let status = reviewed_status;
        if approve && status == "active" {
            let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
            ensure_no_current_membership(
                &transaction,
                before.member_id,
                before.renews_subscription_id,
                &today,
            )?;
        }
        transaction.execute(
            "UPDATE subscriptions SET
                status = ?1,
                discount_approval_status = ?2,
                discount_reviewed_by_user_id = ?3,
                discount_reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?4",
            rusqlite::params![
                status,
                if approve { "approved" } else { "rejected" },
                actor_id,
                subscription_id,
            ],
        )?;
        if approve && status == "active" {
            if let Some(previous_id) = before.renews_subscription_id {
                transaction.execute(
                    "UPDATE subscriptions SET status = 'cancelled', frozen_at = NULL,
                        frozen_until = NULL,
                        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
                     WHERE id = ?1",
                    rusqlite::params![previous_id],
                )?;
            }
        }
        let subscription = subscription_by_id(&transaction, subscription_id)?;
        let before_json = serde_json::to_string(&before)?;
        let after_json = serde_json::to_string(&subscription)?;
        log_activity(
            &transaction,
            actor_id,
            if approve {
                "subscription.approve_discount"
            } else {
                "subscription.reject_discount"
            },
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
pub async fn approve_subscription_discount(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    subscription_id: i64,
) -> AppResult<Subscription> {
    review_discount_request(&db, &sessions, &session_token, subscription_id, true)
}

#[tauri::command]
pub async fn reject_subscription_discount(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    subscription_id: i64,
) -> AppResult<Subscription> {
    review_discount_request(&db, &sessions, &session_token, subscription_id, false)
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
        let expired_overdue = expired_overdue_count(conn, &today_string)?;
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
