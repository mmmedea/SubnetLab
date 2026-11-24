import { createAdminClient } from "@/utils/supabase/admin";

export type SecurityEventType =
  | "login"
  | "password_set"
  | "password_changed"
  | "sessions_revoked"
  | "data_export"
  | "preferences_changed"
  | "account_deleted";

export async function recordSecurityEvent(userId: string, eventType: SecurityEventType) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Security activity storage is not configured.");
  const { error } = await admin.from("security_events").insert({ user_id: userId, event_type: eventType });
  if (error) throw new Error("Security activity could not be recorded.");
}
