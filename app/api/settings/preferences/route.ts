import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { recordSecurityEvent } from "@/lib/settings/security-events";

const themes = ["dark", "light", "system"];
const versions = ["ipv4", "ipv6"];
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: emailOtpVerified, error: emailOtpError } = await supabase.rpc("is_email_otp_session_verified");
  if (emailOtpError || !emailOtpVerified) return NextResponse.json({ error: "Verify your email with the six-digit OTP before continuing." }, { status: 403 });
  const { data: securityProfile, error: securityProfileError } = await supabase.from("profiles").select("password_configured_at").eq("id", user.id).maybeSingle();
  if (securityProfileError || !securityProfile?.password_configured_at) return NextResponse.json({ error: "Set your SubnetLab password before continuing." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid preferences payload." }, { status: 400 });
  const allowed = ["theme", "email_notifications", "in_app_notifications", "compact_mode", "default_ip_version", "monospace_font_size", "timezone", "language"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) update[key] = body[key];
  if (!Object.keys(update).length) return NextResponse.json({ error: "No supported preferences supplied." }, { status: 400 });
  if ("theme" in update && !themes.includes(String(update.theme))) return NextResponse.json({ error: "Invalid theme." }, { status: 400 });
  if ("default_ip_version" in update && !versions.includes(String(update.default_ip_version))) return NextResponse.json({ error: "Invalid IP version." }, { status: 400 });
  for (const key of ["email_notifications", "in_app_notifications", "compact_mode"]) if (key in update && typeof update[key] !== "boolean") return NextResponse.json({ error: "Invalid preference value." }, { status: 400 });
  if ("monospace_font_size" in update && (!Number.isInteger(update.monospace_font_size) || Number(update.monospace_font_size) < 12 || Number(update.monospace_font_size) > 18)) return NextResponse.json({ error: "Font size must be between 12 and 18." }, { status: 400 });
  if ("timezone" in update) {
    if (typeof update.timezone !== "string" || !update.timezone.trim() || update.timezone.trim().length > 64) return NextResponse.json({ error: "Enter a valid time zone." }, { status: 400 });
    try { new Intl.DateTimeFormat("en-US", { timeZone: update.timezone.trim() }); }
    catch { return NextResponse.json({ error: "Enter a valid time zone, such as Asia/Singapore." }, { status: 400 }); }
    update.timezone = update.timezone.trim();
  }
  if ("language" in update) {
    if (typeof update.language !== "string" || update.language.trim().length < 2 || update.language.trim().length > 16) return NextResponse.json({ error: "Enter a valid locale, such as en-SG." }, { status: 400 });
    try { update.language = Intl.getCanonicalLocales(update.language.trim())[0]; }
    catch { return NextResponse.json({ error: "Enter a valid locale, such as en-SG." }, { status: 400 }); }
  }
  const { data, error } = await supabase.from("user_preferences").upsert({ user_id: user.id, ...update, updated_at: new Date().toISOString() }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  try { await recordSecurityEvent(user.id, "preferences_changed"); } catch { /* Keep the preference save successful if activity logging is unavailable. */ }
  return NextResponse.json({ preferences: data });
}
