import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { parseIPv4, parseIPv4Cidr, planVLSM, parseIPv6, parseIPv6Cidr, planIPv6 } from '../shared/network.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters. Copy .env.example and set a secure value.');
const origin = process.env.APP_ORIGIN || `http://localhost:${port}`;
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({ origin, credentials: true, methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/v1/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/v1/practice', rateLimit({ windowMs: 60 * 1000, limit: 90, standardHeaders: true, legacyHeaders: false }));

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const ok = (data, status=200) => ({ status, body: { data } });
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge: 8 * 60 * 60 * 1000 };
function auth(req, res, next) {
  try {
    const cookie = String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('subnetlab='));
    const token = cookie ? decodeURIComponent(cookie.slice('subnetlab='.length)) : req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Sign in to continue.');
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.user = { id: Number(payload.sub) };
    next();
  } catch (e) { next(e instanceof HttpError ? e : new HttpError(401, 'Session is invalid or expired. Please sign in again.')); }
}
// SameSite cookies plus strict same-origin checks on every state-changing request.
app.use('/api/v1', (req,res,next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
    const requestOrigin = req.headers.origin;
    const hasBearerToken = /^Bearer\s+/i.test(String(req.headers.authorization || ''));
    if (requestOrigin && requestOrigin !== origin) return next(new HttpError(403, 'Request origin is not allowed.'));
    if (!requestOrigin && !hasBearerToken) return next(new HttpError(403, 'Origin header is required for browser-session requests.'));
  }
  next();
});

const router = express.Router();
router.post('/auth/register', async (req,res,next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpError(400,'Enter a valid email address.');
    if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) throw new HttpError(400,'Password must contain at least 10 characters and no more than 72 UTF-8 bytes.');
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(email,hash);
    res.status(201).json({ data: { id: Number(result.lastInsertRowid), email } });
  } catch(e) { if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return next(new HttpError(409,'An account with that email already exists.')); next(e); }
});
router.post('/auth/login', async (req,res,next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
    const user = db.prepare('SELECT id,email,password_hash FROM users WHERE email=?').get(email);
    if (!user || !(await bcrypt.compare(password,user.password_hash))) throw new HttpError(401,'Email or password is incorrect.');
    const token = jwt.sign({},secret,{algorithm:'HS256',subject:String(user.id),expiresIn:'8h'});
    res.cookie('subnetlab',token,cookieOptions).json({data:{id:user.id,email:user.email}});
  } catch(e) { next(e); }
});
router.post('/auth/logout',(req,res)=>{res.clearCookie('subnetlab',{...cookieOptions,maxAge:undefined});res.json({data:{signedOut:true}})});
router.get('/auth/me',auth,(req,res,next)=>{try{const u=db.prepare('SELECT id,email FROM users WHERE id=?').get(req.user.id);if(!u)throw new HttpError(401,'Account no longer exists.');res.json({data:u})}catch(e){next(e)}});

