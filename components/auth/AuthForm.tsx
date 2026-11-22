"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {Eye,EyeOff} from "lucide-react";
import {createClient} from "@/utils/supabase/client";

const googleMark = <svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.65 5.93c4.47-4.13 7.12-10.2 7.12-17.58Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.87l-7.65-5.93c-2.13 1.43-4.86 2.28-8.25 2.28-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;

function safeNext(value?:string){if(!value||!value.startsWith("/")||value.startsWith("//")||value.includes("\\"))return "/dashboard";const path=value.split("?")[0];return ["/dashboard","/planner","/ipam","/practice","/progress","/settings"].some(p=>path===p||path.startsWith(p+"/"))?value:"/dashboard";}

export default function AuthForm({mode,searchParams}:{mode:"login"|"signup";searchParams:{next?:string;error?:string;reason?:string}}){
 const router=useRouter();
 const[email,setEmail]=useState("");
 const[username,setUsername]=useState("");
 const[termsAccepted,setTermsAccepted]=useState(false);
 const[password,setPassword]=useState("");
 const[show,setShow]=useState(false);
 const[busy,setBusy]=useState(false);
 const[message,setMessage]=useState("");
 const[otp,setOtp]=useState(false);
 const[codeDigits,setCodeDigits]=useState<string[]>(["","","","","",""]);
 const otpInputs=useRef<Array<HTMLInputElement|null>>([]);
 const code=codeDigits.join("");
 const[nextPath,setNextPath]=useState("/dashboard");
 const[resendWait,setResendWait]=useState(false);
 const passwordRules={length:password.length>=10,upper:/[A-Z]/.test(password),lower:/[a-z]/.test(password),number:/[0-9]/.test(password),symbol:/[^A-Za-z0-9]/.test(password)};
 const passwordValid=Object.values(passwordRules).every(Boolean);
 useEffect(()=>{setNextPath(safeNext(searchParams.next));if(searchParams.error==="auth_unavailable")setMessage("Authentication is temporarily unavailable. Supabase configuration could not be loaded.");else if(searchParams.error==="oauth_callback")setMessage(searchParams.reason?`Google sign-in could not finish: ${searchParams.reason}`:"Google sign-in did not complete. Check the Google provider and allowed callback URLs in Supabase.");},[searchParams.next,searchParams.error,searchParams.reason]);

 async function submit(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   const supabase=createClient();
   if(mode==="login"){
    const{error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
    router.replace("/verify-phone?next="+encodeURIComponent(nextPath));router.refresh();
   }else{
    const{data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,data:{username:username.trim().toLowerCase(),terms_accepted_at:new Date().toISOString()}}});
    if(error)throw error;
    if(data.session){router.replace("/verify-phone?next="+encodeURIComponent(nextPath));router.refresh();return;}
    setCodeDigits(["","","","","",""]);setOtp(true);setMessage("A verification code has been sent. Check your inbox, including spam.");
   }
  }catch(err){setMessage(err instanceof Error?err.message:"Authentication failed. Please try again.");}
  finally{setBusy(false);}
 }
 async function verify(e:React.FormEvent){
  e.preventDefault();setBusy(true);setMessage("");
  try{
   const{error}=await createClient().auth.verifyOtp({email:email.trim(),token:code,type:"signup"});
   if(error)throw error;
   router.replace("/verify-phone?next="+encodeURIComponent(nextPath));router.refresh();
  }catch(err){setMessage(err instanceof Error?err.message:"The code could not be verified. Request a new code and try again.");}
  finally{setBusy(false);}
 }
 async function resendCode(){
  setBusy(true);setMessage("");
  try{const{error}=await createClient().auth.resend({type:"signup",email:email.trim()});if(error)throw error;setCodeDigits(["","","","","",""]);setMessage("A new verification code has been sent.");setResendWait(true);window.setTimeout(()=>setResendWait(false),30000);}
  catch(err){setMessage(err instanceof Error?err.message:"Unable to resend the code right now.");}
  finally{setBusy(false);}
 }
 async function google(){
  setBusy(true);setMessage("");
  try{
   const{data,error}=await createClient().auth.signInWithOAuth({provider:"google",options:{redirectTo:`${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}${mode==="signup"?"&terms=1":""}`,queryParams:{prompt:"select_account"},skipBrowserRedirect:true}});
   if(error)throw error;
   if(!data.url)throw new Error("Google did not return an authorization URL. Check that the Google provider is enabled in Supabase.");
   window.location.assign(data.url);
  }catch(err){setMessage(err instanceof Error?err.message:"Google sign-in is unavailable. Check the Google provider configuration in Supabase.");setBusy(false);}
 }
 return <main className="auth-wrap"><section className="auth-card">
  <Link className="brand" href="/" aria-label="SubnetLab home"><img className="brand-mark" src="/logo.svg" alt="" width="36" height="32"/><span className="brand-word">Subnet<span>Lab</span></span></Link>
  <p className="eyebrow">PRIVATE NETWORK WORKSPACE</p>
  <h1>{otp?"Verify your email":mode==="login"?"Welcome back":"Create your account"}</h1>
  <p className="muted">{otp?"Enter the 6-digit code sent to "+email:mode==="login"?"Sign in to continue to your network workspace.":"Create an account to save and manage your network plans."}</p>
  {!otp?<form onSubmit={submit}>
   {mode==="signup"&&<label>Username<input className="input" type="text" autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9_]{3,32}" required value={username} onChange={e=>setUsername(e.target.value)}/><small className="muted">3–32 characters. Letters, numbers, and underscores only.</small></label>}
   <label>Email address<input className="input" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Password<div className="password-field"><input className="input" type={show?"text":"password"} autoComplete={mode==="login"?"current-password":"new-password"} minLength={mode==="signup"?10:1} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="password-toggle" onClick={()=>setShow(v=>!v)} aria-label={show?"Hide password":"Show password"} aria-pressed={show} title={show?"Hide password":"Show password"}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
   {mode==="signup"&&<ul className="password-checklist" aria-live="polite">{[[passwordRules.length,"At least 10 characters"],[passwordRules.upper,"One uppercase letter"],[passwordRules.lower,"One lowercase letter"],[passwordRules.number,"One number"],[passwordRules.symbol,"One symbol"]].map(([valid,label])=><li key={String(label)} data-valid={valid}>{valid?"✓":"○"} {label}</li>)}</ul>}
   {mode==="signup"&&<label className="auth-consent"><input type="checkbox" required checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}/> <span>I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span></label>}
   {mode==="login"&&<div className="auth-forgot"><Link href="/forgot-password">Forgot password?</Link></div>}
   <button className="button primary auth-submit" disabled={busy||(mode==="signup"&&(!passwordValid||!termsAccepted||!/^[a-zA-Z0-9_]{3,32}$/.test(username.trim())))}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}<span aria-hidden="true">→</span></button>
  </form>:<form onSubmit={verify}>
   <div><label className="field-label">6-DIGIT VERIFICATION CODE</label><div className="otp-inputs">{Array.from({length:6},(_,i)=><input key={i} ref={el=>{otpInputs.current[i]=el;}} className="input mono" aria-label={"Verification digit "+(i+1)} inputMode="numeric" autoComplete={i===0?"one-time-code":"off"} maxLength={1} required value={codeDigits[i]} onChange={e=>{const digit=e.target.value.replace(/\D/g,"").slice(-1);const next=[...codeDigits];next[i]=digit;setCodeDigits(next);if(digit&&i<5)otpInputs.current[i+1]?.focus();}} onKeyDown={e=>{if(e.key==="Backspace"&&!codeDigits[i]&&i>0)otpInputs.current[i-1]?.focus();}} onPaste={e=>{const digits=e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);if(!digits)return;e.preventDefault();setCodeDigits([...digits.split(""),..."".padEnd(6-digits.length).split("")]);otpInputs.current[Math.min(digits.length,5)]?.focus();}}/> )}</div></div>
   <button className="button primary auth-submit" disabled={busy||code.length!==6}>{busy?"Verifying…":"Verify email"}<span aria-hidden="true">→</span></button>
   <button type="button" className="button secondary-action" disabled={busy} onClick={()=>{setOtp(false);setCodeDigits(["","","","","",""]);setMessage("");}}>Change email</button>
   <button type="button" className="auth-resend" disabled={busy||resendWait} onClick={resendCode}>{resendWait?"Please wait before resending":"Resend verification code"}</button>
  </form>}
  {!otp&&<><div className="auth-divider"><span>or continue with</span></div><button type="button" className="button google-button" onClick={google} disabled={busy||(mode==="signup"&&!termsAccepted)}>{googleMark}<span>Continue with Google</span></button></>}
  {message&&<p role="status" aria-live="polite" className={message.toLowerCase().includes("sent")?"auth-notice":"error"}>{message}</p>}
  <p className="auth-foot">{mode==="login"?"New to SubnetLab? ":"Already have an account? "}<Link className="auth-switch" href={mode==="login"?`/signup?next=${encodeURIComponent(nextPath)}`:`/login?next=${encodeURIComponent(nextPath)}`}>{mode==="login"?"Create account":"Sign in"}</Link></p>
 </section></main>;
}
