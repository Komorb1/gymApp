use std::collections::HashMap;

use rusqlite::types::Type;
use tauri::State;

use crate::commands::members::row_to_member;
use crate::db::{log_activity, Db};
use crate::error::{AppError, AppResult};
use crate::models::{
    CreateSubscriptionInput, DashboardStats, Member, MemberSnapshot, PlanSnapshot,
    RenewSubscriptionInput, Subscription, UpdateSubscriptionInput,
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
        member: None,
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
        payment_method: row.get("payment_method")?,
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

const MEMBER_COLUMNS: &str = "id, first_name, middle_name, last_name, id_number, phone, \
     whatsapp_no, email, birth_date, notes, photo_path, is_deleted, deleted_at, created_at, updated_at";

fn attach_current_members(
    conn: &rusqlite::Connection,
    subscriptions: &mut [Subscription],
) -> AppResult<()> {
    let mut member_ids = subscriptions
        .iter()
        .map(|subscription| subscription.member_id)
        .collect::<Vec<_>>();
    member_ids.sort_unstable();
    member_ids.dedup();
    if member_ids.is_empty() {
        return Ok(());
    }

    let placeholders = vec!["?"; member_ids.len()].join(", ");
    let mut statement = conn.prepare(&format!(
        "SELECT {MEMBER_COLUMNS} FROM members WHERE id IN ({placeholders})"
    ))?;
    let members = statement
        .query_map(rusqlite::params_from_iter(member_ids.iter()), row_to_member)?
        .collect::<Result<Vec<Member>, _>>()?
        .into_iter()
        .map(|member| (member.id, member))
        .collect::<HashMap<i64, Member>>();

    for subscription in subscriptions.iter_mut() {
        if let Some(member) = members.get(&subscription.member_id) {
            subscription.member = Some(member.clone());
        }
    }

    Ok(())
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

const PAYMENT_METHODS: [&str; 2] = ["cash", "bank_transfer"];

fn clean_payment_method(value: Option<String>) -> AppResult<Option<String>> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if PAYMENT_METHODS.contains(&trimmed) {
        return Ok(Some(trimmed.to_string()));
    }
    Err(AppError::Validation(
        "Payment type must be cash or bank transfer".into(),
    ))
}

fn resolve_payment_method(
    requested: Option<Option<String>>,
    current: Option<String>,
) -> AppResult<Option<String>> {
    match requested {
        None => Ok(current),
        Some(value) => clean_payment_method(value),
    }
}

fn renewal_start_date(
    previous_end: chrono::NaiveDate,
    today: chrono::NaiveDate,
) -> chrono::NaiveDate {
    if previous_end >= today {
        previous_end + chrono::Duration::days(1)
    } else {
        today
    }
}

fn membership_created_at(
    created_at: Option<String>,
    now: chrono::DateTime<chrono::Utc>,
) -> AppResult<String> {
    let timestamp = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let Some(value) = created_at else {
        return Ok(timestamp);
    };
    if value.trim().is_empty() {
        return Ok(timestamp);
    }
    let date = parse_date(
        value.get(..10).unwrap_or(value.as_str()),
        "membership created date",
    )?;
    Ok(format!(
        "{}T{}",
        date.format("%Y-%m-%d"),
        now.format("%H:%M:%SZ")
    ))
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

fn ensure_membership_dates_are_valid(start_date: &str, end_date: &str) -> AppResult<()> {
    if end_date < start_date {
        return Err(AppError::Validation(
            "End date must not be before start date".into(),
        ));
    }
    Ok(())
}

fn ensure_no_current_membership(
    conn: &rusqlite::Connection,
    member_id: i64,
    excluded_subscription_id: Option<i64>,
    predecessor_subscription_id: Option<i64>,
    today: &str,
) -> AppResult<()> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM subscriptions
         WHERE member_id = ?1
           AND status IN ('active', 'frozen')
           AND end_date >= ?2
           AND (?3 IS NULL OR id != ?3)
           AND (?4 IS NULL OR id != ?4)",
        rusqlite::params![
            member_id,
            today,
            excluded_subscription_id,
            predecessor_subscription_id
        ],
        |row| row.get(0),
    )?;
    if count > 0 {
        return Err(AppError::Conflict(
            "Member already has an active membership".into(),
        ));
    }
    Ok(())
}

