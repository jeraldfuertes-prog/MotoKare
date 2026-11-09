'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
process.env.PG_SCHEMA='mk_components_'+crypto.randomBytes(6).toString('hex');
process.env.HOST='127.0.0.1';
const {server,ready,pool}=require('../server');

function shift(days){
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const o=Object.fromEntries(p.map(x=>[x.type,x.value]));
 const d=new Date(o.year+'-'+o.month+'-'+o.day+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
let base;
async function call(method,url,data,cookie){
 const response=await fetch(base+url,{method,headers:{
  ...(cookie?{cookie}:{}),
  ...(data===undefined?{}:{'content-type':'application/json'}),
  'x-motokare-client':'web'
 },...(data===undefined?{}:{body:JSON.stringify(data)})});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
test('component catalog and custom lifecycle never lose historical maintenance',async t=>{
 await ready;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  await pool.query('DROP SCHEMA IF EXISTS "'+process.env.PG_SCHEMA+'" CASCADE');
  await pool.end();
 });
 const user=(role,fullName,email,shopName)=>({role,fullName,email,password:'veryStrongPassphrase!123',...(shopName?{shopName}:{})});
 let res=await call('POST','/api/auth/register',user('rider','First Rider','rider-comp-1@test.com'));
 assert.equal(res.status,201);const r1=res.cookie;
 res=await call('POST','/api/auth/register',user('rider','Second Rider','rider-comp-2@test.com'));
 assert.equal(res.status,201);const r2=res.cookie;
 res=await call('POST','/api/auth/register',user('shop','Test Owner','shop-comp@test.com','Component Test Garage'));
 assert.equal(res.status,201);const shop=res.cookie;
 res=await call('POST','/api/bikes',{model:'Test Scooter',year:2024},r1);
 assert.equal(res.status,201);const bikeId=res.data.id;
 const initial=(await call('GET','/api/components',undefined,r1)).data.components;
 assert.equal(initial.length,6);
 assert.ok(initial.every(c=>c.source==='default'&&!c.archived));
 assert.equal((await call('GET','/api/component-catalog',undefined,shop)).status,403);
 assert.equal((await call('GET','/api/component-catalog')).status,401);
 const catalog=(await call('GET','/api/component-catalog',undefined,r1)).data.catalog;
 assert.ok(catalog.find(c=>c.name==='Spark Plug'));
 assert.ok(catalog.find(c=>c.name==='Engine Oil'));
 const create=(source,attributes,cookie=r1)=>call('POST','/api/components',{bikeId,source,...attributes},cookie);
 assert.equal((await create('custom',{name:'No Access',intervalDays:30,dueDate:shift(30)},shop)).status,403);
 assert.equal((await create('custom',{name:'Not My Bike',intervalDays:30,dueDate:shift(30)},r2)).status,404);
 assert.equal((await create('catalog',{catalogName:'Unknown Catalog',intervalDays:30,dueDate:shift(30)})).status,400);
 assert.equal((await create('catalog',{catalogName:'Engine Oil',intervalDays:30,dueDate:shift(30)})).status,409);
 assert.equal((await create('custom',{name:'Too Short',intervalDays:0,dueDate:shift(20)})).status,400);
 assert.equal((await create('custom',{name:'Missing Due Date',intervalDays:30})).status,400);
 assert.equal((await create('custom',{name:'Future Service',intervalDays:30,lastServiceDate:shift(1)})).status,400);
 assert.equal((await create('custom',{name:'Two Dates',intervalDays:30,lastServiceDate:shift(-1),dueDate:shift(29)})).status,400);
 const spark=await create('catalog',{catalogName:'Spark Plug',intervalDays:45,dueDate:shift(8),notes:'Owner confirmed schedule'});
 assert.equal(spark.status,201,JSON.stringify(spark.data));
 const sparkId=spark.data.id;
 assert.equal((await create('catalog',{catalogName:'Spark Plug',intervalDays:45,dueDate:shift(8)})).status,409);
 const custom=await create('custom',{name:'Extra Horn Inspection',intervalDays:15,lastServiceDate:shift(-10),notes:'Check wiring'});
 assert.equal(custom.status,201,JSON.stringify(custom.data));
 const customId=custom.data.id;
 assert.equal(custom.data.dueDate,shift(5));
 let components=(await call('GET','/api/components',undefined,r1)).data.components;
 assert.equal(components.length,8);
 assert.equal(components.find(c=>c.id===sparkId).lastServiceDate,null);
 assert.equal(components.find(c=>c.id===sparkId).source,'catalog');
 assert.equal(components.find(c=>c.id===customId).notes,'Check wiring');
 assert.equal((await create('custom',{name:'EXTRA HORN INSPECTION',intervalDays:30,dueDate:shift(30)})).status,409);
 assert.equal((await call('PATCH','/api/components/'+sparkId,{name:'Renamed Spark',intervalDays:45},r1)).status,400);
 assert.equal((await call('PATCH','/api/components/'+customId,{name:'Horn v2',intervalDays:20,lastServiceDate:shift(-8)},r2)).status,404);
 const edited=await call('PATCH','/api/components/'+customId,{name:'Horn v2',intervalDays:20,lastServiceDate:shift(-8),notes:'Revised'},r1);
 assert.equal(edited.status,200,JSON.stringify(edited.data));
 assert.equal(edited.data.dueDate,shift(12));
 const service=await call('POST','/api/services',{bikeId,componentId:customId,date:shift(-1),cost:125,shop:'Home Workshop',notes:'Horn inspected'},r1);
 assert.equal(service.status,201,JSON.stringify(service.data));
 let entry=(await call('GET','/api/services',undefined,r1)).data.services.find(s=>s.id===service.data.id);
 assert.equal(entry.componentId,customId);
 assert.equal(entry.type,'Horn v2');
 assert.equal((await call('GET','/api/components',undefined,r1)).data.components.find(c=>c.id===customId).dueDate,shift(19));
 assert.equal((await call('POST','/api/services',{bikeId,componentId:customId,date:shift(1),cost:0,shop:'Test'},r1)).status,400);
 assert.equal((await call('POST','/api/services',{bikeId,componentId:customId,date:shift(0),cost:0,shop:'Test'},r2)).status,404);
 assert.equal((await call('PATCH','/api/components/'+customId,{name:'New Horn Name',intervalDays:20,lastServiceDate:shift(-1)},r1)).status,200);
 entry=(await call('GET','/api/services',undefined,r1)).data.services.find(s=>s.id===service.data.id);
 assert.equal(entry.type,'Horn v2','Renaming a component must not rewrite historical service names');
 assert.equal((await call('PATCH','/api/components/'+sparkId+'/archive',{archived:'yes'},r1)).status,400);
 assert.equal((await call('PATCH','/api/components/'+sparkId+'/archive',{archived:true},r2)).status,404);
 assert.equal((await call('PATCH','/api/components/'+sparkId,{intervalDays:5,lastServiceDate:null,dueDate:shift(-1)},r1)).status,200);
 assert.ok((await call('GET','/api/notifications',undefined,r1)).data.notifications.some(n=>n.id===sparkId));
 assert.equal((await call('PATCH','/api/components/'+sparkId+'/archive',{archived:true},r1)).status,200);
 assert.equal((await call('GET','/api/components',undefined,r1)).data.components.find(c=>c.id===sparkId).archived,true);
 assert.ok(!(await call('GET','/api/notifications',undefined,r1)).data.notifications.some(n=>n.id===sparkId));
 assert.equal((await call('PATCH','/api/components/'+sparkId,{intervalDays:30,lastServiceDate:shift(-1)},r1)).status,409);
 assert.equal((await call('POST','/api/services',{bikeId,componentId:sparkId,date:shift(0),cost:5,shop:'Test'},r1)).status,404);
 const sameName=await create('custom',{name:'Spark Plug',intervalDays:45,dueDate:shift(45)});
 assert.equal(sameName.status,201,JSON.stringify(sameName.data));
 assert.equal((await call('PATCH','/api/components/'+sparkId+'/archive',{archived:false},r1)).status,409);
 assert.equal((await call('DELETE','/api/components/'+sameName.data.id,undefined,r1)).status,200);
 assert.equal((await call('PATCH','/api/components/'+sparkId+'/archive',{archived:false},r1)).status,200);
 assert.ok((await call('GET','/api/notifications',undefined,r1)).data.notifications.some(n=>n.id===sparkId));
 assert.equal((await call('DELETE','/api/components/'+customId,undefined,r2)).status,404);
 assert.equal((await call('DELETE','/api/components/'+customId,undefined,r1)).status,200);
 assert.ok(!(await call('GET','/api/components',undefined,r1)).data.components.some(c=>c.id===customId));
 entry=(await call('GET','/api/services',undefined,r1)).data.services.find(s=>s.id===service.data.id);
 assert.equal(entry.type,'Horn v2');
 assert.equal(entry.componentId,null,'Permanent deletion should preserve service and unlink component ID');
 assert.equal((await call('GET','/api/reports',undefined,r1)).data.totalServiceCost,125);
 const originalId=initial[0].id;
 assert.equal((await call('PATCH','/api/components/'+originalId+'/archive',{archived:true},r1)).status,200);
 assert.equal((await call('PATCH','/api/components/'+originalId+'/archive',{archived:false},r1)).status,200);
});
