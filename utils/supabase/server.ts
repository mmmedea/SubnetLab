import {cookies} from "next/headers";
import {createServerClient} from "@supabase/ssr";

function getSupabaseConfig(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
 const key=(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
 if(!url||!key)throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY) in the Vercel environment, then redeploy.");
 try{const parsed=new URL(url);if(parsed.protocol!=="https:"&&parsed.hostname!=="localhost")throw new Error();}catch{throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid HTTPS Supabase project URL.");}
 return {url,key};
}
export async function createClient(){
 const store=await cookies(),{url,key}=getSupabaseConfig();
 return createServerClient(url,key,{cookies:{getAll:()=>store.getAll(),setAll(values){try{values.forEach(({name,value,options})=>store.set(name,value,options));}catch{/* Middleware refreshes cookies when Server Components cannot write. */}}}});
}