function getPlan(userId,id) { const p=db.prepare('SELECT * FROM plans WHERE id=? AND user_id=?').get(id,userId); if(!p) throw new HttpError(404,'Plan not found.'); return {...p,data:JSON.parse(p.data_json)}; }
function calculate(body){const family=Number(body.family??4);if(family!==4&&family!==6)throw new HttpError(400,'Address family must be 4 or 6.');return family===6?planIPv6(body.base,body.subnetPrefix,body.names):planVLSM(body.base,body.requirements)}
router.get('/plans',auth,(req,res)=>res.json({data:db.prepare('SELECT id,name,family,base,created_at,updated_at FROM plans WHERE user_id=? ORDER BY updated_at DESC').all(req.user.id)}));
router.post('/plans/compute',auth,(req,res,next)=>{try{res.json({data:calculate(req.body)})}catch(e){next(e instanceof HttpError?e:new HttpError(400,e.message))}});
router.post('/plans',auth,(req,res,next)=>{try{
  const {name,family=4,base,requirements,subnetPrefix,names}=req.body;
  const title=String(name||'').trim(); if(!title||title.length>100)throw new HttpError(400,'Plan name must contain 1–100 characters.');
  const computed=calculate({family,base,requirements,subnetPrefix,names});
  const row=db.prepare('INSERT INTO plans(user_id,name,family,base,data_json) VALUES(?,?,?,?,?)').run(req.user.id,title,computed.family,computed.base,JSON.stringify(computed));
  res.status(201).json({data:{id:Number(row.lastInsertRowid),name:title,...computed}});
}catch(e){next(e instanceof HttpError?e:new HttpError(400,e.message))}});
router.get('/plans/:id',auth,(req,res,next)=>{try{const p=getPlan(req.user.id,req.params.id);res.json({data:{id:p.id,name:p.name,...p.data,createdAt:p.created_at,updatedAt:p.updated_at}})}catch(e){next(e)}});
router.put('/plans/:id',auth,(req,res,next)=>{try{
  const old=getPlan(req.user.id,req.params.id); const name=String(req.body.name??old.name).trim();if(!name||name.length>100)throw new HttpError(400,'Plan name must contain 1–100 characters.');
  const family=Number(req.body.family??old.family);const computed=calculate({...req.body,family,base:req.body.base??old.base});
  const hasIpam=db.prepare('SELECT 1 FROM ip_records WHERE user_id=? AND plan_id=? UNION SELECT 1 FROM reservations WHERE user_id=? AND plan_id=?').get(req.user.id,old.id,req.user.id,old.id);
  const sameAllocations=old.family===computed.family&&old.data.allocations.length===computed.allocations.length&&old.data.allocations.every((a,i)=>{const b=computed.allocations[i];return a.network===b.network&&(old.family===6||a.prefix===b.prefix)});
  const change=db.transaction(()=>{ if(hasIpam&&!sameAllocations) throw new HttpError(409,'This change alters saved IPAM network boundaries. Remove or release the plan’s IPAM records before changing its allocations.');
    db.prepare("UPDATE plans SET name=?,family=?,base=?,data_json=?,updated_at=datetime('now') WHERE id=? AND user_id=?").run(name,family,computed.base,JSON.stringify(computed),old.id,req.user.id); });change();res.json({data:{id:old.id,name,...computed}});
}catch(e){next(e instanceof HttpError?e:new HttpError(400,e.message))}});
router.delete('/plans/:id',auth,(req,res,next)=>{try{const result=db.prepare('DELETE FROM plans WHERE id=? AND user_id=?').run(req.params.id,req.user.id);if(!result.changes)throw new HttpError(404,'Plan not found.');res.json({data:{deleted:true}})}catch(e){next(e)}});

