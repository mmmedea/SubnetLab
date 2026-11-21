import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
function safeNext(value:string|null){if(!value||!value.startsWith("/")||value.startsWith("//")||value.includes("\\"))return "/dashboard";const path=value.split("?")[0];return ["/dashboard","/planner","/ipam","/practice","/progress","/settings"].some(p=>path===p||path.startsWith(p+"/"))?value:"/dashboard";}
export async function GET(request:NextRequest){
 const url=new URL(request.url),code=url.searchParams.get("code"),next=safeNext(url.searchParams.get("next"));
 const project=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
 if(!project||!key)return NextResponse.redirect(new URL("/login?error=auth_unavailable",url.origin));
 if(!code)return NextResponse.redirect(new URL("/login?error=oauth_callback",url.origin));
 const response=NextResponse.redirect(new URL(next,url.origin));
 const supabase=createServerClient(project,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll(values){values.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 const{error}=await supabase.auth.exchangeCodeForSession(code);
 if(error){const failed=NextResponse.redirect(new URL("/login?error=oauth_callback",url.origin));response.cookies.getAll().forEach(c=>failed.cookies.set(c));return failed;}
 response.headers.set("Cache-Control","private, no-store");
 return response;
}
