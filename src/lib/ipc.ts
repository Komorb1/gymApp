import { invoke } from "@tauri-apps/api/core";

export type DbHealth = {
  branches_count: number;
  settings_exists: boolean;
  users_count: number;
  members_count: number;
  plans_count: number;
  db_version: string;
};

export type User = {
  id: number;
  username: string;
  is_active: boolean;
  last_login_at: string | null;
  branch_id: number;
  created_at: string;
  updated_at: string;
};

export type Settings = {
  gym_name: string | null;
  gym_logo_path: string | null;
  gym_address: string | null;
  gym_phone: string | null;
  language: "ar" | "en";
  theme: "dark" | "light";
  session_timeout_minutes: number;
  auto_backup_enabled: boolean;
  last_backup_at: string | null;
};

export type SetupStatus = { needs_setup: boolean };

export type UpdateSettingsInput = {
  gym_name?: string | null;
  gym_logo_path?: string | null;
  gym_address?: string | null;
  gym_phone?: string | null;
  language?: "ar" | "en";
  theme?: "dark" | "light";
  session_timeout_minutes?: number;
  auto_backup_enabled?: boolean;
};

export type UpdateUserInput = {
  id: number;
  username?: string;
  pin?: string;
  is_active?: boolean;
};

export type Member = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birth_date: string | null;
  photo_path: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  branch_id: number;
  created_at: string;
  updated_at: string;
};

export type CreateMemberInput = {
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  birth_date?: string | null;
};

export type UpdateMemberInput = {
  id: number;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  photo_path?: string | null;
};

export type MemberFlag = {
  id: number;
  member_id: number;
  flag: string;
  note: string | null;
  created_at: string;
};

export type Plan = {
  id: number;
  name: string;
  duration_days: number;
  price_cents: number;
  is_active: boolean;
  branch_id: number;
  created_at: string;
  updated_at: string;
};

export type CreatePlanInput = {
  name: string;
  duration_days: number;
  price_cents: number;
};

export type UpdatePlanInput = {
  id: number;
  name?: string;
  duration_days?: number;
  price_cents?: number;
  is_active?: boolean;
};

export async function fetchDbHealth(): Promise<DbHealth> {
  return invoke<DbHealth>("db_health");
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  return invoke<SetupStatus>("setup_status");
}

export async function setupFirstUser(
  username: string,
  pin: string,
  gymName?: string,
): Promise<User> {
  return invoke<User>("setup_first_user", {
    username,
    pin,
    gymName: gymName || null,
  });
}

export async function loginUser(username: string, pin: string): Promise<User> {
  return invoke<User>("login", { username, pin });
}

export async function getUserById(id: number): Promise<User | null> {
  return invoke<User | null>("get_user_by_id", { id });
}

export async function listUsers(): Promise<User[]> {
  return invoke<User[]>("list_users");
}

export async function createUser(
  actorId: number,
  username: string,
  pin: string,
): Promise<User> {
  return invoke<User>("create_user", { actorId, username, pin });
}

export async function updateUser(
  actorId: number,
  input: UpdateUserInput,
): Promise<User> {
  return invoke<User>("update_user", { actorId, input });
}

export async function fetchSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function updateSettings(
  actorId: number,
  input: UpdateSettingsInput,
): Promise<Settings> {
  return invoke<Settings>("update_settings", { actorId, input });
}

export async function listMembers(): Promise<Member[]> {
  return invoke<Member[]>("list_members");
}

export async function searchMembers(query: string): Promise<Member[]> {
  return invoke<Member[]>("search_members", { query });
}

export async function getMember(id: number): Promise<Member | null> {
  return invoke<Member | null>("get_member", { id });
}

export async function createMember(
  actorId: number,
  input: CreateMemberInput,
): Promise<Member> {
  return invoke<Member>("create_member", { actorId, input });
}

export async function updateMember(
  actorId: number,
  input: UpdateMemberInput,
): Promise<Member> {
  return invoke<Member>("update_member", { actorId, input });
}

export async function deleteMember(actorId: number, id: number): Promise<void> {
  return invoke<void>("delete_member", { actorId, id });
}

export async function getMemberFlags(memberId: number): Promise<MemberFlag[]> {
  return invoke<MemberFlag[]>("get_member_flags", { memberId });
}