function selectedNetwork(plan, idx) { const allocation=plan.data.allocations[Number(idx)];if(!allocation)throw new HttpError(400,'Select an allocation that belongs to this plan.');return allocation; }
function addressInteger(family,address) { try{return (family===4?parseIPv4(address):parseIPv6(address)).toString()}catch(e){throw new HttpError(400,e.message)} }
function contains(allocation,family,int) {
  if(family===4){const d=parseIPv4Cidr(`${allocation.network}/${allocation.prefix}`);const n=BigInt(int);return n>=d.network&&n<=d.end}
  const d=parseIPv6Cidr(allocation.network);const n=BigInt(int);return n>=d.network&&n<=d.end;
}
function assignable(allocation,family,int) {
  if(family!==4||allocation.prefix>=31)return true;
  const value=BigInt(int);
  return value>BigInt(allocation.startInt)&&value<BigInt(allocation.endInt);
}
function listIpam(uid,planId) {return {records:db.prepare("SELECT id,plan_id AS planId,network_cidr AS network,family,address,label,status,created_at AS createdAt FROM ip_records WHERE user_id=? AND plan_id=? ORDER BY address_int").all(uid,planId),reservations:db.prepare('SELECT id,plan_id AS planId,network_cidr AS network,family,address,label,mac,created_at AS createdAt FROM reservations WHERE user_id=? AND plan_id=? ORDER BY address_int').all(uid,planId)}}
router.get('/ipam',auth,(req,res,next)=>{try{if(req.query.planId){getPlan(req.user.id,req.query.planId);res.json({data:listIpam(req.user.id,req.query.planId)})}else res.json({data:{records:db.prepare("SELECT id,plan_id AS planId,network_cidr AS network,family,address,label,status,created_at AS createdAt FROM ip_records WHERE user_id=? AND status='active' ORDER BY created_at DESC").all(req.user.id),reservations:db.prepare('SELECT id,plan_id AS planId,network_cidr AS network,family,address,label,mac,created_at AS createdAt FROM reservations WHERE user_id=? ORDER BY created_at DESC').all(req.user.id)}})}catch(e){next(e)}});
router.post('/ipam/records',auth,(req,res,next)=>{try{
  const plan=getPlan(req.user.id,req.body.planId),allocation=selectedNetwork(plan,req.body.allocationIndex),family=plan.family;
  const address=String(req.body.address||'').trim(),label=String(req.body.label||'').trim();if(!label||label.length>120)throw new HttpError(400,'Record label must contain 1–120 characters.');
  const value=addressInteger(family,address);if(!contains(allocation,family,value))throw new HttpError(400,'Address is outside the selected network.');if(!assignable(allocation,family,value))throw new HttpError(400,'The network and broadcast addresses cannot be assigned in an IPv4 subnet larger than /31.');
  if(db.prepare("SELECT 1 FROM ip_records WHERE user_id=? AND address_int=? AND status='active' UNION SELECT 1 FROM reservations WHERE user_id=? AND address_int=?").get(req.user.id,value,req.user.id,value))throw new HttpError(409,'That address is already actively assigned or reserved in your account.');
  const row=db.prepare('INSERT INTO ip_records(user_id,plan_id,network_cidr,family,address,address_int,label) VALUES(?,?,?,?,?,?,?)').run(req.user.id,plan.id,allocation.network||`${allocation.network}/${allocation.prefix}`,family,address,value,label);
  res.status(201).json({data:{id:Number(row.lastInsertRowid),address,label,status:'active'}});
}catch(e){next(e)}});
router.post('/ipam/records/:id/release',auth,(req,res,next)=>{try{const r=db.prepare("UPDATE ip_records SET status='released',updated_at=datetime('now') WHERE id=? AND user_id=? AND status='active'").run(req.params.id,req.user.id);if(!r.changes)throw new HttpError(404,'Active IP record not found.');res.json({data:{released:true}})}catch(e){next(e)}});
router.delete('/ipam/records/:id',auth,(req,res,next)=>{try{const r=db.prepare('DELETE FROM ip_records WHERE id=? AND user_id=?').run(req.params.id,req.user.id);if(!r.changes)throw new HttpError(404,'IP record not found.');res.json({data:{deleted:true}})}catch(e){next(e)}});
router.post('/ipam/reservations',auth,(req,res,next)=>{try{
  const plan=getPlan(req.user.id,req.body.planId),allocation=selectedNetwork(plan,req.body.allocationIndex),family=plan.family;
  const address=String(req.body.address||'').trim(),label=String(req.body.label||'').trim(),mac=String(req.body.mac||'').trim().toLowerCase();
  if(!label||label.length>120)throw new HttpError(400,'Reservation label must contain 1–120 characters.');if(!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac))throw new HttpError(400,'Enter a MAC address in aa:bb:cc:dd:ee:ff format.');
  const value=addressInteger(family,address);if(!contains(allocation,family,value))throw new HttpError(400,'Address is outside the selected network.');if(!assignable(allocation,family,value))throw new HttpError(400,'The network and broadcast addresses cannot be reserved in an IPv4 subnet larger than /31.');
  if(db.prepare("SELECT 1 FROM ip_records WHERE user_id=? AND address_int=? AND status='active' UNION SELECT 1 FROM reservations WHERE user_id=? AND address_int=?").get(req.user.id,value,req.user.id,value))throw new HttpError(409,'That address is already actively assigned or reserved in your account.');
  const row=db.prepare('INSERT INTO reservations(user_id,plan_id,network_cidr,family,address,address_int,label,mac) VALUES(?,?,?,?,?,?,?,?)').run(req.user.id,plan.id,allocation.network||`${allocation.network}/${allocation.prefix}`,family,address,value,label,mac);
  res.status(201).json({data:{id:Number(row.lastInsertRowid),address,label,mac}});
}catch(e){next(e)}});
router.delete('/ipam/reservations/:id',auth,(req,res,next)=>{try{const r=db.prepare('DELETE FROM reservations WHERE id=? AND user_id=?').run(req.params.id,req.user.id);if(!r.changes)throw new HttpError(404,'Reservation not found.');res.json({data:{deleted:true}})}catch(e){next(e)}});

