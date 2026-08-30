import { invoke } from "@tauri-apps/api/core";

export type AccessLevel = "management" | "staff";

export type User = {
  id: number;
  username: string;
  access_level: AccessLevel;
  is_owner: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthSession = {
  user: User;
  session_token: string;
};

export type Settings = {
  gym_name: string | null;
  gym_address: string | null;
  gym_phone: string | null;
  language: "ar" | "en";
  theme: "dark" | "light";
};

export type SetupStatus = { needs_setup: boolean };

export type UpdateSettingsInput = {
  gym_name?: string | null;
  gym_address?: string | null;
  gym_phone?: string | null;
  language?: "ar" | "en";
  theme?: "dark" | "light";
};

export type UpdateUserInput = {
  id: number;
  username?: string;
  pin?: string;
  access_level?: AccessLevel;
  is_active?: boolean;
};

export type Member = {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  id_number: string | null;
  phone: string;
  whatsapp_no: string | null;
  email: string | null;
  birth_date: string | null;
  notes: string | null;
  photo_path: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateMemberInput = {
  first_name: string;
  middle_name?: string | null;
  last_name?: string | null;
  id_number?: string | null;
  phone: string;
  email?: string | null;
  birth_date?: string | null;
  notes?: string | null;
};

export type UpdateMemberInput = Partial<CreateMemberInput> & {
  id: number;
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

export type MemberSnapshot = {
  id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  id_number: string | null;
  phone: string;
  whatsapp_no: string | null;
  email: string | null;
  birth_date: string | null;
  notes: string | null;
  photo_path: string | null;
  created_at: string;
};

export type PlanSnapshot = {
  id: number;
  name: string;
  duration_days: number;
  price_cents: number;
};

export type Subscription = {
  id: number;
  member_id: number;
  plan_id: number;
  member_snapshot: MemberSnapshot;
  plan_snapshot: PlanSnapshot;
  start_date: string;
  end_date: string;
  status: "active" | "frozen" | "cancelled";
  frozen_at: string | null;
  frozen_until: string | null;
  paid_amount_cents: number;
  discount_percent: number;
  is_paid: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateSubscriptionInput = {
  member_id: number;
  plan_id: number;
  start_date?: string | null;
  discount_percent: number;
  is_paid: boolean;
  notes?: string | null;
};

export type RenewSubscriptionInput = {
  subscription_id: number;
  plan_id?: number | null;
  discount_percent: number;
  is_paid: boolean;
  notes?: string | null;
};

export type UpdateSubscriptionInput = {
  subscription_id: number;
  discount_percent: number;
  is_paid: boolean;
  notes?: string | null;
};

export type MemberReport = {
  member: Member;
  subscriptions: Subscription[];
};

export type DashboardStats = {
  active_members: number;
  expiring_this_week: number;
  expired_overdue: number;
  total_members: number;
};

export type ActivityLog = {
  id: number;
  user_id: number;
  username: string;
  action: string;
  target_type: string | null;
  target_id: number | null;
  before_details: string | null;
  after_details: string | null;
  created_at: string;
};

export function fetchSetupStatus(): Promise<SetupStatus> {
  return invoke<SetupStatus>("setup_status");
}

export function setupFirstUser(
  username: string,
  pin: string,
  gymName?: string,
  language: "ar" | "en" = "ar",
  theme: "dark" | "light" = "dark",
): Promise<AuthSession> {
  return invoke<AuthSession>("setup_first_user", {
    username,
    pin,
    gymName: gymName || null,
    language,
    theme,
  });
}

export function loginUser(username: string, pin: string): Promise<AuthSession> {
  return invoke<AuthSession>("login", { username, pin });
}

export function logoutUser(sessionToken: string): Promise<void> {
  return invoke<void>("logout", { sessionToken });
}

export function listUsers(sessionToken: string): Promise<User[]> {
  return invoke<User[]>("list_users", { sessionToken });
}

export function createUser(
  sessionToken: string,
  username: string,
  pin: string,
  accessLevel: AccessLevel,
): Promise<User> {
  return invoke<User>("create_user", {
    sessionToken,
    username,
    pin,
    accessLevel,
  });
}

export function updateUser(
  sessionToken: string,
  input: UpdateUserInput,
): Promise<User> {
  return invoke<User>("update_user", { sessionToken, input });
}

export function fetchSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export function updateSettings(
  sessionToken: string,
  input: UpdateSettingsInput,
): Promise<Settings> {
  return invoke<Settings>("update_settings", { sessionToken, input });
}

export function listMembers(sessionToken: string): Promise<Member[]> {
  return invoke<Member[]>("list_members", { sessionToken });
}

export function searchMembers(
  sessionToken: string,
  query: string,
): Promise<Member[]> {
  return invoke<Member[]>("search_members", { sessionToken, query });
}

export function getMember(
  sessionToken: string,
  id: number,
): Promise<Member | null> {
  return invoke<Member | null>("get_member", { sessionToken, id });
}

export function createMember(
  sessionToken: string,
  input: CreateMemberInput,
): Promise<Member> {
  return invoke<Member>("create_member", { sessionToken, input });
}

export function updateMember(
  sessionToken: string,
  input: UpdateMemberInput,
): Promise<Member> {
  return invoke<Member>("update_member", { sessionToken, input });
}

export function deleteMember(sessionToken: string, id: number): Promise<void> {
  return invoke<void>("delete_member", { sessionToken, id });
}

export function listMemberReports(
  sessionToken: string,
): Promise<MemberReport[]> {
  return invoke<MemberReport[]>("list_member_reports", { sessionToken });
}

export function getMemberFlags(
  sessionToken: string,
  memberId: number,
): Promise<MemberFlag[]> {
  return invoke<MemberFlag[]>("get_member_flags", { sessionToken, memberId });
}

export function setMemberFlag(
  sessionToken: string,
  memberId: number,
  flag: string,
  note?: string | null,
): Promise<void> {
  return invoke<void>("set_member_flag", {
    sessionToken,
    input: { member_id: memberId, flag, note: note ?? null },
  });
}

export function removeMemberFlag(
  sessionToken: string,
  memberId: number,
  flag: string,
): Promise<void> {
  return invoke<void>("remove_member_flag", { sessionToken, memberId, flag });
}

export function savePhoto(
  sessionToken: string,
  sourcePath: string,
  memberId: number,
): Promise<string> {
  return invoke<string>("save_photo", { sessionToken, sourcePath, memberId });
}

export function listPlans(sessionToken: string): Promise<Plan[]> {
  return invoke<Plan[]>("list_plans", { sessionToken });
}

export function createPlan(
  sessionToken: string,
  input: CreatePlanInput,
): Promise<Plan> {
  return invoke<Plan>("create_plan", { sessionToken, input });
}

export function updatePlan(
  sessionToken: string,
  input: UpdatePlanInput,
): Promise<Plan> {
  return invoke<Plan>("update_plan", { sessionToken, input });
}

export function deletePlan(sessionToken: string, id: number): Promise<void> {
  return invoke<void>("delete_plan", { sessionToken, id });
}

export function listSubscriptions(
  sessionToken: string,
): Promise<Subscription[]> {
  return invoke<Subscription[]>("list_subscriptions", { sessionToken });
}

export function listMemberSubscriptions(
  sessionToken: string,
  memberId: number,
): Promise<Subscription[]> {
  return invoke<Subscription[]>("list_member_subscriptions", {
    sessionToken,
    memberId,
  });
}

export function createSubscription(
  sessionToken: string,
  input: CreateSubscriptionInput,
): Promise<Subscription> {
  return invoke<Subscription>("create_subscription", { sessionToken, input });
}

export function renewSubscription(
  sessionToken: string,
  input: RenewSubscriptionInput,
): Promise<Subscription> {
  return invoke<Subscription>("renew_subscription", { sessionToken, input });
}

export function freezeSubscription(
  sessionToken: string,
  subscriptionId: number,
  frozenUntil: string,
): Promise<Subscription> {
  return invoke<Subscription>("freeze_subscription", {
    sessionToken,
    subscriptionId,
    frozenUntil,
  });
}

export function unfreezeSubscription(
  sessionToken: string,
  subscriptionId: number,
): Promise<Subscription> {
  return invoke<Subscription>("unfreeze_subscription", {
    sessionToken,
    subscriptionId,
  });
}

export function updateSubscription(
  sessionToken: string,
  input: UpdateSubscriptionInput,
): Promise<Subscription> {
  return invoke<Subscription>("update_subscription", { sessionToken, input });
}

export function getDashboardStats(
  sessionToken: string,
): Promise<DashboardStats> {
  return invoke<DashboardStats>("get_dashboard_stats", { sessionToken });
}

export function cancelSubscription(
  sessionToken: string,
  subscriptionId: number,
): Promise<Subscription> {
  return invoke<Subscription>("cancel_subscription", {
    sessionToken,
    subscriptionId,
  });
}

export function listActivityLogs(
  sessionToken: string,
  limit?: number,
): Promise<ActivityLog[]> {
  return invoke<ActivityLog[]>("list_activity_logs", {
    sessionToken,
    limit: limit ?? null,
  });
}
