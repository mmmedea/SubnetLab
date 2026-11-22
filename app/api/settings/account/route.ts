import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/utils/supabase/config";

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { confirmation?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid confirmation." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid confirmation." }, { status: 400 });
  if (body.confirmation !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm account removal." }, { status: 400 });
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Account deletion is not configured. Contact support." }, { status: 503 });
  const { url } = getSupabaseConfig();
  const admin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // Repeatedly remove the first page so deleting files cannot shift offset pagination
  // and leave orphaned avatar objects behind.
  for (;;) {
    const { data: files, error: listError } = await admin.storage.from("avatars").list(user.id, { limit: 100 });
    if (listError) return NextResponse.json({ error: "Could not safely remove account files." }, { status: 500 });
    if (!files?.length) break;
    const paths = files.map(file => user.id + "/" + file.name);
    const { error: removeError } = await admin.storage.from("avatars").remove(paths);
    if (removeError) return NextResponse.json({ error: "Could not remove account files." }, { status: 500 });
    if (files.length < 100) break;
  }
  await supabase.rpc("record_auth_audit_event",{p_event:"account_deletion_requested"});
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  await supabase.auth.signOut();
  const response = NextResponse.json({ success: true });
  response.cookies.getAll().forEach(cookie => response.cookies.set(cookie.name, "", { ...cookie, maxAge: 0 }));
  return response;
}