router.get('/plans/:id/config',auth,(req,res,next)=>{try{const p=getPlan(req.user.id,req.params.id);
  const snippets=p.data.allocations.map((a,i)=>{const safe=a.name.replace(/[^a-z0-9_-]/gi,'-').slice(0,40);if(p.family===6)return `! ${a.name} — example only; adapt interface, VLAN, and platform settings\ninterface GigabitEthernet0/0.${i+1}\n description ${safe}\n encapsulation dot1Q ${i+1}\n ipv6 address ${a.network}\n no shutdown\n`;return `! ${a.name} — example only; adapt interface, gateway, and platform settings\ninterface GigabitEthernet0/0.${i+1}\n description ${safe}\n encapsulation dot1Q ${i+1}\n ip address ${a.first} ${a.mask}\n no shutdown\n\nip dhcp pool ${safe}\n network ${a.network} ${a.mask}\n default-router ${a.first}\n dns-server 1.1.1.1\n`;}).join('\n');const platform=p.family===4?'Cisco IOS-style illustrative IPv4 interface and DHCP configuration; not applied to a device.':'Cisco IOS-style illustrative IPv6 interface configuration; IPv4 DHCP pools are omitted; not applied to a device.';res.json({data:{platform,text:snippets}})}catch(e){next(e)}});
