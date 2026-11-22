"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useWorkspaceProfile } from "@/components/workspace/UserProfileProvider";

const questions = [
  {topic:"IPv4 subnetting",prompt:"What is the network address of 192.168.10.77/26?",answer:"192.168.10.64",explanation:"A /26 has a block size of 64 in the last octet. The ranges are 0–63, 64–127, 128–191, and 192–255. Address 77 is in 64–127."},
  {topic:"IPv4 subnetting",prompt:"What is the broadcast address of 10.0.5.130/25?",answer:"10.0.5.255",explanation:"A /25 has 128 addresses. The second subnet spans 10.0.5.128 through 10.0.5.255."},
  {topic:"CIDR",prompt:"How many total addresses are in a /28 IPv4 subnet?",answer:"16",explanation:"2^(32−28) = 16 total addresses. In a traditional subnet, 14 are usable host addresses."},
  {topic:"CIDR",prompt:"Which prefix provides at least 50 usable IPv4 host addresses?",answer:"/26",explanation:"A /26 provides 64 total addresses and 62 traditional usable host addresses."},
  {topic:"IPv4 subnetting",prompt:"What is the subnet mask for /27?",answer:"255.255.255.224",explanation:"A /27 mask has 27 network bits, which gives 255.255.255.224."}
];

export default function PracticePage(){
 const profile=useWorkspaceProfile(),supabase=useMemo(()=>createClient(),[]);
 const [index,setIndex]=useState(0),[answer,setAnswer]=useState(""),[checked,setChecked]=useState(false),[correct,setCorrect]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const question=questions[index%questions.length];
 async function check(){
   if(!answer.trim())return;
   setBusy(true);setError("");
   const isCorrect=answer.trim().toLowerCase()===question.answer.toLowerCase();
   const {error:saveError}=await supabase.from("practice_attempts").insert({user_id:profile.id,topic:question.topic,question:{prompt:question.prompt,answer:question.answer,explanation:question.explanation},correct:isCorrect,time_ms:0});
   if(saveError){setError("Your answer was checked, but the attempt could not be saved: "+saveError.message);setBusy(false);setCorrect(isCorrect);setChecked(true);return;}
   setCorrect(isCorrect);setChecked(true);setBusy(false);
 }
 function next(){setIndex(value=>value+1);setAnswer("");setChecked(false);setCorrect(false);setError("");}
 return <><p className="eyebrow">SUBNETTING LAB / PRACTICE</p><h1>Practice lab</h1><p className="lead">Answer subnetting questions and keep a record of your progress.</p><section className="panel planner"><div className="toolbar" style={{justifyContent:"space-between"}}><span className="eyebrow">QUESTION {(index%questions.length)+1} / {questions.length}</span><span className="muted">{question.topic}</span></div><h2>{question.prompt}</h2><div className="practice-answer-form"><label className="field-label" htmlFor="answer">YOUR ANSWER</label><input id="answer" className="input mono" value={answer} onChange={e=>{setAnswer(e.target.value);setChecked(false);}} onKeyDown={e=>{if(e.key==="Enter"&&!checked)void check();}} placeholder="Enter your answer"/>{!checked?<button className="button primary" disabled={busy||!answer.trim()} onClick={()=>void check()}>{busy?"Saving…":"Check answer"}</button>:null}</div>{checked?<div className="section" role="status"><p>{correct?"Correct!":"Not quite. Review the solution."}</p><p className="muted">{question.explanation}</p><p><b>Correct answer:</b> <code>{question.answer}</code></p><button className="button primary" onClick={next}>Next question</button></div>}{error&&<p className="error" role="alert">{error}</p>}</section></>;
}
