'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
process.env.PG_SCHEMA='mk_review_'+randomBytes(6).toString('hex');
process.env.HOST='127.0.0.1';
const {server,ready,pool}=require('../server');

function shift(days){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 const d=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
}
let base;
async function call(method,url,payload,cookie){
 const response=await fetch(base+url,{method,headers:{
  ...(cookie?{Cookie:cookie}:{}),
  ...(payload===undefined?{}:{'Content-Type':'application/json'}),
  'X-MotoKare-Client':'web'
 },...(payload===undefined?{}:{body:JSON.stringify(payload)})});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
test('Phase 4.4: workshop review, status privacy, concurrency, slot conflicts and completion',async t=>{
 await ready;
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{
  await new Promise(done=>server.close(done));
  await pool.query('DROP SCHEMA IF EXISTS "'+process.env.PG_SCHEMA+'" CASCADE');
  await pool.end();
 });
 const reg=(role,fullName,email,shopName)=>call('POST','/api/auth/register',{
  role,fullName,email,password:'strongEnoughPassword123!A',...(shopName?{shopName}:{})
 });
 const [r1,r2,s1,s2]=await Promise.all([
  reg('rider','Booking Rider One','approve-rider1@demo.test'),
  reg('rider','Booking Rider Two','approve-rider2@demo.test'),
  reg('shop','Workshop Manager','approve-shop1@demo.test','Approved Garage'),
  reg('shop','Another Manager','approve-shop2@demo.test','Second Garage'),
 ]);
 for(const x of [r1,r2,s1,s2])assert.equal(x.status,201,JSON.stringify(x.data));
 const rider1=r1.cookie,rider2=r2.cookie,shop=s1.cookie,shop2=s2.cookie,shopId=s1.data.user.id;
 const b1=await call('POST','/api/bikes',{model:'Honda Click',year:2024},rider1);
 const b2=await call('POST','/api/bikes',{model:'Yamaha Mio',year:2025},rider2);
 assert.equal(b1.status,201);assert.equal(b2.status,201);
 const connect=async cookie=>{
  const link=await call('POST','/api/connections',{shopId},cookie);
  assert.equal(link.status,201);
  assert.equal((await call('PATCH','/api/connections/'+link.data.id,{status:'accepted'},shop)).status,200);
  return link.data.id;
 };
 const link1=await connect(rider1),link2=await connect(rider2);
 const make=(bikeId,date,time,service='Oil Change')=>({shopId,bikeId,date,time,service,notes:'Check oil level'});
 const date=shift(3),sharedTime='10:30';
 const first=await call('POST','/api/rider-appointments',make(b1.data.id,date,sharedTime),rider1);
 const second=await call('POST','/api/rider-appointments',make(b2.data.id,date,sharedTime),rider2);
 assert.equal(first.status,201);assert.equal(second.status,201);
 const url1='/api/rider-appointments/'+first.data.id,url2='/api/rider-appointments/'+second.data.id;
 assert.equal((await call('PATCH',url1,{status:'Confirmed',reviewNote:'Not yours'},shop2)).status,404,'Other workshops cannot review');
 assert.equal((await call('PATCH',url1,{status:'Confirmed'},rider2)).status,400,'Riders cannot confirm requests');
 assert.equal((await call('PATCH',url1,{status:'Completed'},shop)).status,409,'Pending cannot be marked completed');
 assert.equal((await call('PATCH',url1,{status:'Confirmed',reviewNote:'x'.repeat(251)},shop)).status,400);
 // Concurrent approvals serialize through the shop lock and a confirmed-slot unique index.
 const replies=await Promise.all([
  call('PATCH',url1,{status:'Confirmed',reviewNote:'Your slot is approved'},shop),
  call('PATCH',url2,{status:'Confirmed',reviewNote:'Your slot is approved'},shop),
 ]);
 assert.deepEqual(replies.map(x=>x.status).sort((a,b)=>a-b),[200,409],'Only one same-time confirmation may succeed');
 const firstWins=replies[0].status===200;
 const winnerUrl=firstWins?url1:url2,loserUrl=firstWins?url2:url1;
 const winnerRider=firstWins?rider1:rider2,loserRider=firstWins?rider2:rider1;
 const winnerId=firstWins?first.data.id:second.data.id;
 const loserId=firstWins?second.data.id:first.data.id;
 const winnerRows=(await call('GET','/api/rider-appointments',undefined,winnerRider)).data.appointments;
 assert.equal(winnerRows[0].status,'Confirmed');
 assert.equal(winnerRows[0].reviewNote,'Your slot is approved');
 assert.ok(winnerRows[0].reviewedAt);
 assert.equal((await call('GET','/api/rider-appointments',undefined,loserRider)).data.appointments[0].status,'Pending');
 assert.equal((await call('PATCH',winnerUrl,{status:'Confirmed'},shop)).status,409,'Cannot approve twice');
 assert.equal((await call('PATCH',winnerUrl,{status:'Declined'},shop)).status,409,'Cannot decline confirmed request');
 assert.equal((await call('PATCH',winnerUrl,{status:'Completed'},shop)).status,409,'Future visit cannot be marked complete');
 assert.equal((await call('PATCH',loserUrl,{status:'Completed'},shop)).status,409,'No premature completion');
 const shopRows=(await call('GET','/api/rider-appointments',undefined,shop)).data.appointments;
 assert.equal(shopRows.filter(x=>x.status==='Confirmed').length,1);
 const notices=(await call('GET','/api/notifications',undefined,shop)).data.notifications;
 assert.equal(notices.filter(x=>x.type==='rider-appointment').length,1,'Only the pending request remains in the action queue');
 // A rider can cancel an approved appointment; then the free slot can be approved for another rider.
 assert.equal((await call('PATCH',winnerUrl,{status:'Cancelled'},winnerRider)).status,200);
 assert.equal((await call('PATCH',winnerUrl,{status:'Cancelled'},winnerRider)).status,409);
 assert.equal((await call('PATCH',winnerUrl,{status:'Completed'},shop)).status,409);
 assert.equal((await call('PATCH',loserUrl,{status:'Confirmed',reviewNote:'Now the slot is available'},shop)).status,200);
 assert.equal((await call('GET','/api/rider-appointments',undefined,loserRider)).data.appointments[0].status,'Confirmed');
 assert.equal((await call('PATCH',loserUrl,{status:'Cancelled',reviewNote:'Workshop cancelled due to closure'},shop)).status,200);
 const shopCancelled=(await call('GET','/api/rider-appointments',undefined,loserRider)).data.appointments[0];
 assert.equal(shopCancelled.status,'Cancelled');
 assert.equal(shopCancelled.reviewNote,'Workshop cancelled due to closure');
 assert.equal((await call('PATCH',loserUrl,{status:'Confirmed'},shop)).status,409);
 // Declining includes a reason visible to the right rider and is terminal.
 const declined=await call('POST','/api/rider-appointments',make(b1.data.id,shift(4),'11:00'),rider1);
 assert.equal(declined.status,201);
 const declineUrl='/api/rider-appointments/'+declined.data.id;
 assert.equal((await call('PATCH',declineUrl,{status:'Declined',reviewNote:'Please choose an afternoon slot'},shop)).status,200);
 const riderDeclined=(await call('GET','/api/rider-appointments',undefined,rider1)).data.appointments.find(x=>x.id===declined.data.id);
 assert.equal(riderDeclined.status,'Declined');
 assert.equal(riderDeclined.reviewNote,'Please choose an afternoon slot');
 assert.equal((await call('PATCH',declineUrl,{status:'Confirmed'},shop)).status,409);
 assert.equal((await call('PATCH',declineUrl,{status:'Cancelled'},rider1)).status,409);
 assert.equal((await call('GET','/api/rider-appointments',undefined,shop2)).data.appointments.length,0);
 // The manual customer appointment queue is independent but shares the exact-time conflict check.
 const customer=await call('POST','/api/customers',{name:'Walk In',contact:'shop desk',motorcycle:'Honda',odometer:1000},shop);
 assert.equal(customer.status,201);
 const manual=await call('POST','/api/appointments',{customerId:customer.data.id,service:'Wheel inspection',date:shift(5),time:'13:00'},shop);
 assert.equal(manual.status,201);
 const manualURL='/api/appointments/'+manual.data.id;
 assert.equal((await call('PATCH',manualURL,{status:'Confirmed'},shop)).status,200);
 const conflicting=await call('POST','/api/rider-appointments',make(b1.data.id,shift(5),'13:00'),rider1);
 assert.equal(conflicting.status,201);
 assert.equal((await call('PATCH','/api/rider-appointments/'+conflicting.data.id,{status:'Confirmed'},shop)).status,409);
 assert.equal((await call('PATCH','/api/rider-appointments/'+conflicting.data.id,{status:'Declined',reviewNote:'Slot already taken'},shop)).status,200);
 const booked=await call('POST','/api/rider-appointments',make(b2.data.id,shift(6),'14:00'),rider2);
 assert.equal(booked.status,201);
 assert.equal((await call('PATCH','/api/rider-appointments/'+booked.data.id,{status:'Confirmed'},shop)).status,200);
 const manualConflict=await call('POST','/api/appointments',{customerId:customer.data.id,service:'Other service',date:shift(6),time:'14:00'},shop);
 assert.equal(manualConflict.status,201);
 assert.equal((await call('PATCH','/api/appointments/'+manualConflict.data.id,{status:'Confirmed'},shop)).status,409);
 // Simulate passage of appointment date to verify Completed transition.
 await pool.query('UPDATE rider_appointment_requests SET date=$1 WHERE id=$2',[shift(-1),booked.data.id]);
 assert.equal((await call('PATCH','/api/rider-appointments/'+booked.data.id,{status:'Completed',reviewNote:'Visit finished'},shop)).status,200);
 assert.equal((await call('GET','/api/rider-appointments',undefined,rider2)).data.appointments.find(x=>x.id===booked.data.id).status,'Completed');
 assert.equal((await call('PATCH','/api/rider-appointments/'+booked.data.id,{status:'Cancelled'},rider2)).status,409);
 assert.equal((await call('PATCH','/api/rider-appointments/'+booked.data.id,{status:'Completed'},shop)).status,409);
 // Disconnecting removes permission to confirm a new pending request, but preserves history.
 const toDisconnect=await call('POST','/api/rider-appointments',make(b1.data.id,shift(7),'15:15'),rider1);
 assert.equal(toDisconnect.status,201);
 assert.equal((await call('DELETE','/api/connections/'+link1,undefined,rider1)).status,200);
 assert.equal((await call('PATCH','/api/rider-appointments/'+toDisconnect.data.id,{status:'Confirmed'},shop)).status,409);
 assert.equal((await call('PATCH','/api/rider-appointments/'+toDisconnect.data.id,{status:'Declined',reviewNote:'Please reconnect'},shop)).status,200);
 assert.equal((await call('GET','/api/rider-appointments',undefined,rider1)).data.appointments.some(x=>x.id===toDisconnect.data.id),true);
});
