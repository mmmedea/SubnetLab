"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useWorkspaceProfile } from "@/components/workspace/UserProfileProvider";
import { RefreshCw } from "lucide-react";

type Attempt={id:string;topic:string;correct:boolean;created_at:string;question:{prompt?:string;answer?:string;explanation?:string}};
export default function ProgressPage(){
 const profile=useWorkspaceProfile(),supabase=useMemo(()=>createClient(),[]);
 const [attempts,setAttempts]=useState<Attempt[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 async function load(){setLoading(true);setError("");const{data,error:fetchError}=await supabase.from("practice_attempts").select("id,topic,correct,created_at,question").eq("user_id",profile.id).order("created_at",{ascending:false}).limit(200);if(fetchError)setError(fetchError.message);else setAttempts((data||[]) as Attempt[]);setLoading(false);}
 useEffect(()=>{void load();},[]);
 const total=attempts.length,correct=attempts.filter(a=>a.correct).length,accuracy=total?Math.round(correct/total*100):0;
 const topics=Object.values(attempts.reduce<Record<string,{topic:string;total:number;correct:number}>>((acc,a)=>{const key=a.topic||"Other";acc[key]??={topic:key,total:0,correct:0};acc[key].total++;if(a.correct)acc[key].correct++;return acc;},{})).sort((a,b)=>a.topic.localeCompare(b.topic));
 return <><p className="eyebrow">PERFORMANCE / LEARNING</p><h1>Progress</h1><p className="lead">Your saved practice history, accuracy, and topic performance.</p><section className="stats">{[["ATTEMPTS",String(total)],["CORRECT",String(correct)],["ACCURACY",accuracy+"%"]].map(([label,value])=><div className="stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</section><section className="panel planner"><div className="toolbar" style={{justifyContent:"space-between"}}><h2>Topic performance</h2><button className="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>{error&&<p className="error" role="alert">{error}</p>}{loading?<p className="muted">Loading your practice history…</p>:total===0?<p className="muted">No practice attempts yet. Complete a question in the practice lab to start tracking your progress.</p>:<><div className="table-wrap"><table className="table"><thead><tr><th>TOPIC</th><th>ATTEMPTS</th><th>CORRECT</th><th>ACCURACY</th></tr></thead><tbody>{topics.map(t=><tr key={t.topic}><td>{t.topic}</td><td>{t.total}</td><td>{t.correct}</td><td>{Math.round(t.correct/t.total*100)}%</td></tr>)}</tbody></table></div><h2>Recent attempts</h2><div className="table-wrap"><table className="table"><thead><tr><th>QUESTION</th><th>RESULT</th><th>DATE</th></tr></thead><tbody>{attempts.slice(0,20).map(a=><tr key={a.id}><td>{a.question?.prompt||a.topic}</td><td>{a.correct?"Correct":"Incorrect"}</td><td>{new Date(a.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></>}</section></>;
}