fn ensure_membership_can_freeze(before: &Subscription, today: chrono::NaiveDate) -> AppResult<()> {
    if before.status != "active" {
        return Err(AppError::Conflict(
            "Only active memberships can be frozen".into(),
        ));
    }
    if parse_date(&before.end_date, "membership end date")? < today {
        return Err(AppError::Conflict(
            "Expired memberships cannot be frozen".into(),
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

const EXPIRED_WINDOW_DAYS: i64 = 30;

fn expired_overdue_count(conn: &rusqlite::Connection, today: chrono::NaiveDate) -> AppResult<i64> {
    let today_string = today.format("%Y-%m-%d").to_string();
    let expiration_floor = (today - chrono::Duration::days(EXPIRED_WINDOW_DAYS))
        .format("%Y-%m-%d")
        .to_string();
    Ok(conn.query_row(
        "SELECT COUNT(DISTINCT s.member_id) FROM subscriptions s
         JOIN members m ON m.id = s.member_id
         WHERE s.status = 'active' AND s.end_date < ?1 AND s.end_date >= ?2 AND m.is_deleted = 0
         AND NOT EXISTS (
             SELECT 1 FROM subscriptions current
             WHERE current.member_id = s.member_id
               AND current.status IN ('active', 'frozen')
               AND current.end_date >= ?1
         )",
        rusqlite::params![today_string, expiration_floor],
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
        apply_discount_review, attach_current_members, can_review_discount_request,
        clean_payment_method, create_membership, discounted_price_cents, edited_membership_status,
        ensure_membership_can_freeze, ensure_membership_dates_are_valid,
        ensure_no_current_membership, expired_overdue_count, membership_created_at,
        membership_creation_status, renew_membership, resolve_payment_method,
        reviewed_membership_status, row_to_subscription, update_membership, validate_paid_amount,
    };
    use crate::db::migrations;
    use crate::models::{
        CreateSubscriptionInput, MemberSnapshot, PlanSnapshot, RenewSubscriptionInput,
        Subscription, UpdateSubscriptionInput,
    };
    use crate::session::Sessions;
    use chrono::{Duration, NaiveDate, Utc};
    use rusqlite::Connection;

    fn date(year: i32, month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(year, month, day).unwrap()
    }

    #[test]
    fn paid_amount_must_be_within_the_final_price() {
        assert!(validate_paid_amount(10_000, 0).is_ok());
        assert!(validate_paid_amount(10_000, 5_000).is_ok());
        assert!(validate_paid_amount(10_000, 10_000).is_ok());
        assert!(validate_paid_amount(10_000, -1).is_err());
        assert!(validate_paid_amount(10_000, 10_001).is_err());
    }

    #[test]
    fn editing_a_plan_does_not_repriced_existing_memberships() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::runner().run(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone) VALUES ('Amina', 'Saleh', '971555000000')",
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
                start_date, end_date, final_price_cents, paid_amount_cents
             ) VALUES (1, 1, '{}',
                '{\"id\":1,\"name\":\"Monthly\",\"duration_days\":30,\"price_cents\":5000}',
                '2026-01-01', '2026-12-01', 5000, 2500)",
            [],
        )
        .unwrap();

        conn.execute("UPDATE plans SET price_cents = 9000 WHERE id = 1", [])
            .unwrap();

        let (plan_price, snapshot_price, final_price, paid_amount): (i64, i64, i64, i64) = conn
            .query_row(
                "SELECT p.price_cents,
                        json_extract(s.plan_snapshot_json, '$.price_cents'),
                        s.final_price_cents,
                        s.paid_amount_cents
                 FROM subscriptions s JOIN plans p ON p.id = s.plan_id
                 WHERE s.id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();

        assert_eq!(plan_price, 9000);
        assert_eq!(snapshot_price, 5000);
        assert_eq!(final_price, 5000);
        assert_eq!(paid_amount, 2500);
        assert_eq!(discounted_price_cents(snapshot_price, 10).unwrap(), 4500);
    }

    #[test]
    fn membership_dates_must_not_end_before_they_start() {
        assert!(ensure_membership_dates_are_valid("2026-01-01", "2026-02-01").is_ok());
        assert!(ensure_membership_dates_are_valid("2026-01-01", "2026-01-01").is_ok());
        assert!(ensure_membership_dates_are_valid("2026-02-01", "2026-01-01").is_err());
    }

    #[test]
    fn a_requested_creation_date_keeps_the_current_time_of_day() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-13T09:30:15Z")
            .unwrap()
            .with_timezone(&Utc);

        assert_eq!(
            membership_created_at(Some("2020-05-04".into()), now).unwrap(),
            "2020-05-04T09:30:15Z"
        );
        assert_eq!(
            membership_created_at(Some("2020-05-04T12:00:00Z".into()), now).unwrap(),
            "2020-05-04T09:30:15Z"
        );
        assert_eq!(
            membership_created_at(None, now).unwrap(),
            "2026-10-13T09:30:15Z"
        );
        assert_eq!(
            membership_created_at(Some("   ".into()), now).unwrap(),
            "2026-10-13T09:30:15Z"
        );
    }

    #[test]
    fn an_invalid_creation_date_is_rejected() {
        let now = Utc::now();

        assert!(membership_created_at(Some("13/10/2026".into()), now).is_err());
        assert!(membership_created_at(Some("2026-13-45".into()), now).is_err());
        assert!(membership_created_at(Some("yesterday".into()), now).is_err());
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

        assert!(ensure_no_current_membership(&conn, 1, None, None, "2026-01-15").is_err());
        assert!(ensure_no_current_membership(&conn, 1, Some(1), None, "2026-01-15").is_ok());
        assert!(ensure_no_current_membership(&conn, 1, None, None, "2026-02-02").is_ok());
    }

    #[test]
    fn a_renewal_overlaps_only_its_own_predecessor() {
        let conn = setup_conn();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let previous_end = (today + Duration::days(10)).format("%Y-%m-%d").to_string();
        let renewal_end = (today + Duration::days(40)).format("%Y-%m-%d").to_string();
        let previous_id = insert_active_membership(&conn, &previous_end);
        conn.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, status, final_price_cents, paid_amount_cents,
                renews_subscription_id
             ) VALUES (1, 1, ?1, ?2, ?3, ?4, 'active', 5000, 5000, ?5)",
            rusqlite::params![
                serde_json::to_string(&member_snapshot_fixture()).unwrap(),
                serde_json::to_string(&plan_snapshot_fixture()).unwrap(),
                previous_end,
                renewal_end,
                previous_id
            ],
        )
        .unwrap();
        let renewal_id = conn.last_insert_rowid();
        let today_string = today.format("%Y-%m-%d").to_string();

        assert!(ensure_no_current_membership(
            &conn,
            1,
            Some(renewal_id),
            Some(previous_id),
            &today_string
        )
        .is_ok());
        assert!(
            ensure_no_current_membership(&conn, 1, Some(renewal_id), None, &today_string).is_err()
        );
        assert!(ensure_no_current_membership(&conn, 1, None, None, &today_string).is_err());
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

        assert_eq!(expired_overdue_count(&conn, date(2026, 2, 15)).unwrap(), 0);
    }

    #[test]
    fn only_recent_expiries_are_counted_as_overdue() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::runner().run(&mut conn).unwrap();
        for (id, phone) in [(1, "971555000001"), (2, "971555000002")] {
            conn.execute(
                "INSERT INTO members (id, first_name, last_name, phone, whatsapp_no)
                 VALUES (?1, 'Member', ?2, ?2, ?2)",
                rusqlite::params![id, phone],
            )
            .unwrap();
        }
        conn.execute(
            "INSERT INTO plans (name, duration_days, price_cents) VALUES ('Monthly', 30, 5000)",
            [],
        )
        .unwrap();
        for (member_id, end_date) in [(1, "2026-01-06"), (2, "2026-02-05")] {
            conn.execute(
                "INSERT INTO subscriptions (
                    member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                    start_date, end_date, status
                 ) VALUES (?1, 1, '{}', '{}', '2025-12-01', ?2, 'active')",
                rusqlite::params![member_id, end_date],
            )
            .unwrap();
        }

        assert_eq!(expired_overdue_count(&conn, date(2026, 2, 15)).unwrap(), 1);
    }

    #[test]
    fn membership_rows_carry_the_current_member_details() {
        let conn = setup_conn();
        insert_member_and_plan(&conn);
        insert_active_membership(&conn, "2027-01-01");

        conn.execute(
            "UPDATE members SET first_name = 'Abdulsalam', phone = '0506787651' WHERE id = 1",
            [],
        )
        .unwrap();

        let mut subscriptions = conn
            .prepare("SELECT * FROM subscriptions")
            .unwrap()
            .query_map([], row_to_subscription)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        attach_current_members(&conn, &mut subscriptions).unwrap();

        let subscription = &subscriptions[0];
        let member = subscription.member.as_ref().unwrap();
        assert_eq!(member.first_name, "Abdulsalam");
        assert_eq!(member.phone, "0506787651");
        assert_eq!(subscription.member_snapshot.first_name, "Test");
        assert_eq!(subscription.member_snapshot.phone, "123");

        let payload = serde_json::to_string(subscription).unwrap();
        assert!(payload.contains("\"member\":{\"id\":1,\"first_name\":\"Abdulsalam\""));
        assert!(payload.contains("\"member_snapshot\":{\"id\":1,\"first_name\":\"Test\""));
    }

    #[test]
    fn soft_deleted_members_still_name_their_memberships() {
        let conn = setup_conn();
        insert_member_and_plan(&conn);
        insert_active_membership(&conn, "2027-01-01");
        conn.execute(
            "UPDATE members SET is_deleted = 1, deleted_at = '2026-10-14T00:00:00Z' WHERE id = 1",
            [],
        )
        .unwrap();

        let mut subscriptions = conn
            .prepare("SELECT * FROM subscriptions")
            .unwrap()
            .query_map([], row_to_subscription)
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        attach_current_members(&conn, &mut subscriptions).unwrap();

        let member = subscriptions[0].member.as_ref().unwrap();
        assert_eq!(member.first_name, "Test");
        assert!(member.is_deleted);
    }

    fn member_snapshot_fixture() -> MemberSnapshot {
        MemberSnapshot {
            id: 1,
            first_name: "Test".into(),
            middle_name: None,
            last_name: "Member".into(),
            id_number: None,
            phone: "123".into(),
            whatsapp_no: None,
            email: None,
            birth_date: None,
            notes: None,
            photo_path: None,
            created_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    fn plan_snapshot_fixture() -> PlanSnapshot {
        PlanSnapshot {
            id: 1,
            name: "Monthly".into(),
            duration_days: 30,
            price_cents: 5000,
        }
    }

    fn subscription_fixture(status: &str, end_date: String) -> Subscription {
        Subscription {
            id: 1,
            member_id: 1,
            plan_id: 1,
            member_snapshot: member_snapshot_fixture(),
            member: None,
            plan_snapshot: plan_snapshot_fixture(),
            start_date: "2026-01-01".into(),
            end_date,
            status: status.into(),
            frozen_at: None,
            frozen_until: None,
            final_price_cents: 5000,
            paid_amount_cents: 5000,
            unpaid_amount_cents: 0,
            discount_percent: 0,
            is_paid: true,
            payment_method: None,
            discount_requested_by_user_id: None,
            discount_approval_status: None,
            discount_reviewed_by_user_id: None,
            discount_reviewed_at: None,
            renews_subscription_id: None,
            notes: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    fn setup_conn() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        migrations::runner().run(&mut conn).unwrap();
        conn
    }

    fn insert_user(conn: &Connection, username: &str, access_level: &str) -> i64 {
        conn.execute(
            "INSERT INTO users (username, pin_hash, access_level) VALUES (?1, 'pin', ?2)",
            rusqlite::params![username, access_level],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn insert_member_and_plan(conn: &Connection) {
        conn.execute(
            "INSERT INTO members (first_name, last_name, phone) VALUES ('Test', 'Member', '123')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO plans (name, duration_days, price_cents) VALUES ('Monthly', 30, 5000)",
            [],
        )
        .unwrap();
    }

    fn insert_active_membership(conn: &Connection, end_date: &str) -> i64 {
        conn.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, status, final_price_cents, paid_amount_cents
             ) VALUES (1, 1, ?1, ?2, date(?3, '-30 days'), ?3, 'active', 5000, 5000)",
            rusqlite::params![
                serde_json::to_string(&member_snapshot_fixture()).unwrap(),
                serde_json::to_string(&plan_snapshot_fixture()).unwrap(),
                end_date
            ],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    fn membership_status(conn: &Connection, id: i64) -> String {
        conn.query_row(
            "SELECT status FROM subscriptions WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn renewal_starts_the_day_after_the_previous_membership_ends() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let manager = insert_user(&conn, "manager", "management");
        let token = sessions.issue(manager).unwrap();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let previous_end = (today + Duration::days(25)).format("%Y-%m-%d").to_string();
        let previous_id = insert_active_membership(&conn, &previous_end);

        let renewed = renew_membership(
            &mut conn,
            &sessions,
            &token,
            RenewSubscriptionInput {
                subscription_id: previous_id,
                plan_id: None,
                discount_percent: 0,
                paid_amount_cents: 5000,
                payment_method: None,
                notes: None,
            },
        )
        .unwrap();

        assert_eq!(renewed.status, "active");
        assert_eq!(
            renewed.start_date,
            (today + Duration::days(26)).format("%Y-%m-%d").to_string()
        );
        assert_eq!(renewed.renews_subscription_id, Some(previous_id));
        assert_eq!(membership_status(&conn, previous_id), "active");
    }

    #[test]
    fn renewal_of_a_membership_that_ends_today_starts_tomorrow() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let manager = insert_user(&conn, "manager", "management");
        let token = sessions.issue(manager).unwrap();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let previous_id = insert_active_membership(&conn, &today.format("%Y-%m-%d").to_string());

        let renewed = renew_membership(
            &mut conn,
            &sessions,
            &token,
            RenewSubscriptionInput {
                subscription_id: previous_id,
                plan_id: None,
                discount_percent: 0,
                paid_amount_cents: 5000,
                payment_method: None,
                notes: None,
            },
        )
        .unwrap();

        assert_eq!(
            renewed.start_date,
            (today + Duration::days(1)).format("%Y-%m-%d").to_string()
        );
    }

    #[test]
    fn renewal_of_an_expired_membership_starts_today() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let manager = insert_user(&conn, "manager", "management");
        let token = sessions.issue(manager).unwrap();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let previous_end = (today - Duration::days(10)).format("%Y-%m-%d").to_string();
        let previous_id = insert_active_membership(&conn, &previous_end);

        let renewed = renew_membership(
            &mut conn,
            &sessions,
            &token,
            RenewSubscriptionInput {
                subscription_id: previous_id,
                plan_id: None,
                discount_percent: 0,
                paid_amount_cents: 5000,
                payment_method: None,
                notes: None,
            },
        )
        .unwrap();

        assert_eq!(renewed.start_date, today.format("%Y-%m-%d").to_string());
    }

    #[test]
    fn renewal_stores_the_payment_type_it_is_given() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let manager = insert_user(&conn, "manager", "management");
        let token = sessions.issue(manager).unwrap();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let previous_id = insert_active_membership(
            &conn,
            &(today + Duration::days(25)).format("%Y-%m-%d").to_string(),
        );

        let renewed = renew_membership(
            &mut conn,
            &sessions,
            &token,
            RenewSubscriptionInput {
                subscription_id: previous_id,
                plan_id: None,
                discount_percent: 0,
                paid_amount_cents: 5000,
                payment_method: Some("bank_transfer".into()),
                notes: None,
            },
        )
        .unwrap();

        assert_eq!(renewed.payment_method.as_deref(), Some("bank_transfer"));
    }

    #[test]
    fn renewal_inherits_the_previous_payment_type_when_none_is_given() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let manager = insert_user(&conn, "manager", "management");
        let token = sessions.issue(manager).unwrap();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let previous_id = insert_active_membership(
            &conn,
            &(today + Duration::days(25)).format("%Y-%m-%d").to_string(),
        );
        conn.execute(
            "UPDATE subscriptions SET payment_method = 'cash' WHERE id = ?1",
            rusqlite::params![previous_id],
        )
        .unwrap();

        let renewed = renew_membership(
            &mut conn,
            &sessions,
            &token,
            RenewSubscriptionInput {
                subscription_id: previous_id,
                plan_id: None,
                discount_percent: 0,
                paid_amount_cents: 5000,
                payment_method: None,
                notes: None,
            },
        )
        .unwrap();

        assert_eq!(renewed.payment_method.as_deref(), Some("cash"));
    }

    #[test]
    fn renewal_rejects_an_unknown_payment_type() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let manager = insert_user(&conn, "manager", "management");
        let token = sessions.issue(manager).unwrap();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let previous_id = insert_active_membership(
            &conn,
            &(today + Duration::days(25)).format("%Y-%m-%d").to_string(),
        );

        let result = renew_membership(
            &mut conn,
            &sessions,
            &token,
            RenewSubscriptionInput {
                subscription_id: previous_id,
                plan_id: None,
                discount_percent: 0,
                paid_amount_cents: 5000,
                payment_method: Some("cheque".into()),
                notes: None,
            },
        );

        assert!(result.is_err());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM subscriptions", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn payment_types_are_limited_to_cash_and_bank_transfer() {
        assert_eq!(clean_payment_method(None).unwrap(), None);
        assert_eq!(clean_payment_method(Some("   ".into())).unwrap(), None);
        assert_eq!(
            clean_payment_method(Some("cash".into()))
                .unwrap()
                .as_deref(),
            Some("cash")
        );
        assert_eq!(
            clean_payment_method(Some("bank_transfer".into()))
                .unwrap()
                .as_deref(),
            Some("bank_transfer")
        );
        assert!(clean_payment_method(Some("cheque".into())).is_err());
    }

    #[test]
    fn editing_keeps_replaces_or_clears_the_payment_type_deliberately() {
        assert_eq!(
            resolve_payment_method(None, Some("cash".into()))
                .unwrap()
                .as_deref(),
            Some("cash")
        );
        assert_eq!(
            resolve_payment_method(Some(Some("bank_transfer".into())), Some("cash".into()))
                .unwrap()
                .as_deref(),
            Some("bank_transfer")
        );
        assert_eq!(
            resolve_payment_method(Some(None), Some("cash".into())).unwrap(),
            None
        );
        assert_eq!(
            resolve_payment_method(Some(Some(String::new())), None).unwrap(),
            None
        );
        assert!(resolve_payment_method(Some(Some("cheque".into())), None).is_err());
    }

    #[test]
    fn membership_rows_without_a_payment_type_stay_unset() {
        let conn = setup_conn();
        insert_member_and_plan(&conn);
        let id = insert_active_membership(&conn, "2027-01-01");

        let subscription = conn
            .query_row(
                "SELECT * FROM subscriptions WHERE id = ?1",
                rusqlite::params![id],
                row_to_subscription,
            )
            .unwrap();

        assert_eq!(subscription.payment_method, None);
    }

    #[test]
    fn the_database_rejects_an_unknown_payment_type() {
        let conn = setup_conn();
        insert_member_and_plan(&conn);

        let result = conn.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, status, payment_method
             ) VALUES (1, 1, '{}', '{}', '2026-01-01', '2026-02-01', 'active', 'cheque')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn creating_a_membership_stores_the_payment_type() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let manager = insert_user(&conn, "manager", "management");
        let token = sessions.issue(manager).unwrap();
        insert_member_and_plan(&conn);

        let created = create_membership(
            &mut conn,
            &sessions,
            &token,
            CreateSubscriptionInput {
                member_id: 1,
                plan_id: 1,
                start_date: Some("2026-01-01".into()),
                created_at: None,
                discount_percent: 0,
                paid_amount_cents: 5000,
                payment_method: Some("cash".into()),
                notes: None,
            },
        )
        .unwrap();

        assert_eq!(created.payment_method.as_deref(), Some("cash"));
        assert_eq!(created.start_date, "2026-01-01");
        assert_eq!(created.final_price_cents, 5000);
    }

    #[test]
    fn editing_a_membership_keeps_sets_and_clears_the_payment_type() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let manager = insert_user(&conn, "manager", "management");
        let token = sessions.issue(manager).unwrap();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let id = insert_active_membership(
            &conn,
            &(today + Duration::days(25)).format("%Y-%m-%d").to_string(),
        );
        conn.execute(
            "UPDATE subscriptions SET payment_method = 'cash' WHERE id = ?1",
            rusqlite::params![id],
        )
        .unwrap();

        let edit = |payment_method: Option<Option<String>>| UpdateSubscriptionInput {
            subscription_id: id,
            plan_id: 1,
            start_date: "2026-01-01".into(),
            end_date: "2026-03-01".into(),
            discount_percent: 0,
            paid_amount_cents: 5000,
            payment_method,
            notes: None,
        };

        let kept = update_membership(&mut conn, &sessions, &token, edit(None)).unwrap();
        assert_eq!(kept.payment_method.as_deref(), Some("cash"));

        let changed = update_membership(
            &mut conn,
            &sessions,
            &token,
            edit(Some(Some("bank_transfer".into()))),
        )
        .unwrap();
        assert_eq!(changed.payment_method.as_deref(), Some("bank_transfer"));

        let cleared = update_membership(&mut conn, &sessions, &token, edit(Some(None))).unwrap();
        assert_eq!(cleared.payment_method, None);
    }

    #[test]
    fn approved_staff_renewal_keeps_previous_membership_active() {
        let mut conn = setup_conn();
        let sessions = Sessions::new();
        let staff = insert_user(&conn, "staff", "staff");
        let manager = insert_user(&conn, "manager", "management");
        let staff_token = sessions.issue(staff).unwrap();
        insert_member_and_plan(&conn);
        let today = Utc::now().date_naive();
        let previous_end = (today + Duration::days(25)).format("%Y-%m-%d").to_string();
        let previous_id = insert_active_membership(&conn, &previous_end);

        let pending = renew_membership(
            &mut conn,
            &sessions,
            &staff_token,
            RenewSubscriptionInput {
                subscription_id: previous_id,
                plan_id: None,
                discount_percent: 10,
                paid_amount_cents: 4500,
                payment_method: None,
                notes: None,
            },
        )
        .unwrap();
        assert_eq!(pending.status, "pending");
        assert_eq!(membership_status(&conn, previous_id), "active");

        let approved = apply_discount_review(&mut conn, manager, pending.id, true).unwrap();

        assert_eq!(approved.status, "active");
        assert_eq!(membership_status(&conn, previous_id), "active");
    }

    #[test]
    fn expired_memberships_cannot_be_frozen() {
        let today = Utc::now().date_naive();
        let future = (today + Duration::days(7)).format("%Y-%m-%d").to_string();
        let past = (today - Duration::days(1)).format("%Y-%m-%d").to_string();

        assert!(ensure_membership_can_freeze(
            &subscription_fixture("active", future.clone()),
            today
        )
        .is_ok());
        assert!(
            ensure_membership_can_freeze(&subscription_fixture("active", past), today).is_err()
        );
        assert!(ensure_membership_can_freeze(
            &subscription_fixture("frozen", future.clone()),
            today
        )
        .is_err());
        assert!(
            ensure_membership_can_freeze(&subscription_fixture("cancelled", future), today)
                .is_err()
        );
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
        let mut subscriptions = {
            let mut statement =
                conn.prepare("SELECT * FROM subscriptions ORDER BY end_date DESC")?;
            let rows = statement
                .query_map([], row_to_subscription)?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        attach_current_members(conn, &mut subscriptions)?;
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
        let mut subscriptions = {
            let mut statement = conn.prepare(
                "SELECT * FROM subscriptions WHERE member_id = ?1 ORDER BY created_at DESC",
            )?;
            let rows = statement
                .query_map(rusqlite::params![member_id], row_to_subscription)?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };
        attach_current_members(conn, &mut subscriptions)?;
        Ok(subscriptions)
    })
}

