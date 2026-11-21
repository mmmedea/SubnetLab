import {NextRequest,NextResponse} from "next/server";
import {createServerClient} from "@supabase/ssr";
const protectedRoutes=["/dashboard","/planner","/ipam","/practice","/progress","/settings"];
function config(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();return url&&key?{url,key}:null;}
function safeNext(v:string|null){if(!v||!v.startsWith("/")||v.startsWith("//")||v.includes("\\"))return "/dashboard";const p=v.split("?")[0];return protectedRoutes.some(x=>p===x||p.startsWith(x+"/"))?v:"/dashboard";}
export async function middleware(req:NextRequest){
 let res=NextResponse.next({request:req});
 const cfg=config(),path=req.nextUrl.pathname,isProtected=protectedRoutes.some(x=>path===x||path.startsWith(x+"/")),isAuth=["/login","/signup"].includes(path);
 if(!cfg){if(isProtected)return NextResponse.redirect(new URL("/login?error=auth_unavailable",req.url));return res;}
 try{
  const supabase=createServerClient(cfg.url,cfg.key,{cookies:{getAll:()=>req.cookies.getAll(),setAll(values){values.forEach(({name,value})=>req.cookies.set(name,value));res=NextResponse.next({request:req});values.forEach(({name,value,options})=>res.cookies.set(name,value,options));}}});
  const{data:{user},error}=await supabase.auth.getUser();
  if(isProtected&&(error||!user)){const target=new URL("/login",req.url);target.searchParams.set("next",path+req.nextUrl.search);const redirect=NextResponse.redirect(target);res.cookies.getAll().forEach(c=>redirect.cookies.set(c));redirect.headers.set("Cache-Control","private, no-store");return redirect;}
  if(isAuth&&user){const redirect=NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")),req.url));res.cookies.getAll().forEach(c=>redirect.cookies.set(c));return redirect;}
  if(isProtected)res.headers.set("Cache-Control","private, no-store");
  return res;
 }catch{if(isProtected)return NextResponse.redirect(new URL("/login?error=auth_unavailable",req.url));return res;}
}
export const config={matcher:["/dashboard/:path*","/planner/:path*","/ipam/:path*","/practice/:path*","/progress/:path*","/settings/:path*","/login","/signup"]};
