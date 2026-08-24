use tauri::State;

use crate::db::log_activity;
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::models::{
    CreateSubscriptionInput, DashboardStats, RenewSubscriptionInput, Subscription,
    SubscriptionWithDetails,
};

fn row_to_subscription(row: &rusqlite::Row) -> rusqlite::Result<Subscription> {
    Ok(Subscription {
        id: row.get("id")?,
        member_id: row.get("member_id")?,
        plan_id: row.get("plan_id")?,
        start_date: row.get("start_date")?,
        end_date: row.get("end_date")?,
        status: row.get("status")?,
        frozen_until: row.get("frozen_until")?,
        is_paid: row.get::<_, i64>("is_paid")? != 0,
        branch_id: row.get("branch_id")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_sub_with_details(row: &rusqlite::Row) -> rusqlite::Result<SubscriptionWithDetails> {
    Ok(SubscriptionWithDetails {
        id: row.get("id")?,
        member_id: row.get("member_id")?,
        member_name: row.get("member_name")?,
        member_photo_path: row.get("member_photo_path")?,
        plan_id: row.get("plan_id")?,
        plan_name: row.get("plan_name")?,
        plan_duration_days: row.get("plan_duration_days")?,
        plan_price_cents: row.get("plan_price_cents")?,
        start_date: row.get("start_date")?,
        end_date: row.get("end_date")?,
        status: row.get("status")?,
        frozen_until: row.get("frozen_until")?,
        is_paid: row.get::<_, i64>("is_paid")? != 0,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

const DETAILS_SELECT: &str = "\
SELECT s.id, s.member_id, s.plan_id, s.start_date, s.end_date, s.status, \
 s.frozen_until, s.is_paid, s.created_at, s.updated_at, \
 m.first_name || ' ' || m.last_name AS member_name, \
 m.photo_path AS member_photo_path, \
 p.name AS plan_name, p.duration_days AS plan_duration_days, p.price_cents AS plan_price_cents \
 FROM subscriptions s \
 JOIN members m ON m.id = s.member_id \
 JOIN plans p ON p.id = s.plan_id \
 WHERE m.is_deleted = 0";

#[tauri::command]
pub async fn list_subscriptions(db: State<'_, Db>) -> AppResult<Vec<SubscriptionWithDetails>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(&format!("{} ORDER BY s.end_date DESC", DETAILS_SELECT))?;
        let subs = stmt
            .query_map([], row_to_sub_with_details)?
            .map(|r| r.unwrap())
            .collect();
        Ok(subs)
    })
}

#[tauri::command]
pub async fn list_member_subscriptions(
    db: State<'_, Db>,
    member_id: i64,
) -> AppResult<Vec<SubscriptionWithDetails>> {
    db.with_conn(|conn| {
        let mut stmt = conn.prepare(&format!(
            "{} AND s.member_id = ?1 ORDER BY s.created_at DESC",
            DETAILS_SELECT
        ))?;
        let subs = stmt
            .query_map(rusqlite::params![member_id], row_to_sub_with_details)?
            .map(|r| r.unwrap())
            .collect();
        Ok(subs)
    })
}

fn compute_end_date(start: &str, duration_days: i64) -> String {
    let start_date = chrono::NaiveDate::parse_from_str(start, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Utc::now().date_naive());
    let end = start_date + chrono::Duration::days(duration_days);
    end.format("%Y-%m-%d").to_string()
}

#[tauri::command]
pub async fn create_subscription(
    db: State<'_, Db>,
    actor_id: i64,
    input: CreateSubscriptionInput,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let plan: (i64,) = conn
            .query_row(
                "SELECT duration_days FROM plans WHERE id = ?1",
                rusqlite::params![input.plan_id],
                |row| Ok((row.get(0)?,)),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Plan not found".into()),
                other => AppError::Sqlite(other),
            })?;

        let member_exists: i64 = conn.query_row(
            "SELECT COUNT(*) FROM members WHERE id = ?1 AND is_deleted = 0",
            rusqlite::params![input.member_id],
            |row| row.get(0),
        )?;
        if member_exists == 0 {
            return Err(AppError::NotFound("Member not found".into()));
        }

        let start_date = input.start_date.unwrap_or_else(|| {
            chrono::Utc::now()
                .date_naive()
                .format("%Y-%m-%d")
                .to_string()
        });
        let end_date = compute_end_date(&start_date, plan.0);

        conn.execute(
            "INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, is_paid) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                input.member_id,
                input.plan_id,
                start_date,
                end_date,
                input.is_paid as i64,
            ],
        )?;
        let new_id = conn.last_insert_rowid();
        log_activity(
            conn,
            actor_id,
            "subscription.create",
            Some("subscription"),
            Some(new_id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM subscriptions WHERE id = ?1",
            rusqlite::params![new_id],
            row_to_subscription,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn renew_subscription(
    db: State<'_, Db>,
    actor_id: i64,
    input: RenewSubscriptionInput,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let sub: (i64, i64, String) = conn
            .query_row(
                "SELECT member_id, plan_id, end_date FROM subscriptions WHERE id = ?1",
                rusqlite::params![input.subscription_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    AppError::NotFound("Subscription not found".into())
                }
                other => AppError::Sqlite(other),
            })?;

        let plan_id = input.plan_id.unwrap_or(sub.1);
        let duration_days: i64 = conn.query_row(
            "SELECT duration_days FROM plans WHERE id = ?1",
            rusqlite::params![plan_id],
            |row| row.get(0),
        )?;

        let today = chrono::Utc::now().date_naive();
        let prev_end = chrono::NaiveDate::parse_from_str(&sub.2, "%Y-%m-%d").unwrap_or(today);
        let start_date = if prev_end > today { prev_end } else { today };
        let start_str = start_date.format("%Y-%m-%d").to_string();
        let end_date = compute_end_date(&start_str, duration_days);

        conn.execute(
            "INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, is_paid) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![sub.0, plan_id, start_str, end_date, input.is_paid as i64],
        )?;
        let new_id = conn.last_insert_rowid();

        conn.execute(
            "UPDATE subscriptions SET status = 'cancelled', \
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?1",
            rusqlite::params![input.subscription_id],
        )?;

        log_activity(
            conn,
            actor_id,
            "subscription.renew",
            Some("subscription"),
            Some(new_id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM subscriptions WHERE id = ?1",
            rusqlite::params![new_id],
            row_to_subscription,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn freeze_subscription(
    db: State<'_, Db>,
    actor_id: i64,
    subscription_id: i64,
    frozen_until: String,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE subscriptions SET status = 'frozen', frozen_until = ?1, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?2",
            rusqlite::params![frozen_until, subscription_id],
        )?;
        log_activity(
            conn,
            actor_id,
            "subscription.freeze",
            Some("subscription"),
            Some(subscription_id),
            Some(&frozen_until),
        )?;
        conn.query_row(
            "SELECT * FROM subscriptions WHERE id = ?1",
            rusqlite::params![subscription_id],
            row_to_subscription,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn unfreeze_subscription(
    db: State<'_, Db>,
    actor_id: i64,
    subscription_id: i64,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let end_date: String = conn.query_row(
            "SELECT end_date FROM subscriptions WHERE id = ?1",
            rusqlite::params![subscription_id],
            |row| row.get(0),
        )?;

        let today = chrono::Utc::now().date_naive();
        let mut new_end = chrono::NaiveDate::parse_from_str(&end_date, "%Y-%m-%d").unwrap_or(today);
        let frozen_until_raw: Option<String> = conn.query_row(
            "SELECT frozen_until FROM subscriptions WHERE id = ?1",
            rusqlite::params![subscription_id],
            |row| row.get(0),
        )?;
        if let Some(fu) = frozen_until_raw {
            if let Ok(frozen_date) = chrono::NaiveDate::parse_from_str(&fu, "%Y-%m-%d") {
                let extension = (today - frozen_date).num_days().max(0);
                new_end += chrono::Duration::days(extension);
            }
        }
        let new_end_str = new_end.format("%Y-%m-%d").to_string();

        conn.execute(
            "UPDATE subscriptions SET status = 'active', frozen_until = NULL, end_date = ?1, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?2",
            rusqlite::params![new_end_str, subscription_id],
        )?;
        log_activity(
            conn,
            actor_id,
            "subscription.unfreeze",
            Some("subscription"),
            Some(subscription_id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM subscriptions WHERE id = ?1",
            rusqlite::params![subscription_id],
            row_to_subscription,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn set_subscription_paid(
    db: State<'_, Db>,
    actor_id: i64,
    subscription_id: i64,
    is_paid: bool,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        conn.execute(
            "UPDATE subscriptions SET is_paid = ?1, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?2",
            rusqlite::params![is_paid as i64, subscription_id],
        )?;
        log_activity(
            conn,
            actor_id,
            "subscription.set_paid",
            Some("subscription"),
            Some(subscription_id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM subscriptions WHERE id = ?1",
            rusqlite::params![subscription_id],
            row_to_subscription,
        )
        .map_err(AppError::Sqlite)
    })
}

#[tauri::command]
pub async fn get_dashboard_stats(db: State<'_, Db>) -> AppResult<DashboardStats> {
    db.with_conn(|conn| {
        let today = chrono::Utc::now().date_naive();
        let today_str = today.format("%Y-%m-%d").to_string();
        let week_later_str = (today + chrono::Duration::days(7))
            .format("%Y-%m-%d")
            .to_string();

        let total_members: i64 = conn.query_row(
            "SELECT COUNT(*) FROM members WHERE is_deleted = 0",
            [],
            |row| row.get(0),
        )?;

        let active_members: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s \
             JOIN members m ON m.id = s.member_id \
             WHERE s.status = 'active' AND s.end_date >= ?1 AND m.is_deleted = 0",
            rusqlite::params![today_str],
            |row| row.get(0),
        )?;

        let expiring_this_week: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s \
             JOIN members m ON m.id = s.member_id \
             WHERE s.status = 'active' AND s.end_date >= ?1 AND s.end_date <= ?2 \
             AND m.is_deleted = 0",
            rusqlite::params![today_str, week_later_str],
            |row| row.get(0),
        )?;

        let expired_overdue: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s \
             JOIN members m ON m.id = s.member_id \
             WHERE s.status = 'active' AND s.end_date < ?1 AND m.is_deleted = 0",
            rusqlite::params![today_str],
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
    actor_id: i64,
    subscription_id: i64,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let affected = conn.execute(
            "UPDATE subscriptions SET status = 'cancelled', frozen_until = NULL, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') \
             WHERE id = ?1 AND status != 'cancelled'",
            rusqlite::params![subscription_id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound(
                "Subscription not found or already cancelled".into(),
            ));
        }
        log_activity(
            conn,
            actor_id,
            "subscription.cancel",
            Some("subscription"),
            Some(subscription_id),
            None,
        )?;
        conn.query_row(
            "SELECT * FROM subscriptions WHERE id = ?1",
            rusqlite::params![subscription_id],
            row_to_subscription,
        )
        .map_err(AppError::Sqlite)
    })
}
