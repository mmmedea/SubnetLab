import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

function csvEscape(value:unknown){const raw=typeof value==="string"?value:JSON.stringify(value??"");return '"'+raw.replace(/"/g,'""')+'"';}
export async function GET(request:Request){
 const supabase=await createClient();
 const{data:{user},error:authError}=await supabase.auth.getUser();
 if(authError||!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const{data:assurance,error:assuranceError}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
 if(assuranceError||assurance?.currentLevel!=="aal2")return NextResponse.json({error:"Complete phone verification before exporting account data."},{status:403});
 const [profile,prefs,plans,allocations,assignments,attempts,audit]=await Promise.all([
  supabase.from("profiles").select("*").eq("id",user.id).maybeSingle(),
  supabase.from("user_preferences").select("*").eq("user_id",user.id).maybeSingle(),
  supabase.from("network_plans").select("*").eq("user_id",user.id),
  supabase.from("allocations").select("*").eq("user_id",user.id),
  supabase.from("ip_assignments").select("*").eq("user_id",user.id),
  supabase.from("practice_attempts").select("*").eq("user_id",user.id),
  supabase.from("auth_audit_log").select("event,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100)
 ]);
 const failed=[profile,prefs,plans,allocations,assignments,attempts,audit].find(result=>result.error);
 if(failed?.error)return NextResponse.json({error:"Could not export all account records: "+failed.error.message},{status:500});
 const payload={exportedAt:new Date().toISOString(),account:{id:user.id,email:user.email,createdAt:user.created_at,emailConfirmedAt:user.email_confirmed_at},profile:profile.data,preferences:prefs.data,networkPlans:plans.data,allocations:allocations.data,ipAssignments:assignments.data,practiceAttempts:attempts.data,securityActivity:audit.data};
 await supabase.rpc("record_auth_audit_event",{p_event:"account_exported"});
 if(new URL(request.url).searchParams.get("format")==="csv"){
  const rows:[string,unknown][]=[];
  for(const [key,value] of Object.entries(payload)){if(key==="exportedAt")continue;if(Array.isArray(value)){for(const record of value)rows.push([key,record]);}else rows.push([key,value]);}
  const csv=["record_type,record_json",...rows.map(([type,record])=>csvEscape(type)+","+csvEscape(record))].join("\r\n");
  return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="subnetlab-account-export.csv"',"Cache-Control":"private, no-store"}});
 }
 return NextResponse.json(payload,{headers:{"Content-Disposition":'attachment; filename="subnetlab-account-export.json"',"Cache-Control":"private, no-store"}});
}
