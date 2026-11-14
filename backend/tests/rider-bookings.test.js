'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
process.env.PG_SCHEMA='mk_bookings_'+randomBytes(6).toString('hex');
process.env.HOST='127.0.0.1';
const {server,ready,pool}=require('../server');
const shift=days=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const parts=Object.fromEntries(p.map(x=>[x.type,x.value]));
 const d=new Date(parts.year+'-'+parts.month+'-'+parts.day+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
};
let origin;
async function call(method,path,payload,cookie){
 const res=await fetch(origin+path,{method,headers:{
  ...(payload===undefined?{}:{'Content-Type':'application/json'}),
  ...(cookie?{Cookie:cookie}:{}),'X-MotoKare-Client':'web'
 },...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
test('Phase 4.3 rider booking requests require accepted connection and keep existing shop appointments intact',async t=>{
 await ready;
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  await pool.query('DROP SCHEMA IF EXISTS "'+process.env.PG_SCHEMA+'" CASCADE');
  await pool.end();
 });
 const register=(role,name,email,shopName)=>call('POST','/api/auth/register',
  {role,fullName:name,email,password:'aSecurePassphrase1234!',...(shopName?{shopName}:{})});
 const r=await register('rider','Rider One','bk-r1@example.test');
 const r2=await register('rider','Rider Two','bk-r2@example.test');
 const s=await register('shop','Shop Owner One','bk-s1@example.test','Davao Test Garage');
 const s2=await register('shop','Shop Owner Two','bk-s2@example.test','Other Workshop');
 for(const x of [r,r2,s,s2])assert.equal(x.status,201,JSON.stringify(x.data));
 const rider=r.cookie,other=r2.cookie,shop=s.cookie,otherShop=s2.cookie,shopId=s.data.user.id;
 const bike=await call('POST','/api/bikes',{model:'Honda Click 125i',year:2025},rider);
 const bike2=await call('POST','/api/bikes',{model:'Yamaha Mio',year:2025},other);
 assert.equal(bike.status,201);assert.equal(bike2.status,201);
 const day=shift(2),time='09:30';
 const input={shopId,bikeId:bike.data.id,service:'Oil change and filter check',date:day,time,notes:'Please check oil leak'};
 assert.equal((await call('GET','/api/rider-appointments')).status,401);
 assert.equal((await call('GET','/api/rider-appointments',undefined,rider)).status,200);
 assert.equal((await call('POST','/api/rider-appointments',input,shop)).status,403);
 assert.equal((await call('POST','/api/rider-appointments',input,rider)).status,403,'No connection: reject');
 let connection=await call('POST','/api/connections',{shopId},rider);
 assert.equal(connection.status,201);
 assert.equal((await call('POST','/api/rider-appointments',input,rider)).status,403,'Pending connection: reject');
 assert.equal((await call('PATCH','/api/connections/'+connection.data.id,{status:'accepted'},shop)).status,200);
 assert.equal((await call('POST','/api/rider-appointments',{...input,bikeId:bike2.data.id},rider)).status,404,'Reject another rider motorcycle');
 assert.equal((await call('POST','/api/rider-appointments',{...input,shopId:s2.data.user.id},rider)).status,403,'Only connected shops');
 assert.equal((await call('POST','/api/rider-appointments',{...input,date:shift(-1)},rider)).status,400,'Reject past date');
 assert.equal((await call('POST','/api/rider-appointments',{...input,date:'2026-02-31'},rider)).status,400,'Reject impossible date');
 assert.equal((await call('POST','/api/rider-appointments',{...input,time:'27:90'},rider)).status,400);
 assert.equal((await call('POST','/api/rider-appointments',{...input,service:'a'},rider)).status,400);
 assert.equal((await call('POST','/api/rider-appointments',{...input,notes:'x'.repeat(301)},rider)).status,400);
 const request=await call('POST','/api/rider-appointments',input,rider);
 assert.equal(request.status,201,JSON.stringify(request.data));assert.equal(request.data.status,'Pending');
 const bookingId=request.data.id;
 assert.equal((await call('POST','/api/rider-appointments',input,rider)).status,409,'Duplicate active rider/shop/date/time blocked');
 const riderRows=(await call('GET','/api/rider-appointments',undefined,rider)).data.appointments;
 const shopRows=(await call('GET','/api/rider-appointments',undefined,shop)).data.appointments;
 assert.equal(riderRows.length,1);assert.equal(shopRows.length,1);
 assert.equal(riderRows[0].id,bookingId);assert.equal(shopRows[0].id,bookingId);
 assert.equal(shopRows[0].riderName,'Rider One');
 assert.equal(shopRows[0].bikeModel,'Honda Click 125i');
 assert.equal(shopRows[0].service,input.service);
 assert.equal(shopRows[0].notes,input.notes);
 assert.equal(shopRows[0].status,'Pending');
 assert.equal((await call('GET','/api/rider-appointments',undefined,other)).data.appointments.length,0);
 assert.equal((await call('GET','/api/rider-appointments',undefined,otherShop)).data.appointments.length,0);
 assert.equal((await call('GET','/api/bootstrap',undefined,shop)).data.riderAppointments.length,1);
 assert.equal((await call('GET','/api/bootstrap',undefined,other)).data.riderAppointments.length,0);
 const exposed=JSON.stringify(shopRows);
 assert.ok(!exposed.includes('bk-r1@example.test'));
 assert.ok(!exposed.includes('password'));
 assert.ok(!exposed.includes('odometer'));
 assert.ok(!exposed.includes('lastServiceDate'));
 const notices=(await call('GET','/api/notifications',undefined,shop)).data.notifications;
 assert.ok(notices.some(x=>x.id===bookingId&&x.type==='rider-appointment'));
 assert.equal((await call('PATCH','/api/rider-appointments/'+bookingId,{status:'Cancelled'},other)).status,404);
 assert.equal((await call('PATCH','/api/rider-appointments/'+bookingId,{status:'Cancelled'},shop)).status,409,'Workshops cannot cancel unreviewed pending requests; they must confirm or decline');
 assert.equal((await call('PATCH','/api/rider-appointments/'+bookingId,{status:'Confirmed'},rider)).status,400);
 const cancel=await call('PATCH','/api/rider-appointments/'+bookingId,{status:'Cancelled'},rider);
 assert.equal(cancel.status,200);assert.equal(cancel.data.status,'Cancelled');
 assert.equal((await call('PATCH','/api/rider-appointments/'+bookingId,{status:'Cancelled'},rider)).status,409);
 assert.equal((await call('GET','/api/notifications',undefined,shop)).data.notifications.some(x=>x.id===bookingId),false);
 assert.equal((await call('GET','/api/rider-appointments',undefined,shop)).data.appointments[0].status,'Cancelled');
 const retry=await call('POST','/api/rider-appointments',input,rider);
 assert.equal(retry.status,201,'A cancelled slot can be requested again');
 assert.equal((await call('DELETE','/api/connections/'+connection.data.id,undefined,rider)).status,200);
 assert.equal((await call('POST','/api/rider-appointments',{...input,time:'10:30'},rider)).status,403,'Disconnect prevents new booking');
 assert.equal((await call('GET','/api/rider-appointments',undefined,shop)).data.appointments.length,2,'Disconnect preserves history');
 assert.equal((await call('DELETE','/api/bikes/'+bike.data.id,undefined,rider)).status,200);
 const old=(await call('GET','/api/rider-appointments',undefined,rider)).data.appointments;
 assert.equal(old.length,2);
 assert.equal(old[0].bikeId,null,'Bike deletion unlinks snapshots');
 assert.equal(old[0].bikeModel,'Honda Click 125i','Bike-model snapshot retained');
 // Legacy manual shop appointments still require a shop customer and are independent.
 const customer=await call('POST','/api/customers',{name:'Walk In Client',contact:'shop desk',motorcycle:'Kawasaki',odometer:1000},shop);
 assert.equal(customer.status,201);
 const manual=await call('POST','/api/appointments',{customerId:customer.data.id,service:'Tune-up',date:day,time:'11:30'},shop);
 assert.equal(manual.status,201);
 assert.equal((await call('GET','/api/appointments',undefined,shop)).data.appointments.length,1);
 assert.equal((await call('GET','/api/rider-appointments',undefined,shop)).data.appointments.length,2);
});
