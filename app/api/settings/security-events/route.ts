import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { SecurityEventType } from "@/lib/settings/security-events";

const clientEventTypes: SecurityEventType[] = ["login", "password_set", "password_changed", "sessions_revoked"];

async function getVerifiedUser() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { supabase, user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: emailOtpVerified, error: emailOtpError } = await supabase.rpc("is_email_otp_session_verified");
  if (emailOtpError || !emailOtpVerified) return { supabase, user: null, response: NextResponse.json({ error: "Verify your email with the six-digit OTP before continuing." }, { status: 403 }) };
  const { data: profile, error: profileError } = await supabase.from("profiles").select("password_configured_at").eq("id", user.id).maybeSingle();
  if (profileError || !profile?.password_configured_at) return { supabase, user: null, response: NextResponse.json({ error: "Set your SubnetLab password before continuing." }, { status: 403 }) };
  return { supabase, user, response: null };
}

export async function GET() {
  const { supabase, user, response } = await getVerifiedUser();
  if (response || !user) return response;
  const [security, audit] = await Promise.all([
    supabase.from("security_events").select("event_type,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(16),
    supabase.from("auth_audit_log").select("event,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(16),
  ]);
  if (security.error && audit.error) return NextResponse.json({ error: "Could not load security activity." }, { status: 503 });
  const duplicateAuditEvents = new Set(["email_otp_verified", "preferences_updated", "other_sessions_signed_out", "account_exported"]);
  const events = [
    ...(security.data ?? []),
    ...(audit.data ?? []).filter(event => !duplicateAuditEvents.has(event.event)).map(({ event, created_at }) => ({ event_type: event, created_at })),
  ].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)).slice(0, 8);
  return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const { user, response } = await getVerifiedUser();
  if (response || !user) return response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid event." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  const eventType = (body as Record<string, unknown>).event_type;
  if (typeof eventType !== "string" || !clientEventTypes.includes(eventType as SecurityEventType)) return NextResponse.json({ error: "Unsupported security event." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Security activity storage is not configured." }, { status: 503 });
  const { error } = await admin.from("security_events").insert({ user_id: user.id, event_type: eventType });
  if (error) return NextResponse.json({ error: "Could not record security activity." }, { status: 503 });
  return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
}