fn create_membership(
    conn: &mut rusqlite::Connection,
    sessions: &Sessions,
    session_token: &str,
    input: CreateSubscriptionInput,
) -> AppResult<Subscription> {
    {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, sessions, session_token)?;
        let access_level = user_access_level(&transaction, actor_id)?;
        let member = member_snapshot(&transaction, input.member_id)?;
        let plan = plan_snapshot(&transaction, input.plan_id, true)?;
        let final_price_cents = discounted_price_cents(plan.price_cents, input.discount_percent)?;
        validate_paid_amount(final_price_cents, input.paid_amount_cents)?;
        let payment_method = clean_payment_method(input.payment_method)?;
        let now = chrono::Utc::now();
        let today = now.format("%Y-%m-%d").to_string();
        let created_at = membership_created_at(input.created_at, now)?;
        ensure_no_current_membership(&transaction, input.member_id, None, None, &today)?;
        let status = membership_creation_status(&access_level, input.discount_percent);
        let discount_requester = (status == "pending").then_some(actor_id);
        let start_date = match input.start_date {
            Some(value) => parse_date(&value, "start date")?,
            None => now.date_naive(),
        };
        let end_date = compute_end_date(start_date, plan.duration_days);
        let member_json = serde_json::to_string(&member)?;
        let plan_json = serde_json::to_string(&plan)?;
        transaction.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, status, final_price_cents, paid_amount_cents,
                discount_percent, is_paid,
                discount_requested_by_user_id, discount_approval_status, notes, created_at,
                payment_method
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
                created_at,
                payment_method,
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
    }
}

