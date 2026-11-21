"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useState} from "react";
import {Activity,BookOpen,Boxes,Calculator,Network,Settings,Menu,PanelLeftClose,PanelLeftOpen,LogOut} from "lucide-react";
import {createClient} from "@/utils/supabase/client";
const links=[["/dashboard","Overview",Activity],["/planner","Planner",Calculator],["/ipam","IPAM",Network],["/practice","Practice",BookOpen],["/progress","Progress",Boxes],["/settings","Settings",Settings]] as const;
export default function WorkspaceSidebar(){
 const pathname=usePathname();const[collapsed,setCollapsed]=useState(false);const[busy,setBusy]=useState(false);
 async function signOut(){setBusy(true);await createClient().auth.signOut();window.location.assign("/login");}
 return <aside className={`sidebar ${collapsed?"is-collapsed":""}`}>
  <div className="sidebar-brand-row"><Link className="brand" href="/dashboard" aria-label="SubnetLab dashboard"><img className="brand-mark" src="/logo.svg" alt="" width="36" height="32"/><span className="brand-word">Subnet<span>Lab</span></span></Link>
   <button type="button" className="sidebar-toggle" onClick={()=>setCollapsed(v=>!v)} aria-label={collapsed?"Expand sidebar":"Collapse sidebar"} aria-expanded={!collapsed} title={collapsed?"Expand sidebar":"Collapse sidebar"}>{collapsed?<PanelLeftOpen size={18}/>:<Menu size={19}/>}</button>
  </div>
  <div className="nav-label">WORKSPACE</div><nav className="nav" aria-label="Workspace navigation">{links.map(([href,label,Icon])=><Link href={href} key={href} title={collapsed?label:undefined} aria-label={label} aria-current={pathname===href?"page":undefined}><Icon/><span>{label}</span></Link>)}</nav>
  <div className="side-bottom"><span>IPV4 / IPV6 WORKSPACE</span><button className="sidebar-signout" onClick={signOut} disabled={busy} title="Sign out"><LogOut size={16}/><span>{busy?"Signing out…":"Sign out"}</span></button></div>
 </aside>;
}