router.get('/plans/:id/export.csv',auth,(req,res,next)=>{try{const p=getPlan(req.user.id,req.params.id);const rows=p.family===4?p.data.allocations.map(a=>[a.name,a.network+'/'+a.prefix,a.mask,a.total,a.usable,a.first,a.last,a.broadcast]):p.data.allocations.map(a=>[a.name,a.network,a.total]);
  const headers=p.family===4?['Name','Network CIDR','Subnet mask','Total addresses','Usable hosts','First usable','Last usable','Broadcast']:['Name','IPv6 prefix','Address count'];const q=x=>'"'+String(x??'').replaceAll('"','""')+'"';const csv=[headers,...rows].map(r=>r.map(q).join(',')).join('\r\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="subnetlab-plan-${p.id}.csv"`);res.send(csv)}catch(e){next(e)}});
router.get('/ipam/export.csv',auth,(req,res,next)=>{try{const id=req.query.planId;if(!id)throw new HttpError(400,'Provide a planId to export IPAM records.');const p=getPlan(req.user.id,id);const rows=[...db.prepare("SELECT 'assignment' kind,address,label,network_cidr network,family,status,' ' mac FROM ip_records WHERE user_id=? AND plan_id=?").all(req.user.id,p.id),...db.prepare("SELECT 'reservation' kind,address,label,network_cidr network,family,'reserved' status,mac FROM reservations WHERE user_id=? AND plan_id=?").all(req.user.id,p.id)];const q=x=>'"'+String(x??'').replaceAll('"','""')+'"';const csv=[['Record type','Address','Device / owner','Network','Family','Status','MAC address'],...rows.map(r=>[r.kind,r.address,r.label,r.network,`IPv${r.family}`,r.status,r.mac])].map(r=>r.map(q).join(',')).join('\r\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="subnetlab-ipam-${p.id}.csv"`);res.send(csv)}catch(e){next(e)}});

function makeQuestion(topic,difficulty){
  const n=(min,max)=>crypto.randomInt(min,max+1);let prefix,answer,prompt,explanation;
  const range=difficulty==='advanced'?[0,32]:difficulty==='intermediate'?[16,30]:[24,30];
  if(topic==='host-count'){prefix=n(...range);answer=String(prefix===32?1:prefix===31?2:2**(32-prefix)-2);prompt=`How many usable IPv4 host addresses are in a /${prefix} subnet?`;explanation=`A /${prefix} contains ${2**(32-prefix)} total addresses; subtract network and broadcast except for /31 point-to-point and /32 host routes.`;}
  else if(topic==='mask'){prefix=n(...range);answer=Array.from({length:4},(_,i)=>{const p=prefix-i*8;return p>=8?255:p<=0?0:256-2**(8-p)}).join('.');prompt=`What dotted-decimal subnet mask corresponds to /${prefix}?`;explanation=`A /${prefix} mask has ${prefix} leading one bits: ${answer}.`;}
  else {const [min,max]=difficulty==='advanced'?[8,30]:difficulty==='intermediate'?[16,30]:[24,29];const p=n(min,max),block=2**(32-p),ip=`192.0.2.${n(1,254)}`,d=parseIPv4Cidr(`${ip}/${p}`);answer=d.canonical;prompt=`What is the canonical network address for ${ip}/${p}?`;explanation=`The /${p} prefix places ${ip} in ${d.canonical}.`;}
  const id=crypto.randomUUID();return{id,topic,difficulty,prompt,answer,explanation};
}
router.get('/practice/next',auth,(req,res)=>{const topics=['host-count','mask','network-address'];const topic=topics.includes(req.query.topic)?req.query.topic:topics[crypto.randomInt(topics.length)];const difficulty=['beginner','intermediate','advanced'].includes(req.query.difficulty)?req.query.difficulty:'beginner';const q=makeQuestion(topic,difficulty);db.prepare('INSERT INTO practice_questions(id,user_id,topic,difficulty,prompt,answer,explanation) VALUES(?,?,?,?,?,?,?)').run(q.id,req.user.id,q.topic,q.difficulty,q.prompt,q.answer,q.explanation);res.json({data:{id:q.id,topic:q.topic,difficulty:q.difficulty,prompt:q.prompt}})});
router.post('/practice/answer',auth,(req,res,next)=>{try{const q=db.prepare('SELECT * FROM practice_questions WHERE id=? AND user_id=?').get(req.body.questionId,req.user.id);if(!q)throw new HttpError(404,'Question not found or already unavailable.');const answer=String(req.body.answer||'').trim();const correct=answer.toLowerCase()===q.answer.toLowerCase();db.transaction(()=>{db.prepare('INSERT INTO attempts(user_id,question_id,topic,difficulty,correct) VALUES(?,?,?,?,?)').run(req.user.id,q.id,q.topic,q.difficulty,correct?1:0);db.prepare('DELETE FROM practice_questions WHERE id=? AND user_id=?').run(q.id,req.user.id)})();res.json({data:{correct,expected:q.answer,explanation:q.explanation}})}catch(e){next(e)}});
router.get('/analytics/me',auth,(req,res)=>{const total=db.prepare('SELECT COUNT(*) n,COALESCE(SUM(correct),0) c FROM attempts WHERE user_id=?').get(req.user.id);const topics=db.prepare('SELECT topic,COUNT(*) attempts,SUM(correct) correct FROM attempts WHERE user_id=? GROUP BY topic ORDER BY topic').all(req.user.id).map(x=>({...x,accuracy:x.attempts?Math.round(x.correct/x.attempts*100):0}));const recent=db.prepare('SELECT topic,difficulty,correct,created_at AS createdAt FROM attempts WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 30').all(req.user.id);const daily=db.prepare("SELECT date(created_at) day,COUNT(*) attempts,SUM(correct) correct FROM attempts WHERE user_id=? AND created_at>=datetime('now','-13 days') GROUP BY date(created_at) ORDER BY day").all(req.user.id).map(x=>({...x,accuracy:Math.round(x.correct/x.attempts*100)}));res.json({data:{totalAttempts:total.n,correct:total.c,accuracy:total.n?Math.round(total.c/total.n*100):null,topics,recent,daily}})});
router.get('/dashboard',auth,(req,res)=>{const plans=db.prepare('SELECT id,name,family,base,data_json,updated_at AS updatedAt FROM plans WHERE user_id=? ORDER BY updated_at DESC').all(req.user.id).map(p=>({id:p.id,name:p.name,family:p.family,base:p.base,updatedAt:p.updatedAt,allocationCount:JSON.parse(p.data_json).allocations.length}));const ips=db.prepare("SELECT COUNT(*) active FROM ip_records WHERE user_id=? AND status='active'").get(req.user.id);const reservations=db.prepare('SELECT COUNT(*) total FROM reservations WHERE user_id=?').get(req.user.id);const analytics=db.prepare('SELECT COUNT(*) n,COALESCE(SUM(correct),0) c FROM attempts WHERE user_id=?').get(req.user.id);const recent=db.prepare("SELECT 'assignment' kind,label detail,created_at createdAt FROM ip_records WHERE user_id=? UNION ALL SELECT 'practice' kind,topic detail,created_at createdAt FROM attempts WHERE user_id=? ORDER BY createdAt DESC LIMIT 6").all(req.user.id,req.user.id);res.json({data:{plans,activeAssignments:ips.active,reservations:reservations.total,practice:{attempts:analytics.n,accuracy:analytics.n?Math.round(analytics.c/analytics.n*100):null},recent}})});
app.use('/api/v1',router);
app.use(express.static('public'));
app.use((req,res,next)=>req.path.startsWith('/api/')?next(new HttpError(404,'API route not found.')):res.sendFile(path.resolve('public/index.html')));
app.use((err,req,res,_next)=>{const status=err.status||500;if(status>=500)console.error(err.message);res.status(status).json({error:{message:status>=500?'Something went wrong. Please try again.':err.message}})});
export { app };
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) app.listen(port,()=>console.log(`SubnetLab listening on ${origin}`));