export async function setMemberFlag(
  actorId: number,
  memberId: number,
  flag: string,
  note?: string | null,
): Promise<void> {
  return invoke<void>("set_member_flag", {
    actorId,
    input: { member_id: memberId, flag, note: note ?? null },
  });
}

export async function removeMemberFlag(
  actorId: number,
  memberId: number,
  flag: string,
): Promise<void> {
  return invoke<void>("remove_member_flag", { actorId, memberId, flag });
}

export async function savePhoto(
  sourcePath: string,
  memberId: number,
): Promise<string> {
  return invoke<string>("save_photo", { sourcePath, memberId });
}

export async function listPlans(): Promise<Plan[]> {
  return invoke<Plan[]>("list_plans");
}

export async function createPlan(
  actorId: number,
  input: CreatePlanInput,
): Promise<Plan> {
  return invoke<Plan>("create_plan", { actorId, input });
}

export async function updatePlan(
  actorId: number,
  input: UpdatePlanInput,
): Promise<Plan> {
  return invoke<Plan>("update_plan", { actorId, input });
}

export async function deletePlan(actorId: number, id: number): Promise<void> {
  return invoke<void>("delete_plan", { actorId, id });
}

export type Subscription = {
  id: number;
  member_id: number;
  plan_id: number;
  start_date: string;
  end_date: string;
  status: "active" | "frozen" | "cancelled";
  frozen_until: string | null;
  is_paid: boolean;
  branch_id: number;
  created_at: string;
  updated_at: string;
};

export type SubscriptionWithDetails = {
  id: number;
  member_id: number;
  member_name: string;
  member_photo_path: string | null;
  plan_id: number;
  plan_name: string;
  plan_duration_days: number;
  plan_price_cents: number;
  start_date: string;
  end_date: string;
  status: "active" | "frozen" | "cancelled";
  frozen_until: string | null;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateSubscriptionInput = {
  member_id: number;
  plan_id: number;
  start_date?: string | null;
  is_paid: boolean;
};

export type RenewSubscriptionInput = {
  subscription_id: number;
  plan_id?: number | null;
  is_paid: boolean;
};

export type DashboardStats = {
  active_members: number;
  expiring_this_week: number;
  expired_overdue: number;
  total_members: number;
};

export async function listSubscriptions(): Promise<SubscriptionWithDetails[]> {
  return invoke<SubscriptionWithDetails[]>("list_subscriptions");
}

export async function listMemberSubscriptions(
  memberId: number,
): Promise<SubscriptionWithDetails[]> {
  return invoke<SubscriptionWithDetails[]>("list_member_subscriptions", {
    memberId,
  });
}

export async function createSubscription(
  actorId: number,
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  return invoke<Subscription>("create_subscription", { actorId, input });
}

export async function renewSubscription(
  actorId: number,
  input: RenewSubscriptionInput,
): Promise<Subscription> {
  return invoke<Subscription>("renew_subscription", { actorId, input });
}

export async function freezeSubscription(
  actorId: number,
  subscriptionId: number,
  frozenUntil: string,
): Promise<Subscription> {
  return invoke<Subscription>("freeze_subscription", {
    actorId,
    subscriptionId,
    frozenUntil,
  });
}

export async function unfreezeSubscription(
  actorId: number,
  subscriptionId: number,
): Promise<Subscription> {
  return invoke<Subscription>("unfreeze_subscription", {
    actorId,
    subscriptionId,
  });
}

export async function setSubscriptionPaid(
  actorId: number,
  subscriptionId: number,
  isPaid: boolean,
): Promise<Subscription> {
  return invoke<Subscription>("set_subscription_paid", {
    actorId,
    subscriptionId,
    isPaid,
  });
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return invoke<DashboardStats>("get_dashboard_stats");
}

export async function cancelSubscription(
  actorId: number,
  subscriptionId: number,
): Promise<Subscription> {
  return invoke<Subscription>("cancel_subscription", {
    actorId,
    subscriptionId,
  });
}

export type ActivityLog = {
  id: number;
  user_id: number;
  username: string;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: string | null;
  created_at: string;
};

export async function listActivityLogs(
  limit?: number,
): Promise<ActivityLog[]> {
  return invoke<ActivityLog[]>("list_activity_logs", { limit: limit ?? null });
}
