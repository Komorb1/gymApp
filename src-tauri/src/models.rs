use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub is_active: bool,
    pub last_login_at: Option<String>,
    pub branch_id: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub gym_name: Option<String>,
    pub gym_logo_path: Option<String>,
    pub gym_address: Option<String>,
    pub gym_phone: Option<String>,
    pub language: String,
    pub theme: String,
    pub session_timeout_minutes: i64,
    pub auto_backup_enabled: bool,
    pub last_backup_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupStatus {
    pub needs_setup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Member {
    pub id: i64,
    pub first_name: String,
    pub last_name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gender: Option<String>,
    pub birth_date: Option<String>,
    pub photo_path: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub branch_id: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMemberInput {
    pub first_name: String,
    pub last_name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gender: Option<String>,
    pub birth_date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMemberInput {
    pub id: i64,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub gender: Option<String>,
    pub birth_date: Option<String>,
    pub photo_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: i64,
    pub name: String,
    pub duration_days: i64,
    pub price_cents: i64,
    pub is_active: bool,
    pub branch_id: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePlanInput {
    pub name: String,
    pub duration_days: i64,
    pub price_cents: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePlanInput {
    pub id: i64,
    pub name: Option<String>,
    pub duration_days: Option<i64>,
    pub price_cents: Option<i64>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemberFlag {
    pub id: i64,
    pub member_id: i64,
    pub flag: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: i64,
    pub member_id: i64,
    pub plan_id: i64,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub frozen_until: Option<String>,
    pub is_paid: bool,
    pub branch_id: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionWithDetails {
    pub id: i64,
    pub member_id: i64,
    pub member_name: String,
    pub member_photo_path: Option<String>,
    pub plan_id: i64,
    pub plan_name: String,
    pub plan_duration_days: i64,
    pub plan_price_cents: i64,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub frozen_until: Option<String>,
    pub is_paid: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSubscriptionInput {
    pub member_id: i64,
    pub plan_id: i64,
    pub start_date: Option<String>,
    pub is_paid: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RenewSubscriptionInput {
    pub subscription_id: i64,
    pub plan_id: Option<i64>,
    pub is_paid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub active_members: i64,
    pub expiring_this_week: i64,
    pub expired_overdue: i64,
    pub total_members: i64,
}