#[tauri::command]
pub async fn create_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: CreateSubscriptionInput,
) -> AppResult<Subscription> {
    db.with_conn(|conn| create_membership(conn, &sessions, &session_token, input))
}

fn renew_membership(
    conn: &mut rusqlite::Connection,
    sessions: &Sessions,
    session_token: &str,
    input: RenewSubscriptionInput,
) -> AppResult<Subscription> {
    {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, sessions, session_token)?;
        let access_level = user_access_level(&transaction, actor_id)?;
        let before = subscription_by_id(&transaction, input.subscription_id)?;
        let member = member_snapshot(&transaction, before.member_id)?;
        let plan_id = input.plan_id.unwrap_or(before.plan_id);
        let plan = plan_snapshot(&transaction, plan_id, true)?;
        let final_price_cents = discounted_price_cents(plan.price_cents, input.discount_percent)?;
        validate_paid_amount(final_price_cents, input.paid_amount_cents)?;
        let payment_method = match clean_payment_method(input.payment_method)? {
            Some(method) => Some(method),
            None => before.payment_method.clone(),
        };
        let status = membership_creation_status(&access_level, input.discount_percent);
        let discount_requester = (status == "pending").then_some(actor_id);
        let today = chrono::Utc::now().date_naive();
        ensure_no_current_membership(
            &transaction,
            before.member_id,
            Some(input.subscription_id),
            None,
            &today.format("%Y-%m-%d").to_string(),
        )?;
        let previous_end = parse_date(&before.end_date, "membership end date")?;
        let start_date = renewal_start_date(previous_end, today);
        let end_date = compute_end_date(start_date, plan.duration_days);
        let member_json = serde_json::to_string(&member)?;
        let plan_json = serde_json::to_string(&plan)?;
        transaction.execute(
            "INSERT INTO subscriptions (
                member_id, plan_id, member_snapshot_json, plan_snapshot_json,
                start_date, end_date, status, final_price_cents, paid_amount_cents,
                discount_percent, is_paid,
                discount_requested_by_user_id, discount_approval_status, renews_subscription_id, notes,
                payment_method
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
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
                payment_method,
            ],
        )?;
        let new_id = transaction.last_insert_rowid();
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
    }
}

