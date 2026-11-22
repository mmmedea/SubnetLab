"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {Eye,EyeOff} from "lucide-react";
import {createClient} from "@/utils/supabase/client";

const googleMark = <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.65 5.93c4.47-4.13 7.12-10.2 7.12-17.58Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.87l-7.65-5.93c-2.13 1.43-4.86 2.28-8.25 2.28-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;

function safeNext(value?:string){if(!value||!value.startsWith("/")||value.startsWith("//")||value.includes("\\"))return "/dashboard";const path=value.split("?")[0];return ["/dashboard","/planner","/ipam","/practice","/progress","/settings"].some(p=>path===p||path.startsWith(p+"/"))?value:"/dashboard";}

export default function AuthForm({mode,searchParams}:{mode:"login"|"signup";searchParams:Promise<{next?:string;error?:string}>}){
 const router=useRouter();
 const[email,setEmail]=useState("");
 const[password,setPassword]=useState("");
 const[show,setShow]=useState(false);
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState("");
 const[otp,setOtp]=useState(false);
 const[code,setCode]=useState("");
 const[nextPath,setNextPath]=useState("/dashboard");
 const[resendWait,setResendWait]=useState(false);
 const passwordRules={length:password.length>=8,upper:/[A-Z]/.test(password),lower:/[a-z]/.test(password),symbol:/[^A-Za-z0-9]/.test(password)};
 const passwordValid=Object.values(passwordRules).every(Boolean);
 useEffect(()=>{let active=true;searchParams.then(p=>{if(!active)return;setNextPath(safeNext(p.next));if(p.error==="auth_unavailable")setMessage("Authentication is temporarily unavailable. Supabase configuration could not be loaded.");else if(p.error==="oauth_callback")setMessage("Google sign-in did not complete. Confirm Google is enabled in Supabase and the OAuth redirect URLs match this site.");});return()=>{active=false};},[searchParams]);

 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   const supabase=createClient();
   if(mode==="login"){
    const{error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
    router.replace(nextPath);router.refresh();
   }else{
    const{data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`}});
    if(error)throw error;
    if(data.session){router.replace(nextPath);router.refresh();return;}
    setOtp(true);setMessage("A verification code has been sent. Check your inbox, including spam.");
   }
  }catch(err){setMessage(err instanceof Error?err.message:"Authentication failed. Please try again.");}
  finally{setBusy(false);}
 }
 async function verify(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   const{error}=await createClient().auth.verifyOtp({email:email.trim(),token:code,type:"signup"});
   if(error)throw error;
   router.replace(nextPath);router.refresh();
  }catch(err){setMessage(err instanceof Error?err.message:"The code could not be verified. Request a new code and try again.");}
  finally{setBusy(false);}
 }
 async function resendCode(){
  setBusy(true);setMessage("");
  try{const{error}=await createClient().auth.resend({type:"signup",email:email.trim()});if(error)throw error;setMessage("A new verification code has been sent.");setResendWait(true);window.setTimeout(()=>setResendWait(false),30000);}
  catch(err){setMessage(err instanceof Error?err.message:"Unable to resend the code right now.");}
  finally{setBusy(false);}
 }
 async function google(){
  setBusy(true);setMessage("");
  try{
   const{error}=await createClient().auth.signInWithOAuth({provider:"google",options:{redirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,queryParams:{access_type:"offline",prompt:"select_account"}}});
   if(error)throw error;
  }catch(err){setMessage(err instanceof Error?err.message:"Google sign-in is unavailable. Check the Google provider configuration in Supabase.");setBusy(false);}
 }
 return <main className="auth-wrap"><section className="auth-card">
  <Link className="brand" href="/" aria-label="SubnetLab home"><img className="brand-mark" src="/logo.svg" alt="" width="36" height="32"/><span className="brand-word">Subnet<span>Lab</span></span></Link>
  <p className="eyebrow">PRIVATE NETWORK WORKSPACE</p>
  <h1>{otp?"Verify your email":mode==="login"?"Welcome back":"Create your account"}</h1>
  <p className="muted">{otp?"Enter the 6-digit code sent to "+email:mode==="login"?"Sign in to continue to your network workspace.":"Create an account to save and manage your network plans."}</p>
  {!otp?<form onSubmit={submit}>
   <label>Email address<input className="input" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<div className="password-field"><input className="input" type={show?"text":"password"} autoComplete={mode==="login"?"current-password":"new-password"} minLength={8} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="password-toggle" onClick={()=>setShow(v=>!v)} aria-label={show?"Hide password":"Show password"} aria-pressed={show} title={show?"Hide password":"Show password"}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
   {mode==="signup"&&<ul className="password-checklist" aria-live="polite">{[[passwordRules.length,"At least 8 characters"],[passwordRules.upper,"One uppercase letter"],[passwordRules.lower,"One lowercase letter"],[passwordRules.symbol,"One symbol"]].map(([valid,label])=><li key={String(label)} data-valid={valid}>{valid?"✓":"○"} {label}</li>)}</ul>}
   {mode==="login"&&<div className="auth-forgot"><Link href="/forgot-password">Forgot password?</Link></div>}
   <button className="button primary auth-submit" disabled={busy||(mode==="signup"&&!passwordValid)}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}<span aria-hidden="true">→</span></button>
  </form>:<form onSubmit={verify}>
   <label>6-digit verification code<input className="input mono" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
   <button className="button primary auth-submit" disabled={busy||code.length!==6}>{busy?"Verifying…":"Verify email"}<span aria-hidden="true">→</span></button>
   <button type="button" className="button secondary-action" disabled={busy} onClick={()=>{setOtp(false);setCode("");setMessage("");}}>Change email</button>
   <button type="button" className="auth-resend" disabled={busy||resendWait} onClick={resendCode}>{resendWait?"Please wait before resending":"Resend verification code"}</button>
  </form>}
  {!otp&&<><div className="auth-divider"><span>or continue with</span></div><button type="button" className="button google-button" onClick={google} disabled={busy}>{googleMark}<span>Continue with Google</span></button></>}
  {message&&<p role="status" aria-live="polite" className={message.toLowerCase().includes("sent")?"auth-notice":"error"}>{message}</p>}
  <p className="auth-foot">{mode==="login"?"New to SubnetLab? ":"Already have an account? "}<Link className="auth-switch" href={mode==="login"?"/signup":"/login"}>{mode==="login"?"Create account":"Sign in"}</Link></p>
 </section></main>;
}
