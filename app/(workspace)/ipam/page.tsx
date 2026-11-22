"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useWorkspaceProfile } from "@/components/workspace/UserProfileProvider";
import { Plus, Trash2, RefreshCw } from "lucide-react";

type Assignment = { id:string; address:string; label:string; status:"assigned"|"reserved"|"available"|"retired"; notes:string; plan_id:string|null; created_at:string };
type Plan = { id:string; name:string; cidr:string };

export default function IpamPage() {
  const profile = useWorkspaceProfile();
  const supabase = useMemo(() => createClient(), []);
  const [items,setItems] = useState<Assignment[]>([]);
  const [plans,setPlans] = useState<Plan[]>([]);
  const [address,setAddress] = useState("");
  const [label,setLabel] = useState("");
  const [status,setStatus] = useState<Assignment["status"]>("assigned");
  const [planId,setPlanId] = useState("");
  const [notes,setNotes] = useState("");
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [filter,setFilter] = useState("all");

  async function load() {
    setLoading(true); setError("");
    const [a,p] = await Promise.all([
      supabase.from("ip_assignments").select("id,address,label,status,notes,plan_id,created_at").eq("user_id",profile.id).order("created_at",{ascending:false}),
      supabase.from("network_plans").select("id,name,cidr").eq("user_id",profile.id).order("updated_at",{ascending:false})
    ]);
    if(a.error) setError(a.error.message); else setItems((a.data||[]) as Assignment[]);
    if(!p.error) setPlans((p.data||[]) as Plan[]);
    setLoading(false);
  }
  useEffect(()=>{void load();},[]);
  async function add(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const value=address.trim();
    const ipv4=/^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value);
    const ipv6=value.includes(":") && /^[0-9a-fA-F:]+$/.test(value) && value.split(":").length>=3;
    if(!ipv4&&!ipv6){setError("Enter a valid IPv4 or IPv6 address.");setSaving(false);return;}
    const {data,error:insertError}=await supabase.from("ip_assignments").insert({user_id:profile.id,address:value,label:label.trim(),status,notes:notes.trim(),plan_id:planId||null}).select("id,address,label,status,notes,plan_id,created_at").single();
    if(insertError)setError(insertError.code==="23505"?"That address is already in your inventory.":insertError.message);
    else if(data){setItems(current=>[data as Assignment,...current]);setAddress("");setLabel("");setNotes("");setPlanId("");}
    setSaving(false);
  }
  async function updateStatus(id:string,next:Assignment["status"]) {
    const {error:updateError}=await supabase.from("ip_assignments").update({status:next}).eq("id",id).eq("user_id",profile.id);
    if(updateError)setError(updateError.message);else setItems(current=>current.map(item=>item.id===id?{...item,status:next}:item));
  }
  async function remove(id:string) {
    const {error:deleteError}=await supabase.from("ip_assignments").delete().eq("id",id).eq("user_id",profile.id);
    if(deleteError)setError(deleteError.message);else setItems(current=>current.filter(item=>item.id!==id));
  }
  const visible=filter==="all"?items:items.filter(item=>item.status===filter);
  return <><p className="eyebrow">ADDRESS INVENTORY</p><h1>IP address manager</h1><p className="lead">Track assigned, reserved, available, and retired addresses across your saved plans.</p>
    <section className="panel planner">
      <div className="toolbar" style={{justifyContent:"space-between"}}><h2>Add an address</h2><button className="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
      <form onSubmit={add} className="settings-stack">
        <div className="splitrow"><input className="input mono" aria-label="IP address" placeholder="192.168.1.10 or 2001:db8::1" required value={address} onChange={e=>setAddress(e.target.value)}/><input className="input" aria-label="Label" placeholder="Device / host label" required maxLength={80} value={label} onChange={e=>setLabel(e.target.value)}/></div>
        <div className="splitrow"><select className="input" aria-label="Status" value={status} onChange={e=>setStatus(e.target.value as Assignment["status"])}><option value="assigned">Assigned</option><option value="reserved">Reserved</option><option value="available">Available</option><option value="retired">Retired</option></select><select className="input" aria-label="Network plan" value={planId} onChange={e=>setPlanId(e.target.value)}><option value="">No linked plan</option>{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {plan.cidr}</option>)}</select></div>
        <input className="input" aria-label="Notes" placeholder="Notes (optional)" maxLength={240} value={notes} onChange={e=>setNotes(e.target.value)}/>
        <button className="button primary" disabled={saving||!address.trim()||!label.trim()}><Plus size={15}/>{saving?"Saving…":"Add address"}</button>
      </form>
    </section>
    <section className="panel planner">
      <div className="toolbar" style={{justifyContent:"space-between"}}><h2>Inventory <span className="muted">({items.length})</span></h2><select className="input" aria-label="Filter assignments" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option><option value="assigned">Assigned</option><option value="reserved">Reserved</option><option value="available">Available</option><option value="retired">Retired</option></select></div>
      {error&&<p className="error" role="alert">{error}</p>}
      {loading?<p className="muted">Loading your inventory…</p>:visible.length===0?<p className="muted">No addresses found. Add your first IP address above.</p>:<div className="table-wrap"><table className="table"><thead><tr><th>ADDRESS</th><th>LABEL</th><th>STATUS</th><th>NOTES</th><th></th></tr></thead><tbody>{visible.map(item=><tr key={item.id}><td className="mono">{item.address}</td><td>{item.label}</td><td><select className="input" aria-label={"Status for "+item.address} value={item.status} onChange={e=>void updateStatus(item.id,e.target.value as Assignment["status"])}><option value="assigned">Assigned</option><option value="reserved">Reserved</option><option value="available">Available</option><option value="retired">Retired</option></select></td><td>{item.notes||"—"}</td><td><button className="button" aria-label={"Delete "+item.address} onClick={()=>void remove(item.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