#[tauri::command]
pub async fn renew_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: RenewSubscriptionInput,
) -> AppResult<Subscription> {
    db.with_conn(|conn| renew_membership(conn, &sessions, &session_token, input))
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
        ensure_membership_can_freeze(&before, chrono::Utc::now().date_naive())?;
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

fn update_membership(
    conn: &mut rusqlite::Connection,
    sessions: &Sessions,
    session_token: &str,
    input: UpdateSubscriptionInput,
) -> AppResult<Subscription> {
    {
        let transaction = conn.transaction()?;
        let actor_id = require_user(&transaction, sessions, session_token)?;
        let access_level = user_access_level(&transaction, actor_id)?;
        let before = subscription_by_id(&transaction, input.subscription_id)?;
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let plan = if input.plan_id == before.plan_id {
            before.plan_snapshot.clone()
        } else {
            plan_snapshot(&transaction, input.plan_id, false)?
        };
        parse_date(&input.start_date, "start date")?;
        parse_date(&input.end_date, "end date")?;
        ensure_membership_dates_are_valid(&input.start_date, &input.end_date)?;
        let final_price_cents = discounted_price_cents(plan.price_cents, input.discount_percent)?;
        validate_paid_amount(final_price_cents, input.paid_amount_cents)?;
        let payment_method =
            resolve_payment_method(input.payment_method, before.payment_method.clone())?;
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
                before.renews_subscription_id,
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
                payment_method = ?15,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
             WHERE id = ?16",
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
                payment_method,
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
    }
}

#[tauri::command]
pub async fn update_subscription(
    db: State<'_, Db>,
    sessions: State<'_, Sessions>,
    session_token: String,
    input: UpdateSubscriptionInput,
) -> AppResult<Subscription> {
    db.with_conn(|conn| update_membership(conn, &sessions, &session_token, input))
}

fn apply_discount_review(
    conn: &mut rusqlite::Connection,
    actor_id: i64,
    subscription_id: i64,
    approve: bool,
) -> AppResult<Subscription> {
    {
        let transaction = conn.transaction()?;
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
                Some(subscription_id),
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
    }
}

fn review_discount_request(
    db: &Db,
    sessions: &Sessions,
    session_token: &str,
    subscription_id: i64,
    approve: bool,
) -> AppResult<Subscription> {
    db.with_conn(|conn| {
        let actor_id = require_management(conn, sessions, session_token)?;
        apply_discount_review(conn, actor_id, subscription_id, approve)
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
        let expired_overdue = expired_overdue_count(conn, today)?;
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
