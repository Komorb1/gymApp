use serde::{Deserialize, Serialize};

pub fn deserialize_nullable<'de, D, T>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub access_level: String,
    pub is_active: bool,
    pub last_login_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub user: User,
    pub session_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub gym_name: Option<String>,
    pub gym_address: Option<String>,
    pub gym_phone: Option<String>,
    pub language: String,
    pub theme: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetupStatus {
    pub needs_setup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Member {
    pub id: i64,
    pub first_name: String,
    pub middle_name: Option<String>,
    pub last_name: String,
    pub id_number: Option<String>,
    pub phone: String,
    pub whatsapp_no: Option<String>,
    pub email: Option<String>,
    pub birth_date: Option<String>,
    pub notes: Option<String>,
    pub photo_path: Option<String>,
    pub is_deleted: bool,
    pub deleted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMemberInput {
    pub first_name: String,
    pub middle_name: Option<String>,
    pub last_name: Option<String>,
    pub id_number: Option<String>,
    pub phone: String,
    pub whatsapp_no: Option<String>,
    pub email: Option<String>,
    pub birth_date: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMemberInput {
    pub id: i64,
    pub first_name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub middle_name: Option<Option<String>>,
    pub last_name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub id_number: Option<Option<String>>,
    pub phone: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub whatsapp_no: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub email: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub birth_date: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub notes: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub photo_path: Option<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: i64,
    pub name: String,
    pub duration_days: i64,
    pub price_cents: i64,
    pub is_active: bool,
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
pub struct MemberSnapshot {
    pub id: i64,
    pub first_name: String,
    pub middle_name: Option<String>,
    pub last_name: String,
    pub id_number: Option<String>,
    pub phone: String,
    pub whatsapp_no: Option<String>,
    pub email: Option<String>,
    pub birth_date: Option<String>,
    pub notes: Option<String>,
    pub photo_path: Option<String>,
    pub created_at: String,
}

impl From<&Member> for MemberSnapshot {
    fn from(member: &Member) -> Self {
        Self {
            id: member.id,
            first_name: member.first_name.clone(),
            middle_name: member.middle_name.clone(),
            last_name: member.last_name.clone(),
            id_number: member.id_number.clone(),
            phone: member.phone.clone(),
            whatsapp_no: member.whatsapp_no.clone(),
            email: member.email.clone(),
            birth_date: member.birth_date.clone(),
            notes: member.notes.clone(),
            photo_path: member.photo_path.clone(),
            created_at: member.created_at.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanSnapshot {
    pub id: i64,
    pub name: String,
    pub duration_days: i64,
    pub price_cents: i64,
}

impl From<&Plan> for PlanSnapshot {
    fn from(plan: &Plan) -> Self {
        Self {
            id: plan.id,
            name: plan.name.clone(),
            duration_days: plan.duration_days,
            price_cents: plan.price_cents,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: i64,
    pub member_id: i64,
    pub plan_id: i64,
    pub member_snapshot: MemberSnapshot,
    pub plan_snapshot: PlanSnapshot,
    pub start_date: String,
    pub end_date: String,
    pub status: String,
    pub frozen_at: Option<String>,
    pub frozen_until: Option<String>,
    pub paid_amount_cents: i64,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSubscriptionInput {
    pub member_id: i64,
    pub plan_id: i64,
    pub start_date: Option<String>,
    pub paid_amount_cents: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RenewSubscriptionInput {
    pub subscription_id: i64,
    pub plan_id: Option<i64>,
    pub paid_amount_cents: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSubscriptionInput {
    pub subscription_id: i64,
    pub paid_amount_cents: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub active_members: i64,
    pub expiring_this_week: i64,
    pub expired_overdue: i64,
    pub total_members: i64,
}

#[cfg(test)]
mod tests {
    use super::UpdateMemberInput;

    #[test]
    fn update_member_distinguishes_missing_and_null_fields() {
        let missing: UpdateMemberInput = serde_json::from_str(r#"{"id":1}"#).unwrap();
        let cleared: UpdateMemberInput =
            serde_json::from_str(r#"{"id":1,"email":null}"#).unwrap();

        assert_eq!(missing.email, None);
        assert_eq!(cleared.email, Some(None));
    }
}
