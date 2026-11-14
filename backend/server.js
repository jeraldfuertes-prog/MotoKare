'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { pool, stmt, transaction, ready, getUser, bootstrap, bikeRows, componentRows, serviceRows, customerRows, jobRows, appointmentRows, shopRows, shopProfile, connectionRows, riderAppointmentRows } = require('./db');
const scrypt=promisify(scryptCallback);
const PORT=Number(process.env.PORT||3000);
const HOST=process.env.HOST||'127.0.0.1';
const SESSION_TTL=7*86400;
const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
const mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const base=path.resolve(__dirname,'../frontend');
const catalog=[['Engine Oil','bolt',2000,30],['Brake Inspection','shield',4500,60],['Air Filter','filter',6000,90],['Chain & Sprocket','settings',2100,45],['Battery Check','bolt',7000,120],['Tire Inspection','target',4700,60]];
const componentCatalog=[
 ...catalog.map(([name,icon,,days])=>({name,icon,suggestedDays:days})),
 ...[
 ['Spark Plug','bolt',90],['Brake Fluid','shield',180],['Coolant','filter',180],
 ['Drive Belt (CVT)','settings',180],['Fuel Filter','filter',120],['Fork Oil','settings',180],
 ['Valve Clearance','settings',180],['Clutch Inspection','wrench',120]
 ].map(([name,icon,suggestedDays])=>({name,icon,suggestedDays}))
];
const SHOP_SERVICES=['Oil Change','Brake Service','Tire Service','Chain & Sprocket','Battery Service','Air Filter','Engine Repair','General Inspection','Other'];
const fail=(code,message)=>{const e=new Error(message);e.status=code;throw e;};
const today=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const a=Object.fromEntries(p.map(x=>[x.type,x.value]));return a.year+'-'+a.month+'-'+a.day;};
const later=(days,dateString=today())=>{const d=new Date(dateString+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const text=(v,key,max=100,{min=1}={})=>{if(typeof v!=='string')fail(400,`${key} must be text`);const s=v.trim();if(s.length<min||s.length>max)fail(400,`${key} must contain ${min}–${max} characters`);return s;};
const integer=(v,key,min=0,max=10000000)=>{const n=Number(v);if(v===''||v===null||v===undefined||!Number.isSafeInteger(n)||n<min||n>max)fail(400,`${key} must be a whole number between ${min} and ${max}`);return n;};
const money=(v,key='cost')=>{const n=Number(v);if(v===''||v===null||v===undefined||!Number.isFinite(n)||n<0||n>100000000||Math.abs(Math.round(n*100)/100-n)>1e-8)fail(400,`${key} must be a valid nonnegative amount`);return n;};
const date=(v,key='date')=>{const s=text(v,key,10,{min:10});if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(`${s}T00:00:00Z`))||new Date(`${s}T00:00:00Z`).toISOString().slice(0,10)!==s)fail(400,`${key} must be a valid YYYY-MM-DD date`);return s;};
const time=v=>{const s=text(v,'time',5,{min:5});if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))fail(400,'time must use HH:MM');return s;};
const role=v=>['rider','shop'].includes(v)?v:fail(400,'Role must be rider or shop');
const email=v=>{const s=text(v,'Email',254,{min:3}).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail(400,'Enter a valid email address');return s;};
const status=(v,options)=>options.includes(v)?v:fail(400,'Invalid status');
const pwd=v=>{if(typeof v!=='string'||v.length<10||v.length>128)fail(400,'Password must be 10–128 characters');return v;};
const send=(res,code,obj,extra={})=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(obj));};
const sha=s=>createHash('sha256').update(s).digest('hex');
async function hashPassword(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64);return `scrypt:${salt}:${key.toString('hex')}`;}
async function passwordMatches(password,stored){try{const [alg,salt,hex]=stored.split(':');if(alg!=='scrypt')return false;const target=Buffer.from(hex,'hex'),result=await scrypt(password,salt,target.length);return timingSafeEqual(result,target);}catch{return false;}}
const DUMMY='scrypt:00000000000000000000000000000000:3d5b22a1d2e3d0ff7a9e75316a99b1eecaa7b32aa0f8fd7bfac1819a6f05158a104d420b8e7974a21cc02ed5438b9559ae2f468959f57003472165cb15644386';
async function getSession(req){const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('mk_session='))?.slice(11);if(!raw||!/^[0-9a-f]{64}$/.test(raw))return null;const row=await stmt('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(sha(raw),Math.floor(Date.now()/1000));return row?{user:await getUser(row.user_id),tokenHash:sha(raw)}:null;}
function setCookie(req,res,value,maxAge){const secure=process.env.COOKIE_SECURE==='1'||Boolean(req.socket.encrypted);res.setHeader('Set-Cookie',`mk_session=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`);}
async function newSession(req,res,userId){const token=randomBytes(32).toString('hex');await stmt('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token),userId,Math.floor(Date.now()/1000)+SESSION_TTL);setCookie(req,res,token,SESSION_TTL);}
async function requireUser(req,wanted){const s=await getSession(req);if(!s?.user)fail(401,'Please sign in to continue');if(wanted&&s.user.role!==wanted)fail(403,'This resource belongs to another account type');return s.user;}
async function body(req){if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))fail(415,'Send JSON content');let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)fail(413,'Request too large');}try{const obj=JSON.parse(raw||'{}');if(!obj||typeof obj!=='object'||Array.isArray(obj))fail(400,'Expected JSON object');return obj;}catch(e){if(e.status)throw e;fail(400,'Malformed JSON');}}
const requireOwn=async (table,id,user)=>{if(!['bikes','components','services','customers','jobs','appointments'].includes(table)) fail(500,'Invalid resource table'); const row=await stmt(`SELECT id FROM ${table} WHERE id=? AND user_id=?`).get(id,user.id);if(!row)fail(404,'Record not found');return row;};
async function requireCustomer(id,user){await requireOwn('customers',id,user);return id;}
const limits=new Map();
function throttle(req){const ip=String(req.socket.remoteAddress||'unknown');const now=Date.now();if(limits.size>5000)for(const [key,v] of limits)if(v.until<now)limits.delete(key);const x=limits.get(ip)||{count:0,until:now+15*60000};if(x.until<now){x.count=0;x.until=now+15*60000;}x.count++;limits.set(ip,x);if(x.count>30)fail(429,'Too many authentication attempts. Try again later.');}
function csrf(req){if(!['POST','PATCH','PUT','DELETE'].includes(req.method))return;const origin=req.headers.origin;const host=req.headers.host;if(origin){let u;try{u=new URL(origin);}catch{fail(403,'Invalid origin');}if(u.host!==host)fail(403,'Cross-origin changes are not allowed');}if(req.headers['x-motokare-client']!=='web')fail(403,'Missing CSRF protection header');}
function sanitizeUser(user){return {id:user.id,email:user.email,name:user.name,role:user.role,shopName:user.shopName};}
async function api(req,res,url){
 csrf(req);
 const path=url.pathname,method=req.method;
 if(path==='/api/health'&&method==='GET'){await pool.query('SELECT 1');return send(res,200,{ok:true,service:'MotoKare API',version:4,database:'PostgreSQL'});}
 if(path==='/api/auth/register'&&method==='POST'){
  throttle(req);const b=await body(req),r=role(b.role),name=text(b.fullName,'Full name',80,{min:2}),e=email(b.email),password=pwd(b.password),shopName=r==='shop'?text(b.shopName,'Workshop name',100,{min:2}):'';
  if(await stmt('SELECT id FROM users WHERE email=?').get(e))fail(409,'An account with this email already exists');
  const hash=await hashPassword(password),id=randomUUID();
  try{await stmt('INSERT INTO users(id,email,name,password_hash,role,shop_name) VALUES(?,?,?,?,?,?)').run(id,e,name,hash,r,shopName);}catch(err){if(err.code==='23505')fail(409,'An account with this email already exists');throw err;}
  await newSession(req,res,id);return send(res,201,{user:sanitizeUser(await getUser(id))});
 }
 if(path==='/api/auth/login'&&method==='POST'){
  throttle(req);const b=await body(req),e=email(b.email);if(typeof b.password!=='string'||b.password.length>128)fail(400,'Invalid credentials');
  const row=await stmt('SELECT id,password_hash,role FROM users WHERE email=?').get(e);const matches=await passwordMatches(b.password,row?.password_hash||DUMMY);
  if(!row||!matches)fail(401,'Invalid email or password');if(b.role&&b.role!==row.role)fail(403,'Choose the account type used when registering');
  const old=await getSession(req);if(old)await stmt('DELETE FROM sessions WHERE token_hash=?').run(old.tokenHash);
  await newSession(req,res,row.id);return send(res,200,{user:sanitizeUser(await getUser(row.id))});
 }
 if(path==='/api/auth/logout'&&method==='POST'){
  const s=await getSession(req);if(s)await stmt('DELETE FROM sessions WHERE token_hash=?').run(s.tokenHash);setCookie(req,res,'',0);return send(res,200,{ok:true});
 }
 if(path==='/api/auth/me'&&method==='GET')return send(res,200,{user:sanitizeUser(await requireUser(req))});
 const user=await requireUser(req);
 if(path==='/api/bootstrap'&&method==='GET')return send(res,200,await bootstrap(user));
 if(path==='/api/me'&&method==='PATCH'){
  const b=await body(req),name=text(b.name,'Display name',80,{min:2}),e=email(b.email),shopName=user.role==='shop'?text(b.shopName,'Workshop name',100,{min:2}):'';
  try{await stmt('UPDATE users SET name=?,email=?,shop_name=? WHERE id=?').run(name,e,shopName,user.id);}catch(err){if(err.code==='23505')fail(409,'Email already in use');throw err;}
  return send(res,200,{user:sanitizeUser(await getUser(user.id))});
 }
 if(path==='/api/me/password'&&method==='PATCH'){
  const b=await body(req),row=await stmt('SELECT password_hash FROM users WHERE id=?').get(user.id);if(!await passwordMatches(b.currentPassword||'',row.password_hash))fail(401,'Current password is incorrect');const hash=await hashPassword(pwd(b.newPassword));
  await stmt('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id);const s=await getSession(req);await stmt('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(user.id,s.tokenHash);return send(res,200,{ok:true});
 }
 // Phase 4.1: explicit opt-in account connection flow; no private maintenance data is exposed.
 if(path==='/api/shops'&&method==='GET'){
  await requireUser(req,'rider');
  const query=text(url.searchParams.get('q')||'','Search',80,{min:0}),city=text(url.searchParams.get('city')||'','City',80,{min:0});
  const service=url.searchParams.get('service')||'';
  if(service && !SHOP_SERVICES.includes(service))fail(400,'Invalid workshop service filter');
  return send(res,200,{shops:await shopRows({query,city,service})});
 }
 if(path==='/api/shops/profile'&&method==='PATCH'){
  await requireUser(req,'shop');const b=await body(req);
  const city=text(b.city??'','City',80,{min:0}),address=text(b.address??'','Workshop address',160,{min:0}),description=text(b.description??'','Workshop description',500,{min:0});
  if(!Array.isArray(b.services)||b.services.length>SHOP_SERVICES.length||b.services.some(s=>!SHOP_SERVICES.includes(s))||new Set(b.services).size!==b.services.length)fail(400,'Choose valid, unique workshop services');
  await stmt('UPDATE users SET shop_city=?,shop_address=?,shop_description=?,services_offered=? WHERE id=? AND role=?').run(city,address,description,b.services,user.id,'shop');
  return send(res,200,{ok:true,shopProfile:await shopProfile(user.id)});
 }
 if(path==='/api/connections'&&method==='GET')return send(res,200,{connections:await connectionRows(user)});
 if(path==='/api/connections'&&method==='POST'){
  await requireUser(req,'rider');const b=await body(req),shopId=text(b.shopId,'Workshop ID',64);
  const shop=await stmt('SELECT id FROM users WHERE id=? AND role=?').get(shopId,'shop');
  if(!shop)fail(404,'Workshop not found');
  const id=randomUUID();
  try{await stmt('INSERT INTO account_connections(id,rider_id,shop_id,status) VALUES(?,?,?,?)').run(id,user.id,shop.id,'pending');}
  catch(err){if(err.code==='23505')fail(409,'A connection request to this workshop already exists');throw err;}
  return send(res,201,{id,status:'pending'});
 }
 const link=path.match(/^\/api\/connections\/([0-9a-f-]+)$/);
 if(link&&method==='PATCH'){
  await requireUser(req,'shop');const b=await body(req),decision=status(b.status,['accepted','declined']);
  const existing=await stmt('SELECT id,status FROM account_connections WHERE id=? AND shop_id=?').get(link[1],user.id);
  if(!existing)fail(404,'Connection request not found');
  if(existing.status!=='pending')fail(409,'Only pending requests can be reviewed');
  const updated=await stmt('UPDATE account_connections SET status=?,updated_at=NOW() WHERE id=? AND shop_id=? AND status=? RETURNING id').get(decision,link[1],user.id,'pending');
  if(!updated)fail(409,'This connection request was already reviewed');
  return send(res,200,{ok:true,status:decision});
 }
 if(link&&method==='DELETE'){
  const ownership=user.role==='rider'?'rider_id':'shop_id';
  const deleted=await stmt('DELETE FROM account_connections WHERE id=? AND '+ownership+'=? RETURNING id').get(link[1],user.id);
  if(!deleted)fail(404,'Connection not found');
  return send(res,200,{ok:true});
 }
 if(path==='/api/bikes'&&method==='GET'){await requireUser(req,'rider');return send(res,200,{bikes:await bikeRows(user.id)});}
 if(path==='/api/bikes'&&method==='POST'){
  await requireUser(req,'rider');const b=await body(req),id=randomUUID(),model=text(b.model,'Model',70),year=integer(b.year,'Year',1950,2100),plate=text(b.plate??'','Plate',25,{min:0}),odometer=integer(b.odometer??0,'Odometer'),d=today();
  await transaction(async tx => {
   await tx('INSERT INTO bikes(id,user_id,model,year,plate,odometer,updated) VALUES(?,?,?,?,?,?,?)').run(id,user.id,model,year,plate,odometer,d);
   for (const [name,icon,interval,days] of catalog) {
    await tx('INSERT INTO components(id,user_id,bike_id,name,icon,interval,last_km,next_km,due_date,interval_days,last_service_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),user.id,id,name,icon,interval,odometer,odometer+interval,later(days,d),days,null);
   }
  });
  return send(res,201,{id});
 }
 let m=path.match(/^\/api\/bikes\/([^/]+)(?:\/(odometer))?$/);
 if(m){await requireUser(req,'rider');await requireOwn('bikes',m[1],user);const b=method==='PATCH'?await body(req):{};
  if(method==='PATCH'&&m[2]==='odometer'){
   const km=integer(b.odometer,'Odometer'); const result=await stmt('UPDATE bikes SET odometer=?,updated=? WHERE id=? AND user_id=? AND odometer<=?').run(km,today(),m[1],user.id,km);if(!result.changes)fail(400,'Odometer cannot decrease');return send(res,200,{ok:true});
  }
  if(method==='PATCH'&&!m[2]){
   const model=text(b.model,'Model',70),year=integer(b.year,'Year',1950,2100),plate=text(b.plate??'','Plate',25,{min:0}),km=b.odometer===undefined?(await stmt('SELECT odometer FROM bikes WHERE id=? AND user_id=?').get(m[1],user.id)).odometer:integer(b.odometer,'Odometer');const result=await stmt('UPDATE bikes SET model=?,year=?,plate=?,odometer=?,updated=? WHERE id=? AND user_id=? AND odometer<=?').run(model,year,plate,km,today(),m[1],user.id,km);if(!result.changes)fail(400,'Odometer cannot decrease');return send(res,200,{ok:true});
  }
  if(method==='DELETE'&&!m[2]){await stmt('DELETE FROM bikes WHERE id=? AND user_id=?').run(m[1],user.id);return send(res,200,{ok:true});}
 }
 // Catalog intervals are suggestions only; consult the motorcycle manufacturer.
 if(path==='/api/component-catalog'&&method==='GET'){
  await requireUser(req,'rider');
  return send(res,200,{catalog:componentCatalog});
 }
 if(path==='/api/components'&&method==='GET'){
  await requireUser(req,'rider');
  return send(res,200,{components:await componentRows(user.id)});
 }
 if(path==='/api/components'&&method==='POST'){
  await requireUser(req,'rider');const b=await body(req);
  const bikeId=text(b.bikeId,'Motorcycle ID',64);await requireOwn('bikes',bikeId,user);
  const source=status(b.source,['catalog','custom']);
  const selected=source==='catalog'?componentCatalog.find(c=>c.name===b.catalogName):null;
  if(source==='catalog'&&!selected)fail(400,'Select a component from the catalog');
  const name=selected?.name||text(b.name,'Component name',70,{min:2});
  const icon=selected?.icon||'settings';
  const intervalDays=integer(b.intervalDays,'Service interval (days)',1,3650);
  const notes=text(b.notes??'','Component notes',300,{min:0});
  const last=b.lastServiceDate===null||b.lastServiceDate===undefined||b.lastServiceDate===''?null:date(b.lastServiceDate,'Last service date');
  if(last&&last>today())fail(400,'Last service date cannot be in the future');
  if(last&&b.dueDate)fail(400,'Use last service date or next due date, not both');
  const due=last?later(intervalDays,last):date(b.dueDate,'Next due date');
  const count=await stmt('SELECT COUNT(*)::int AS count FROM components WHERE bike_id=? AND user_id=?').get(bikeId,user.id);
  if(count.count>=150)fail(400,'This motorcycle has reached the component limit');
  const bike=await stmt('SELECT odometer FROM bikes WHERE id=? AND user_id=?').get(bikeId,user.id);
  const id=randomUUID();
  try{
   await stmt('INSERT INTO components(id,user_id,bike_id,name,icon,interval,last_km,next_km,due_date,interval_days,last_service_date,source,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,user.id,bikeId,name,icon,1,bike.odometer,bike.odometer+1,due,intervalDays,last,source,notes);
  }catch(err){if(err.code==='23505')fail(409,'This motorcycle already has an active component with that name');throw err;}
  return send(res,201,{id,dueDate:due});
 }
 let componentMatch=path.match(/^\/api\/components\/([^/]+)$/);
 if(componentMatch&&method==='PATCH'){
  await requireUser(req,'rider');
  const id=componentMatch[1],old=await stmt('SELECT id,name,source,interval_days,last_service_date,due_date,notes,archived_at FROM components WHERE id=? AND user_id=?').get(id,user.id);
  if(!old)fail(404,'Component not found');
  if(old.archived_at)fail(409,'Restore this component before editing it');
  const b=await body(req);
  // Preserve compatibility with legacy mileage-only maintenance interval updates.
  if(b.intervalDays===undefined&&b.interval!==undefined){
   const interval=integer(b.interval,'Interval',1,1000000),last=integer(b.lastKm,'Last serviced mileage'),due=date(b.dueDate,'Due date');
   await stmt('UPDATE components SET interval=?,last_km=?,next_km=?,due_date=? WHERE id=? AND user_id=?').run(interval,last,last+interval,due,id,user.id);
   return send(res,200,{ok:true});
  }
  const intervalDays=integer(b.intervalDays??old.interval_days,'Service interval (days)',1,3650);
  const name=b.name===undefined?old.name:text(b.name,'Component name',70,{min:2});
  if(old.source!=='custom'&&name!==old.name)fail(400,'Only custom component names can be changed');
  const notes=b.notes===undefined?old.notes:text(b.notes,'Component notes',300,{min:0});
  const last=b.lastServiceDate===undefined?old.last_service_date:
    b.lastServiceDate===null||b.lastServiceDate===''?null:date(b.lastServiceDate,'Last service date');
  if(last&&last>today())fail(400,'Last service date cannot be in the future');
  if(last&&b.dueDate)fail(400,'Use last service date or next due date, not both');
  const due=last?later(intervalDays,last):(b.dueDate?date(b.dueDate,'Next due date'):old.due_date);
  try{
   await stmt('UPDATE components SET name=?,notes=?,interval_days=?,last_service_date=?,due_date=? WHERE id=? AND user_id=?')
    .run(name,notes,intervalDays,last,due,id,user.id);
  }catch(err){if(err.code==='23505')fail(409,'This motorcycle already has an active component with that name');throw err;}
  return send(res,200,{ok:true,dueDate:due});
 }
 const archivedMatch=path.match(/^\/api\/components\/([^/]+)\/archive$/);
 if(archivedMatch&&method==='PATCH'){
  await requireUser(req,'rider');
  const b=await body(req);if(typeof b.archived!=='boolean')fail(400,'Archived must be true or false');
  try{
   const result=await stmt('UPDATE components SET archived_at=CASE WHEN ? THEN NOW() ELSE NULL END WHERE id=? AND user_id=? RETURNING id').get(b.archived,archivedMatch[1],user.id);
   if(!result)fail(404,'Component not found');
  }catch(err){if(err.code==='23505')fail(409,'An active component with this name already exists. Rename or archive the other component first');throw err;}
  return send(res,200,{ok:true,archived:b.archived});
 }
 if(componentMatch&&method==='DELETE'){
  await requireUser(req,'rider');
  // services.component_id uses ON DELETE SET NULL, keeping all historical work/expenses intact.
  const result=await stmt('DELETE FROM components WHERE id=? AND user_id=? RETURNING id').get(componentMatch[1],user.id);
  if(!result)fail(404,'Component not found');
  return send(res,200,{ok:true,notice:'Service history has been preserved'});
 }
 if(path==='/api/services'&&method==='GET'){await requireUser(req,'rider');return send(res,200,{services:await serviceRows(user.id)});}
 if(path==='/api/services'&&method==='POST'){
  await requireUser(req,'rider');const b=await body(req);await requireOwn('bikes',b.bikeId,user);
  const selectedId=b.componentId===null||b.componentId===undefined||b.componentId===''?null:text(b.componentId,'Component ID',64);
  const requestedType=b.type===undefined||b.type===null?null:text(b.type,'Service type',100);
  if(!requestedType&&!selectedId)fail(400,'Select a component or enter a service type');
  const d=date(b.date),mileage=b.mileage===undefined?null:integer(b.mileage,'Mileage'),cost=money(b.cost),shop=text(b.shop,'Workshop',70),notes=text(b.notes||'','Notes',300,{min:0});
  if(d>today())fail(400,'Completed service date cannot be in the future');
  const id=randomUUID();
  await transaction(async tx=>{
   const current=await tx('SELECT odometer FROM bikes WHERE id=? AND user_id=? FOR UPDATE').get(b.bikeId,user.id);
   if(!current)fail(404,'Record not found');
   const recordedMileage=mileage??current.odometer;
   if(mileage!==null&&mileage>current.odometer+100000)fail(400,'Service mileage exceeds expected range');
   let component;
   if(selectedId){
    component=await tx('SELECT id,name,interval,interval_days,last_service_date FROM components WHERE id=? AND bike_id=? AND user_id=? AND archived_at IS NULL FOR UPDATE')
     .get(selectedId,b.bikeId,user.id);
    if(!component)fail(404,'Active component not found for this motorcycle');
   }else if(requestedType!=='Other Service'){
    // Old clients that submit a name instead of a component ID still work.
    component=await tx('SELECT id,name,interval,interval_days,last_service_date FROM components WHERE bike_id=? AND user_id=? AND name=? AND archived_at IS NULL FOR UPDATE')
     .get(b.bikeId,user.id,requestedType);
   }
   const type=component?.name||requestedType;
   await tx('INSERT INTO services(id,user_id,bike_id,component_id,type,date,mileage,cost,shop,notes) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id,user.id,b.bikeId,component?.id||null,type,d,recordedMileage,cost,shop,notes);
   if(mileage!==null&&mileage>current.odometer)await tx('UPDATE bikes SET odometer=?,updated=? WHERE id=? AND user_id=?').run(mileage,today(),b.bikeId,user.id);
   if(component&&(!component.last_service_date||d>=component.last_service_date)){
    const due=later(component.interval_days,d);
    await tx('UPDATE components SET last_km=?,next_km=?,last_service_date=?,due_date=? WHERE id=? AND user_id=?')
     .run(recordedMileage,recordedMileage+component.interval,d,due,component.id,user.id);
   }
  });
  return send(res,201,{id});
 }
 m=path.match(/^\/api\/services\/([^/]+)$/);
 if(m&&method==='DELETE'){await requireUser(req,'rider');await requireOwn('services',m[1],user);await stmt('DELETE FROM services WHERE id=? AND user_id=?').run(m[1],user.id);return send(res,200,{ok:true,notice:'Deleting history does not undo a previously reset maintenance interval'});}
 if(path==='/api/customers'&&method==='GET'){await requireUser(req,'shop');return send(res,200,{customers:await customerRows(user.id)});}
 if(path==='/api/customers'&&method==='POST'){
  await requireUser(req,'shop');const b=await body(req),id=randomUUID(),name=text(b.name,'Customer name',80),contact=text(b.contact,'Contact',100),motorcycle=text(b.motorcycle,'Motorcycle',80),odometer=integer(b.odometer,'Odometer');
  await stmt('INSERT INTO customers(id,user_id,name,contact,motorcycle,odometer,last_visit) VALUES(?,?,?,?,?,?,?)').run(id,user.id,name,contact,motorcycle,odometer,today());return send(res,201,{id});
 }
 m=path.match(/^\/api\/customers\/([^/]+)$/);
 if(m){await requireUser(req,'shop');await requireOwn('customers',m[1],user);
  if(method==='PATCH'){const b=await body(req);await stmt('UPDATE customers SET name=?,contact=?,motorcycle=?,odometer=? WHERE id=? AND user_id=?').run(text(b.name,'Name',80),text(b.contact,'Contact',100),text(b.motorcycle,'Motorcycle',80),integer(b.odometer,'Odometer'),m[1],user.id);return send(res,200,{ok:true});}
  if(method==='DELETE'){await stmt('DELETE FROM customers WHERE id=? AND user_id=?').run(m[1],user.id);return send(res,200,{ok:true});}
 }
 if(path==='/api/jobs'&&method==='GET'){await requireUser(req,'shop');return send(res,200,{jobs:await jobRows(user.id)});}
 if(path==='/api/jobs'&&method==='POST'){
  await requireUser(req,'shop');const b=await body(req),customerId=await requireCustomer(b.customerId,user),id=randomUUID();
  await stmt('INSERT INTO jobs(id,user_id,customer_id,service,date,status,cost) VALUES(?,?,?,?,?,?,?)').run(id,user.id,customerId,text(b.service,'Service',100),date(b.date),status(b.status||'Pending',['Pending','In Progress','Completed']),money(b.cost));return send(res,201,{id});
 }
 m=path.match(/^\/api\/jobs\/([^/]+)$/);
 if(m){await requireUser(req,'shop');await requireOwn('jobs',m[1],user);
  if(method==='PATCH'){
   const b=await body(req),old=await stmt('SELECT customer_id AS "customerId",service,date,status,cost FROM jobs WHERE id=? AND user_id=?').get(m[1],user.id);
   const to=status(b.status??old.status,['Pending','In Progress','Completed']);
   if(['Pending','In Progress','Completed'].indexOf(to)<['Pending','In Progress','Completed'].indexOf(old.status))fail(400,'Job status cannot move backwards');
   const customerId=await requireCustomer(b.customerId??old.customerId,user);
   await stmt('UPDATE jobs SET customer_id=?,service=?,date=?,cost=?,status=? WHERE id=? AND user_id=?').run(customerId,text(b.service??old.service,'Service',100),date(b.date??old.date),money(b.cost??old.cost),to,m[1],user.id);
   return send(res,200,{ok:true});
  }
  if(method==='DELETE'){await stmt('DELETE FROM jobs WHERE id=? AND user_id=?').run(m[1],user.id);return send(res,200,{ok:true});}
 }
 // Phase 4.3: rider appointment requests, separated from shop-owned manual appointments.
 if(path==='/api/rider-appointments'&&method==='GET'){
  return send(res,200,{appointments:await riderAppointmentRows(user)});
 }
 if(path==='/api/rider-appointments'&&method==='POST'){
  await requireUser(req,'rider');
  const b=await body(req),shopId=text(b.shopId,'Workshop ID',64),bikeId=text(b.bikeId,'Motorcycle ID',64);
  const service=text(b.service,'Requested service',100,{min:2}),d=date(b.date),t=time(b.time),
   notes=text(b.notes??'','Booking notes',300,{min:0});
  if(d<today())fail(400,'Choose today or a future appointment date');
  if(d===today()){
   const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
   if(t<=parts)fail(400,'Choose a future appointment time in Philippine time');
  }
  const id=randomUUID();
  try{
   await transaction(async tx=>{
    const link=await tx('SELECT id FROM account_connections WHERE rider_id=? AND shop_id=? AND status=? FOR SHARE').get(user.id,shopId,'accepted');
    if(!link)fail(403,'Connect with this workshop and get approval before requesting an appointment');
    const bike=await tx('SELECT model FROM bikes WHERE id=? AND user_id=? FOR SHARE').get(bikeId,user.id);
    if(!bike)fail(404,'Motorcycle not found');
    const pending=await tx('SELECT COUNT(*)::int AS count FROM rider_appointment_requests WHERE rider_id=? AND status=?').get(user.id,'Pending');
    if(pending.count>=20)fail(429,'You have reached the limit of 20 pending appointment requests');
    await tx('INSERT INTO rider_appointment_requests(id,rider_id,shop_id,bike_id,bike_model,service,date,time,notes,status) VALUES(?,?,?,?,?,?,?,?,?,?)')
     .run(id,user.id,shopId,bikeId,bike.model,service,d,t,notes,'Pending');
   });
  }catch(err){if(err.code==='23505')fail(409,'You already have an active request for that workshop at that date and time');throw err;}
  return send(res,201,{id,status:'Pending'});
 }
 const riderBooking=path.match(/^\/api\/rider-appointments\/([^/]+)$/);
 if(riderBooking&&method==='PATCH'){
  await requireUser(req,'rider');const b=await body(req);
  if(b.status!=='Cancelled')fail(400,'Riders can only cancel pending appointments');
  const row=await stmt('UPDATE rider_appointment_requests SET status=?,updated_at=NOW() WHERE id=? AND rider_id=? AND status=? RETURNING id')
   .get('Cancelled',riderBooking[1],user.id,'Pending');
  if(!row){
   const existing=await stmt('SELECT status FROM rider_appointment_requests WHERE id=? AND rider_id=?').get(riderBooking[1],user.id);
   if(!existing)fail(404,'Appointment request not found');
   fail(409,'Only pending appointment requests can be cancelled');
  }
  return send(res,200,{ok:true,status:'Cancelled'});
 }
 if(path==='/api/appointments'&&method==='GET'){await requireUser(req,'shop');return send(res,200,{appointments:await appointmentRows(user.id)});}
 if(path==='/api/appointments'&&method==='POST'){
  await requireUser(req,'shop');const b=await body(req),customerId=await requireCustomer(b.customerId,user),id=randomUUID(),d=date(b.date),t=time(b.time);if(d<today())fail(400,'Choose today or a future appointment date');
  await stmt('INSERT INTO appointments(id,user_id,customer_id,service,date,time,status) VALUES(?,?,?,?,?,?,?)').run(id,user.id,customerId,text(b.service,'Service',100),d,t,'Pending');return send(res,201,{id});
 }
 m=path.match(/^\/api\/appointments\/([^/]+)$/);
 if(m){await requireUser(req,'shop');await requireOwn('appointments',m[1],user);
  if(method==='PATCH'){
   const b=await body(req),old=await stmt('SELECT customer_id AS "customerId",service,date,time,status FROM appointments WHERE id=? AND user_id=?').get(m[1],user.id);
   const to=status(b.status??old.status,['Pending','Confirmed','Completed','Cancelled']);
   const customerId=await requireCustomer(b.customerId??old.customerId,user);
   const d=date(b.date??old.date);if(b.date&&d<today())fail(400,'Choose today or a future appointment date');
   await stmt('UPDATE appointments SET customer_id=?,service=?,date=?,time=?,status=? WHERE id=? AND user_id=?').run(customerId,text(b.service??old.service,'Service',100),d,time(b.time??old.time),to,m[1],user.id);
   return send(res,200,{ok:true});
  }
  if(method==='DELETE'){await stmt('DELETE FROM appointments WHERE id=? AND user_id=?').run(m[1],user.id);return send(res,200,{ok:true});}
 }
 if(path==='/api/notifications'&&method==='GET'){
  if(user.role==='shop'){const pending=(await appointmentRows(user.id)).filter(x=>x.status==='Pending');const requests=(await connectionRows(user)).filter(x=>x.status==='pending');const riderRequests=(await riderAppointmentRows(user)).filter(x=>x.status==='Pending');return send(res,200,{notifications:[...pending.map(x=>({id:x.id,type:'appointment',message:`Appointment ${x.service} awaiting confirmation`,date:x.date})),...requests.map(x=>({id:x.id,type:'connection',message:`${x.riderName} requested to connect with your workshop`})),...riderRequests.map(x=>({id:x.id,type:'rider-appointment',message:`${x.riderName} requested ${x.service} on ${x.date} at ${x.time}`,date:x.date}))]});}
  const items=[];const bikes=await bikeRows(user.id);for(const b of bikes)for(const c of (await componentRows(user.id)).filter(c=>c.bikeId===b.id&&!c.archived)){const days=Math.round((Date.parse(c.dueDate+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000);if(days<=14)items.push({id:c.id,bikeId:b.id,type:days<0?'overdue':'soon',message:`${c.name} on ${b.model} requires attention`,remainingDays:days,dueDate:c.dueDate});}
  return send(res,200,{notifications:items});
 }
 if(path==='/api/reports'&&method==='GET'){
  if(user.role==='shop'){const jobs=await jobRows(user.id),done=jobs.filter(j=>j.status==='Completed'),value=done.reduce((sum,j)=>sum+j.cost,0);return send(res,200,{role:'shop',customers:(await customerRows(user.id)).length,totalJobs:jobs.length,completedJobs:done.length,openJobs:jobs.length-done.length,appointments:(await appointmentRows(user.id)).length,completedJobValue:value});}
  const services=await serviceRows(user.id);return send(res,200,{role:'rider',motorcycles:(await bikeRows(user.id)).length,services:services.length,totalServiceCost:services.reduce((n,s)=>n+s.cost,0)});
 }
 fail(404,'API endpoint not found');
}
function serveFile(req,res,p){const file=files[p];if(!file){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not Found');}const fname=path.join(base,file);const mime=mimes[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});fs.createReadStream(fname).pipe(res);}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
 try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);await ready;if(url.pathname.startsWith('/api/'))await api(req,res,url);else if(req.method==='GET'||req.method==='HEAD')serveFile(req,res,url.pathname);else fail(405,'Method not allowed');}
 catch(e){const code=e.status||500;if(code===500)console.error('[MotoKare API]',e);if(!res.headersSent)send(res,code,{error:code===500?'Internal server error':e.message});else res.end();}
});
if(require.main===module){ready.then(()=>server.listen(PORT,HOST,()=>console.log(`MotoKare ready at http://${HOST}:${PORT} (PostgreSQL)`))).catch(err=>{console.error('Database initialization failed:',err);pool.end().finally(()=>process.exit(1));});}
module.exports={server,ready,pool};