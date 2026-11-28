"use client";

import Link from "next/link";
import {useEffect,useMemo,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/utils/supabase/client";

function safeNext(value:string){if(!value.startsWith("/")||value.startsWith("//")||value.includes("\\"))return "/dashboard";const path=value.split("?")[0];return ["/dashboard","/planner","/ipam","/practice","/progress","/settings"].some(p=>path===p||path.startsWith(p+"/"))?value:"/dashboard";}
export default function VerifyEmailOtp({next,challenge}:{next:string;challenge:string}){
 const router=useRouter(),supabase=useMemo(()=>createClient(),[]),inputs=useRef<Array<HTMLInputElement|null>>([]),verificationInFlight=useRef(false);
 const[loading,setLoading]=useState(true),[email,setEmail]=useState(""),[challengeId,setChallengeId]=useState(challenge),[digits,setDigits]=useState(["","","","","",""]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[resendSeconds,setResendSeconds]=useState(60);
 const code=digits.join(""),target=safeNext(next);
 useEffect(()=>{if(resendSeconds<=0)return;const timer=window.setInterval(()=>setResendSeconds(s=>Math.max(0,s-1)),1000);return()=>window.clearInterval(timer);},[resendSeconds]);
 useEffect(()=>{let active=true;(async()=>{const{data:{user},error}=await supabase.auth.getUser();if(error||!user){router.replace("/login");return;}if(!active)return;setEmail(user.email??"");if(!challenge){const{data:id,error:challengeError}=await supabase.rpc("begin_email_otp_challenge");if(challengeError)throw challengeError;const{error:sendError}=await supabase.auth.signInWithOtp({email:user.email??"",options:{shouldCreateUser:false}});if(sendError)throw sendError;if(active){setChallengeId(id);setNotice("A six-digit verification code has been sent. Check your inbox, spam, junk, and Promotions folders.");setResendSeconds(60);}}setLoading(false);})().catch(err=>{if(active){setError(err instanceof Error?err.message:"Could not prepare email verification.");setLoading(false);}});return()=>{active=false};},[challenge,router,supabase]);
 async function resend(){setBusy(true);setError("");setNotice("");try{const{data:id,error:challengeError}=await supabase.rpc("begin_email_otp_challenge");if(challengeError)throw challengeError;const{error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false}});if(error)throw error;setChallengeId(id);setDigits(["","","","","",""]);setNotice("A fresh six-digit verification code has been sent. Check your inbox, spam, junk, and Promotions folders.");setResendSeconds(60);inputs.current[0]?.focus();}catch(err){setError(err instanceof Error?err.message:"Could not send the email verification code. Sign in with your password again if this request expired.");}finally{setBusy(false);}}
 async function verify(value=code){
  if(!/^\d{6}$/.test(value)||verificationInFlight.current)return;
  verificationInFlight.current=true;setBusy(true);setError("");
  const goToDestination=()=>window.location.replace(target);
  try{
   const{error:verifyError}=await supabase.auth.verifyOtp({email,token:value,type:"email"});
   if(verifyError){
    const{data:alreadyVerified,error:statusError}=await supabase.rpc("is_email_otp_session_verified");
    if(!statusError&&alreadyVerified){goToDestination();return;}
    throw verifyError;
   }
   const{error:completeError}=await supabase.rpc("complete_email_otp_challenge",{p_challenge_id:challengeId});
   if(completeError){
    const{data:alreadyVerified,error:statusError}=await supabase.rpc("is_email_otp_session_verified");
    if(!statusError&&alreadyVerified){goToDestination();return;}
    throw completeError;
   }
   void supabase.rpc("record_auth_audit_event",{p_event:"email_otp_verified"});
   goToDestination();
  }catch(err){
   try{
    const{data:alreadyVerified,error:statusError}=await supabase.rpc("is_email_otp_session_verified");
    if(!statusError&&alreadyVerified){goToDestination();return;}
   }catch{}
   const message=err instanceof Error?err.message:"The email code could not be verified. Request a new code.";
   setError(message.toLowerCase().includes("expired")?"This code is invalid or expired. Request a fresh code if needed.":message);
  }finally{verificationInFlight.current=false;setBusy(false);}
 }
 function changeDigit(index:number,value:string){const digit=value.replace(/\D/g,"").slice(-1),nextDigits=[...digits];nextDigits[index]=digit;setDigits(nextDigits);if(digit&&index<5)inputs.current[index+1]?.focus();if(nextDigits.every(Boolean))void verify(nextDigits.join(""));}
 function paste(e:React.ClipboardEvent<HTMLInputElement>){const value=e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);if(!value)return;e.preventDefault();const nextDigits=[...value.split(""),..."".padEnd(6-value.length).split("")];setDigits(nextDigits);inputs.current[Math.min(value.length,5)]?.focus();if(value.length===6)void verify(value);}
 if(loading)return <main className="auth-wrap"><section className="auth-card"><p className="muted">Preparing email verification…</p></section></main>;
 return <main className="auth-wrap"><section className="auth-card"><Link className="brand" href="/" aria-label="SubnetLab home"><img className="brand-mark" src="/logo.svg" alt="" width="42" height="38"/><span className="brand-word">Subnet<span>Lab</span></span></Link><p className="eyebrow">EMAIL SECURITY CHECK</p><h1>Check your inbox</h1><p className="muted">Enter the six-digit code sent to <b>{email}</b>. Your password was accepted. This extra code verifies that you control the email address for this sign-in.</p><p className="auth-notice" role="note">Can’t find it? Check your Spam, Junk, Promotions, and All Mail folders. Make sure the email address is correct, and wait a moment for delivery.</p><form onSubmit={e=>{e.preventDefault();void verify();}}><label className="field-label">6-DIGIT EMAIL VERIFICATION CODE</label><div className="otp-inputs" aria-label="Six-digit email verification code">{Array.from({length:6},(_,i)=><input key={i} ref={el=>{inputs.current[i]=el;}} className="input mono" aria-label={"Digit "+(i+1)} inputMode="numeric" autoComplete={i===0?"one-time-code":"off"} maxLength={1} value={digits[i]} onChange={e=>changeDigit(i,e.target.value)} onKeyDown={e=>{if(e.key==="Backspace"&&!digits[i]&&i>0)inputs.current[i-1]?.focus();}} onPaste={paste}/>)}</div>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}<button className="button primary auth-submit" disabled={busy||code.length!==6}>{busy?"Verifying…":"Verify email and continue"}<span aria-hidden="true">→</span></button><button type="button" className="button secondary-action" disabled={busy||resendSeconds>0} onClick={()=>void resend()}>{resendSeconds>0?`Resend code in 00:${String(resendSeconds).padStart(2,"0")}`:"Resend code"}</button></form><p className="auth-foot">For your security, each code can only be used once. Email verification is required for each new sign-in session. If the code does not arrive, check your spam folder and try again when the resend timer reaches zero.</p><p className="auth-foot"><Link href="/login">Back to sign in</Link></p></section></main>;
}
