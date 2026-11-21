import {cookies} from "next/headers";
import {createServerClient} from "@supabase/ssr";
export async function createClient(){const store=await cookies(),url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)throw Error("Supabase environment variables are missing.");return createServerClient(url,key,{cookies:{getAll:()=>store.getAll(),setAll(values){try{values.forEach(({name,value,options})=>store.set(name,value,options));}catch{/* Middleware owns refresh writes. */}}}});}
