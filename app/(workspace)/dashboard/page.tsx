"use client";
import Link from "next/link";
import {useWorkspaceProfile} from "@/components/workspace/UserProfileProvider";

export default function Page(){
 const profile=useWorkspaceProfile();
 const firstName=profile.displayName?.trim().split(/\s+/)[0];
 const name=profile.username?.trim()||firstName||"there";
 return <><p className="eyebrow">OVERVIEW / NETWORK OPERATIONS</p><h1>Welcome, {name}</h1><p className="lead">Start a plan, track address assignments, or sharpen your subnetting skills.</p><div className="toolgrid"><Link className="panel planner" href="/planner"><p className="eyebrow">01 / PLAN</p><h2>Open subnet planner</h2><p className="muted">Calculate a CIDR block and allocate VLSM segments.</p></Link><Link className="panel planner" href="/ipam"><p className="eyebrow">02 / TRACK</p><h2>Manage IP addresses</h2><p className="muted">Record assignments and reservations.</p></Link></div></>;
}
