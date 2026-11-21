"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {Eye,EyeOff} from "lucide-react";
import {createClient} from "@/utils/supabase/client";

export default function AuthForm({mode,searchParams}:{mode:"login"|"signup";searchParams:Promise<{next?:string}>}){
 const router=useRouter();
 const[email,setEmail]=useState("");
 const[password,setPassword]=useState("");
 const[show,setShow]=useState(false);
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState("");
 const[otp,setOtp]=useState(false);
 const[code,setCode]=useState("");
 const[nextPath,setNextPath]=useState("/dashboard");
 useEffect(()=>{searchParams.then(p=>{const v=p.next||"";if(v.startsWith("/")&&!v.startsWith("//")&&!v.includes("\\\\"))setNextPath(v);});},[searchParams]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   const supabase=createClient();
   if(mode==="login"){
    const{error}=await supabase.auth.signInWithPassword({email,password});
    if(error)throw error;
    router.replace(nextPath);router.refresh();
   }else{
    const{error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`}});
    if(error)throw error;
    setOtp(true);setMessage("Check your inbox for the 6-digit verification code.");
   }
  }catch(err){setMessage(err instanceof Error?err.message:"Authentication failed. Please try again.");}
  finally{setBusy(false);}
 }
 async function verify(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   const{error}=await createClient().auth.verifyOtp({email,token:code,type:"signup"});
   if(error)throw error;
   router.replace(nextPath);router.refresh();
  }catch(err){setMessage(err instanceof Error?err.message:"The code could not be verified.");}
  finally{setBusy(false);}
 }
 async function google(){
  setBusy(true);setMessage("");
  try{
   const{error}=await createClient().auth.signInWithOAuth({provider:"google",options:{redirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,queryParams:{access_type:"offline",prompt:"select_account"}}});
   if(error)throw error;
  }catch(err){setMessage(err instanceof Error?err.message:"Google sign-in is unavailable right now.");setBusy(false);}
 }
 return <main className="auth-wrap"><section className="auth-card">
  <Link className="brand" href="/" aria-label="SubnetLab home"><img className="brand-mark" src="/logo.svg" alt="" width="36" height="32"/><span className="brand-word">Subnet<span>Lab</span></span></Link>
  <p className="eyebrow">PRIVATE NETWORK WORKSPACE</p>
  <h1>{otp?"Verify your email":mode==="login"?"Welcome back":"Create your account"}</h1>
  <p className="muted">{otp?"Enter the 6-digit code sent to "+email:mode==="login"?"Sign in to continue to your network workspace.":"Create an account to save and manage your network plans."}</p>
  {!otp&&<>
   <button type="button" className="button google-button" onClick={google} disabled={busy}><span className="google-g" aria-hidden="true">G</span>Continue with Google</button>
   <div className="auth-divider"><span>or continue with email</span></div>
  </>}
  {!otp?<form onSubmit={submit}>
   <label>Email address<input className="input" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<div className="password-field"><input className="input" type={show?"text":"password"} autoComplete={mode==="login"?"current-password":"new-password"} minLength={10} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="password-toggle" onClick={()=>setShow(v=>!v)} aria-label={show?"Hide password":"Show password"} aria-pressed={show} title={show?"Hide password":"Show password"}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
   <button className="button primary auth-submit" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}<span aria-hidden="true">→</span></button>
  </form>:<form onSubmit={verify}>
   <label>6-digit verification code<input className="input mono" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
   <button className="button primary auth-submit" disabled={busy||code.length!==6}>{busy?"Verifying…":"Verify email"}<span aria-hidden="true">→</span></button>
   <button type="button" className="button secondary-action" onClick={()=>{setOtp(false);setCode("");}}>Change email</button>
  </form>}
  {message&&<p role="status" aria-live="polite" className={message.startsWith("Check")?"auth-notice":"error"}>{message}</p>}
  <p className="auth-foot">{mode==="login"?"New to SubnetLab? ":"Already have an account? "}<Link className="auth-switch" href={mode==="login"?"/signup":"/login"}>{mode==="login"?"Create account":"Sign in"}</Link></p>
 </section></main>;
}
