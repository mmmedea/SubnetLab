import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: emailOtpVerified, error: emailOtpError } = await supabase.rpc("is_email_otp_session_verified");
  if (emailOtpError || !emailOtpVerified) return NextResponse.json({ error: "Verify your email with the six-digit OTP before continuing." }, { status: 403 });
  const { data: securityProfile, error: securityProfileError } = await supabase.from("profiles").select("password_configured_at").eq("id", user.id).maybeSingle();
  if (securityProfileError || !securityProfile?.password_configured_at) return NextResponse.json({ error: "Set your SubnetLab password before continuing." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  const value = body as Record<string, unknown>;
  const username = typeof value.username === "string" ? value.username.trim().toLowerCase() : "";
  const display_name = typeof value.displayName === "string" ? value.displayName.trim() : "";
  const bio = typeof value.bio === "string" ? value.bio.trim() : "";
  if (username && !/^[a-z0-9_]{3,32}$/.test(username)) return NextResponse.json({ error: "Username must be 3–32 characters using letters, numbers, or underscores." }, { status: 400 });
  if (display_name.length > 60 || bio.length > 160) return NextResponse.json({ error: "Profile fields are too long." }, { status: 400 });
  const { data, error } = await supabase.from("profiles").upsert({ id: user.id, username: username || null, display_name: display_name || null, bio: bio || null, updated_at: new Date().toISOString() }).select("username,display_name,bio,avatar_url").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That username is already taken." : error.message }, { status: error.code === "23505" ? 409 : 400 });
  return NextResponse.json({ profile: data });
}
