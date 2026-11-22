"use client";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/utils/supabase/client";
import {useWorkspaceProfile} from "@/components/workspace/UserProfileProvider";
import {Check,Download,Eye,EyeOff,LoaderCircle,ShieldCheck,Trash2,UserRound,Settings2,CloudUpload} from "lucide-react";

type Tab="profile"|"security"|"preferences"|"danger";
const tabs:{id:Tab;label:string;icon:typeof UserRound}[]=[{id:"profile",label:"Profile",icon:UserRound},{id:"security",label:"Account & Security",icon:ShieldCheck},{id:"preferences",label:"Preferences",icon:Settings2},{id:"danger",label:"Danger Zone",icon:Trash2}];
const defaults={theme:"dark",emailNotifications:true,inAppNotifications:true,defaultNetwork:"IPv4",fontSize:"14",compact:false};
export default function SettingsPage(){
 const profile=useWorkspaceProfile(),supabase=useMemo(()=>createClient(),[]);
 useEffect(()=>{try{const raw=localStorage.getItem("subnetlab-preferences");if(raw){const parsed=JSON.parse(raw);setPrefs({...defaults,...parsed});}}catch{}},[]);
 const [tab,setTab]=useState<Tab>("profile"),[username,setUsername]=useState(profile.username||""),[displayName,setDisplayName]=useState(profile.displayName||""),[bio,setBio]=useState("");
 const [email,setEmail]=useState(profile.email),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[visible,setVisible]=useState(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[toast,setToast]=useState("");
 const [prefs,setPrefs]=useState(defaults),[avatar,setAvatar]=useState(profile.avatarUrl||"");
 const dirty=username!==(profile.username||"")||displayName!==(profile.displayName||"")||bio!=="";
 const rules=[password.length>=10,/[A-Z]/.test(password),/[a-z]/.test(password),/[0-9]/.test(password),/[^A-Za-z0-9]/.test(password)];
 const identities=(profile as any).identities as {provider:string}[]|undefined;
 const notify=()=>{setToast("Preferences updated");window.setTimeout(()=>setToast(""),2400)};
 async function saveProfile(){setSaving(true);setError("");setMessage("");const {error}=await supabase.auth.updateUser({data:{username:username.trim(),full_name:displayName.trim(),bio:bio.trim()}});setSaving(false);if(error)setError(error.message);else setMessage("Profile updated.");}
 async function updateEmail(){setSaving(true);setError("");const {error}=await supabase.auth.updateUser({email:email.trim()},{emailRedirectTo:location.origin+"/auth/callback?next=%2Fsettings"});setSaving(false);if(error)setError(error.message);else setMessage("Pending verification. Check your new email to confirm the change.");}
 async function updatePassword(){setSaving(true);setError("");const {error}=await supabase.auth.updateUser({password});setSaving(false);if(error)setError(error.message);else{setPassword("");setConfirm("");setMessage("Password updated.");}}
 async function signOutOthers(){setSaving(true);const {error}=await supabase.auth.signOut({scope:"others"});setSaving(false);if(error)setError(error.message);else setMessage("Other sessions signed out.");}
 function pref<K extends keyof typeof defaults>(key:K,value:(typeof defaults)[K]){const next={...prefs,[key]:value};setPrefs(next);try{localStorage.setItem("subnetlab-preferences",JSON.stringify(next));document.documentElement.dataset.compact=String(next.compact);document.documentElement.style.setProperty("--settings-mono-size",next.fontSize+"px");}catch{}notify();}
 function exportData(){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),account:{id:profile.id,email:profile.email,username,displayName,bio},preferences:prefs},null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="subnetlab-account-export.json";a.click();URL.revokeObjectURL(url);}
 return <div className="settings-page">
  <header className="settings-heading"><p className="eyebrow">WORKSPACE / ACCOUNT</p><h1>Settings</h1><p className="lead">Manage your profile, security, and workspace preferences.</p></header>
  <div className="settings-layout"><nav className="settings-nav" aria-label="Settings sections">{tabs.map(({id,label,icon:Icon})=><button key={id} className={tab===id?"active":""} onClick={()=>{setTab(id);setError("");setMessage("");}}><Icon size={17}/>{label}</button>)}</nav>
   <main className="settings-content">
    {tab==="profile"&&<div className="settings-stack"><Card title="Profile information" desc="Choose how your name and profile appear in SubnetLab." footer={<><span>Changes are saved to your account profile.</span><button className="button primary settings-save" disabled={!dirty||saving} onClick={saveProfile}>{saving?"Saving...":"Save Changes"}</button></>}>
      <div className="settings-avatar"><div className="avatar-preview">{avatar?<img src={avatar} alt="Avatar preview"/>:<UserRound/>}</div><div><b>Profile photo</b><p>JPG, PNG or WebP. Maximum 2 MB.</p><label className="button settings-button">Upload photo<input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith("image/")||f.size>2*1024*1024){setError("Choose an image under 2 MB.");return;}setAvatar(URL.createObjectURL(f));setMessage("Preview only. Avatar storage is not configured yet.");}}/></label> <button className="button settings-button" onClick={()=>setAvatar("")}>Remove</button></div></div>
      <Field label="Username"><input value={username} maxLength={32} placeholder="your-username" onChange={e=>setUsername(e.target.value)}/></Field><Field label="Display name"><input value={displayName} maxLength={60} placeholder="Your name" onChange={e=>setDisplayName(e.target.value)}/></Field><Field label="Bio / Role"><textarea rows={3} maxLength={160} placeholder="A short introduction or your role." value={bio} onChange={e=>setBio(e.target.value)}/></Field>
     </Card></div>}
    {tab==="security"&&<div className="settings-stack">
     <Card title="Account email" desc="Your email is used for sign-in and account notifications." footer={<><span>Supabase sends a confirmation link to the new address.</span><button className="button primary settings-save" disabled={saving||!email.trim()||email.trim()===profile.email} onClick={updateEmail}>Update Email</button></>}>
      <Field label="Primary email"><div className="settings-email"><input value={profile.email} readOnly/><span className="settings-pill"><Check size={12}/> {(profile as any).emailConfirmed?"Verified":"Unverified"}</span></div></Field><Field label="Change email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="new@email.com"/></Field>
     </Card>
     <Card title="Change password" desc="Use a unique password that you do not use elsewhere." footer={<><span>Meet all five requirements to continue.</span><button className="button primary settings-save" disabled={saving||!rules.every(Boolean)||password!==confirm} onClick={updatePassword}>{saving?"Saving...":"Update Password"}</button></>}>
      <Field label="New password"><div className="settings-password"><input type={visible?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter a strong password"/><button onClick={()=>setVisible(v=>!v)} aria-label="Toggle password visibility">{visible?<EyeOff/>:<Eye/>}</button></div></Field><ul className="settings-rules">{["At least 10 characters","One uppercase letter","One lowercase letter","One number","One special character"].map((s,i)=><li className={rules[i]?"valid":""} key={s}><Check size={13}/>{s}</li>)}</ul><Field label="Confirm new password"><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Re-enter new password"/></Field>
     </Card>
     <Card title="Connected providers & sessions" desc="Review sign-in providers and end sessions on other devices." footer={<span>Session controls are provided by Supabase Auth.</span>}>
      <div className="settings-provider"><div><b>Google</b><p>Sign in with Google</p></div><span className="settings-pill">{identities?.some(x=>x.provider==="google")?"Connected":"Not connected"}</span></div><div className="settings-provider"><div><b>Active sessions</b><p>End sessions in other browsers and devices.</p></div><button className="button settings-button" disabled={saving} onClick={signOutOthers}>Sign out other devices</button></div>
     </Card>
    </div>}
    {tab==="preferences"&&<div className="settings-stack">
     <Card title="Appearance" desc="Choose how the workspace looks on this device." footer={<span>Appearance changes save immediately on this device.</span>}>
      <Field label="Theme"><select value={prefs.theme} onChange={e=>pref("theme",e.target.value as "dark"|"system"|"light")}><option value="dark">Dark</option><option value="system">Use system setting</option></select></Field><Toggle label="Compact mode" desc="Reduce spacing in tables and workspace panels." checked={prefs.compact} change={v=>pref("compact",v)}/>
     </Card>
     <Card title="Workspace defaults" desc="Set defaults for subnetting and address planning." footer={<span>Defaults are stored locally in this browser.</span>}>
      <Field label="Default IP mode"><select value={prefs.defaultNetwork} onChange={e=>pref("defaultNetwork",e.target.value as "IPv4"|"IPv6")}><option>IPv4</option><option>IPv6</option></select></Field><Field label="Monospace font size"><select value={prefs.fontSize} onChange={e=>pref("fontSize",e.target.value as "12"|"13"|"14"|"15"|"16")}><option>12</option><option>13</option><option>14</option><option>15</option><option>16</option></select></Field>
     </Card>
     <Card title="Notifications" desc="Choose which account updates you want to receive." footer={<span>Notification preferences save instantly.</span>}>
      <Toggle label="Email notifications" desc="Receive important account and security updates." checked={prefs.emailNotifications} change={v=>pref("emailNotifications",v)}/><Toggle label="In-app notifications" desc="Show updates and reminders inside SubnetLab." checked={prefs.inAppNotifications} change={v=>pref("inAppNotifications",v)}/>
     </Card>
    </div>}
    {tab==="danger"&&<div className="settings-stack">
     <Card title="Export account data" desc="Download a copy of the account information available to this workspace." footer={<><span>JSON format</span><button className="button settings-button" onClick={exportData}><Download size={15}/> Export data</button></>}> <p className="settings-note">Includes your account identifier, email, profile fields and local preferences. It does not include server records that are not yet connected to an export service.</p></Card>
     <Card danger title="Delete account" desc="Account deletion is permanent and cannot be undone."><p className="settings-note">Deletion requires a verified server-side admin workflow. That endpoint is not configured in this project, so deletion is intentionally unavailable rather than pretending to delete your account.</p><button className="button settings-danger" disabled><Trash2 size={15}/> Delete account unavailable</button></Card>
    </div>}
    {error&&<p className="settings-alert error" role="alert">{error}</p>}{message&&<p className="settings-alert" role="status">{message}</p>}
   </main>
  </div>{toast&&<div className="settings-toast" role="status">{toast}</div>}
 </div>;
}
function Card({title,desc,footer,children,danger=false}:{title:string;desc:string;footer?:React.ReactNode;children:React.ReactNode;danger?:boolean}){return <section className={"settings-card"+(danger?" danger-card":"")}><header><h2>{title}</h2><p>{desc}</p></header><div className="settings-card-body">{children}</div>{footer&&<footer>{footer}</footer>}</section>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="settings-field"><span>{label}</span>{children}</label>}
function Toggle({label,desc,checked,change}:{label:string;desc:string;checked:boolean;change:(v:boolean)=>void}){return <div className="settings-toggle-row"><div><b>{label}</b><p>{desc}</p></div><button type="button" role="switch" aria-checked={checked} className={"settings-switch"+(checked?" on":"")} onClick={()=>change(!checked)}><span/></button></div>}
