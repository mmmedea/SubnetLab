"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Copy, Save, FolderOpen } from "lucide-react";
import { details, vlsm, binary } from "@/lib/subnet/ipv4";
import { createClient } from "@/utils/supabase/client";
import { useWorkspaceProfile } from "@/components/workspace/UserProfileProvider";

type Requirement={name:string;hosts:number};
type SavedPlan={id:string;name:string;cidr:string;ip_version:number;updated_at:string};

export default function Planner(){
  const profile=useWorkspaceProfile();
  const supabase=useMemo(()=>createClient(),[]);
  const [cidr,setCidr]=useState("192.168.10.0/24");
  const [req,setReq]=useState<Requirement[]>([{name:"Engineering",hosts:100},{name:"Operations",hosts:50},{name:"Guest",hosts:20}]);
  const [name,setName]=useState("Voice");
  const [hosts,setHosts]=useState("12");
  const [planName,setPlanName]=useState("Office network");
  const [show,setShow]=useState(false);
  const [saved,setSaved]=useState<SavedPlan[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  const result=useMemo(()=>{
    try{return {base:details(cidr),blocks:vlsm(cidr,req),error:""};}
    catch(e){return {base:null,blocks:[],error:e instanceof Error?e.message:"Invalid CIDR"};}
  },[cidr,req]);

  async function loadSaved(){
    setLoading(true);
    const {data,error:loadError}=await supabase.from("network_plans").select("id,name,cidr,ip_version,updated_at").eq("user_id",profile.id).order("updated_at",{ascending:false});
    if(loadError)setError(loadError.message);else setSaved((data||[]) as SavedPlan[]);
    setLoading(false);
  }
  useEffect(()=>{void loadSaved();},[]);

  function add(){
    const clean=name.trim(),n=Number(hosts);
    if(!clean||clean.length>50||!Number.isSafeInteger(n)||n<1||n>1000000000||req.length>=50)return;
    if(req.some(item=>item.name.toLowerCase()===clean.toLowerCase())){setError("Each segment needs a unique name.");return;}
    setError("");setReq(current=>[...current,{name:clean,hosts:n}]);setName("");
  }
  function removeSegment(segment:string){setReq(current=>current.filter(item=>item.name!==segment));}
  async function copy(){
    if(!result.base)return;
    const csv=["Segment,Network,Mask,First,Last,Hosts",...result.blocks.map(b=>[b.name,b.network+"/"+b.prefix,b.mask,b.first,b.last,b.hosts].join(","))].join("\n");
    try{await navigator.clipboard.writeText(csv);setNotice("CSV copied to clipboard.");}catch{setError("Clipboard access was blocked by your browser.");}
  }
  async function savePlan(){
    if(!result.base||!planName.trim())return;
    setSaving(true);setError("");setNotice("");
    const {data:plan,error:planError}=await supabase.from("network_plans").insert({user_id:profile.id,name:planName.trim(),cidr:result.base.network+"/"+result.base.prefix,ip_version:4}).select("id,name,cidr,ip_version,updated_at").single();
    if(planError||!plan){setError(planError?.message||"Could not save this plan.");setSaving(false);return;}
    const allocations=result.blocks.map(block=>({plan_id:plan.id,user_id:profile.id,segment:block.name,network:block.network,prefix:block.prefix,hosts:block.hosts,start_num:block.start.toString(),end_num:block.end.toString(),notes:""}));
    if(allocations.length){
      const {error:allocationError}=await supabase.from("allocations").insert(allocations);
      if(allocationError){
        await supabase.from("network_plans").delete().eq("id",plan.id).eq("user_id",profile.id);
        setError("The plan could not save its VLSM allocations: "+allocationError.message);
        setSaving(false);return;
      }
    }
    setSaved(current=>[plan as SavedPlan,...current]);
    setNotice("Plan and "+allocations.length+" segment allocations saved.");
    setSaving(false);
  }
  async function openPlan(plan:SavedPlan){
    const {data,error:loadError}=await supabase.from("allocations").select("segment,hosts").eq("plan_id",plan.id).eq("user_id",profile.id).order("hosts",{ascending:false});
    if(loadError){setError(loadError.message);return;}
    setPlanName(plan.name);setCidr(plan.cidr);
    if(data?.length)setReq(data.map(row=>({name:row.segment,hosts:Number(row.hosts)})));
    setNotice("Loaded saved plan.");
  }
  async function deletePlan(id:string){
    const {error:deleteError}=await supabase.from("network_plans").delete().eq("id",id).eq("user_id",profile.id);
    if(deleteError)setError(deleteError.message);else{setSaved(current=>current.filter(plan=>plan.id!==id));setNotice("Saved plan deleted.");}
  }

  return <div className="panel planner">
    <label className="field-label" htmlFor="cidr">IPV4 NETWORK / CIDR</label>
    <input id="cidr" className="input cidr-input" value={cidr} onChange={e=>setCidr(e.target.value)} spellCheck={false}/>
    {result.error&&<p className="error" role="alert">{result.error}</p>}
    {result.base&&<>
      <div className="stats">{[["NETWORK",result.base.network],["SUBNET MASK",result.base.mask],["WILDCARD",result.base.wildcard],["USABLE HOSTS",result.base.usable.toString()]].map(([k,v])=><div className="stat" key={k}><small>{k}</small><strong>{v}</strong></div>)}</div>
      <div className="section">
        <div className="toolbar" style={{justifyContent:"space-between"}}><h2>Segment requirements</h2><button className="button" onClick={()=>setShow(v=>!v)}>{show?"Hide":"Show"} binary</button></div>
        <div className="splitrow"><input aria-label="Segment name" className="input" maxLength={50} value={name} onChange={e=>setName(e.target.value)} placeholder="Segment name"/><input aria-label="Required hosts" className="input mono" type="number" min="1" max="1000000000" value={hosts} onChange={e=>setHosts(e.target.value)}/><button className="button primary" onClick={add} aria-label="Add segment" disabled={req.length>=50}><Plus size={16}/></button></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>SEGMENT</th><th>NETWORK</th><th>MASK</th><th>HOSTS</th><th></th></tr></thead><tbody>{result.blocks.map(b=><tr key={b.name}><td>{b.name}</td><td>{b.network}/{b.prefix}</td><td>{b.mask}</td><td>{b.hosts}</td><td><button className="button" aria-label={"Remove "+b.name} onClick={()=>removeSegment(b.name)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
        {show&&<div className="panel planner"><p className="eyebrow">NETWORK ADDRESS / 32-BIT BINARY</p><code className="mono">{binary(result.base.network)}</code><p className="muted">First {result.base.prefix} bits identify the network. Remaining bits identify hosts.</p></div>}
        <div className="splitrow"><input className="input" aria-label="Saved plan name" maxLength={100} value={planName} onChange={e=>setPlanName(e.target.value)} placeholder="Plan name"/><button className="button primary" disabled={saving||!planName.trim()} onClick={()=>void savePlan()}><Save size={14}/>{saving?"Saving…":"Save plan"}</button><button className="button" onClick={()=>void copy()}><Copy size={14}/> Copy CSV</button></div>
      </div>
    </>}
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="auth-notice" role="status">{notice}</p>}
    <div className="section"><div className="toolbar" style={{justifyContent:"space-between"}}><h2><FolderOpen size={16}/> Saved plans</h2><span className="muted">{saved.length}</span></div>
      {loading?<p className="muted">Loading saved plans…</p>:saved.length===0?<p className="muted">Your saved network plans will appear here.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>PLAN</th><th>NETWORK</th><th>UPDATED</th><th></th></tr></thead><tbody>{saved.map(plan=><tr key={plan.id}><td><button className="button" onClick={()=>void openPlan(plan)}>{plan.name}</button></td><td className="mono">{plan.cidr}</td><td>{new Date(plan.updated_at).toLocaleDateString()}</td><td><button className="button" aria-label={"Delete "+plan.name} onClick={()=>void deletePlan(plan.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}
