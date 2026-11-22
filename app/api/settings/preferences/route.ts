import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const themes = ["dark", "light", "system"];
const versions = ["ipv4", "ipv6"];
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const allowed = ["theme", "email_notifications", "in_app_notifications", "compact_mode", "default_ip_version", "monospace_font_size"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) if (key in body) update[key] = body[key];
  if (!Object.keys(update).length) return NextResponse.json({ error: "No supported preferences supplied." }, { status: 400 });
  if ("theme" in update && !themes.includes(String(update.theme))) return NextResponse.json({ error: "Invalid theme." }, { status: 400 });
  if ("default_ip_version" in update && !versions.includes(String(update.default_ip_version))) return NextResponse.json({ error: "Invalid IP version." }, { status: 400 });
  for (const key of ["email_notifications", "in_app_notifications", "compact_mode"]) if (key in update && typeof update[key] !== "boolean") return NextResponse.json({ error: "Invalid preference value." }, { status: 400 });
  if ("monospace_font_size" in update && (!Number.isInteger(update.monospace_font_size) || Number(update.monospace_font_size) < 12 || Number(update.monospace_font_size) > 18)) return NextResponse.json({ error: "Font size must be between 12 and 18." }, { status: 400 });
  const { data, error } = await supabase.from("user_preferences").upsert({ user_id: user.id, ...update, updated_at: new Date().toISOString() }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ preferences: data });
}
