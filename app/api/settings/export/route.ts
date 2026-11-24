import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { recordSecurityEvent } from "@/lib/settings/security-events";

function csvEscape(value:unknown){const raw=typeof value==="string"?value:JSON.stringify(value??"");return '"'+raw.replace(/"/g,'""')+'"';}
export async function GET(request:Request){
 const supabase=await createClient();
 const{data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const { data: emailOtpVerified, error: emailOtpError } = await supabase.rpc("is_email_otp_session_verified");
  if (emailOtpError || !emailOtpVerified) return NextResponse.json({ error: "Verify your email with the six-digit OTP before continuing." }, { status: 403 });
  const { data: securityProfile, error: securityProfileError } = await supabase.from("profiles").select("password_configured_at").eq("id", user.id).maybeSingle();
  if (securityProfileError || !securityProfile?.password_configured_at) return NextResponse.json({ error: "Set your SubnetLab password before continuing." }, { status: 403 });
 const [profile,prefs,plans,allocations,assignments,attempts,audit,security]=await Promise.all([
  supabase.from("profiles").select("*").eq("id",user.id).maybeSingle(),
  supabase.from("user_preferences").select("*").eq("user_id",user.id).maybeSingle(),
  supabase.from("network_plans").select("*").eq("user_id",user.id),
  supabase.from("allocations").select("*").eq("user_id",user.id),
  supabase.from("ip_assignments").select("*").eq("user_id",user.id),
  supabase.from("practice_attempts").select("*").eq("user_id",user.id),
  supabase.from("auth_audit_log").select("event,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100),
  supabase.from("security_events").select("event_type,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100)
 ]);
 const failed=[profile,prefs,plans,allocations,assignments,attempts,audit,security].find(result=>result.error);
 if(failed?.error)return NextResponse.json({error:"Could not export all account records: "+failed.error.message},{status:500});
 const payload={exportedAt:new Date().toISOString(),account:{id:user.id,email:user.email,createdAt:user.created_at,emailConfirmedAt:user.email_confirmed_at},profile:profile.data,preferences:prefs.data,networkPlans:plans.data,allocations:allocations.data,ipAssignments:assignments.data,practiceAttempts:attempts.data,securityActivity:{settingsEvents:security.data,authAudit:audit.data}};
 await supabase.rpc("record_auth_audit_event",{p_event:"account_exported"});
 try { await recordSecurityEvent(user.id, "data_export"); } catch { /* Keep the export available if activity logging is unavailable. */ }
 if(new URL(request.url).searchParams.get("format")==="csv"){
  const rows:[string,unknown][]=[];
  for(const [key,value] of Object.entries(payload)){if(key==="exportedAt")continue;if(Array.isArray(value)){for(const record of value)rows.push([key,record]);}else rows.push([key,value]);}
  const csv=["record_type,record_json",...rows.map(([type,record])=>csvEscape(type)+","+csvEscape(record))].join("\r\n");
  return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="subnetlab-account-export.csv"',"Cache-Control":"private, no-store"}});
 }
 return NextResponse.json(payload,{headers:{"Content-Disposition":'attachment; filename="subnetlab-account-export.json"',"Cache-Control":"private, no-store"}});
}
