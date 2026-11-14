'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
process.env.PG_SCHEMA='mk_sharing_'+randomBytes(6).toString('hex');
process.env.HOST='127.0.0.1';
const {server,ready,pool}=require('../server');
const shift=days=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const o=Object.fromEntries(p.map(x=>[x.type,x.value]));
 const d=new Date(o.year+'-'+o.month+'-'+o.day+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+days);
 return d.toISOString().slice(0,10);
};
let base;
async function call(method,url,body,cookie){
 const r=await fetch(base+url,{method,headers:{
  ...(cookie?{cookie}:{}),
  ...(body===undefined?{}:{'content-type':'application/json'}),
  'x-motokare-client':'web'
 },...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
test('Phase 4.5: explicit record sharing, rider consent, private history, import and access revocation',async t=>{
 await ready;
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{
  await new Promise(done=>server.close(done));
  await pool.query('DROP SCHEMA IF EXISTS "'+process.env.PG_SCHEMA+'" CASCADE');
  await pool.end();
 });
 const register=(role,fullName,email,shopName)=>call('POST','/api/auth/register',{
  role,fullName,email,password:'safeAndStrongPassword!123',...(shopName?{shopName}:{})
 });
 const riders=[await register('rider','First Rider','share-rider1@demo.test'),await register('rider','Second Rider','share-rider2@demo.test')];
 const shops=[await register('shop','First Shop Owner','share-shop1@demo.test','Shared Service Garage'),await register('shop','Second Shop Owner','share-shop2@demo.test','Private Repair Works')];
 for(const x of [...riders,...shops])assert.equal(x.status,201,JSON.stringify(x.data));
 const rider=riders[0].cookie,otherRider=riders[1].cookie,shop=shops[0].cookie,otherShop=shops[1].cookie,shopId=shops[0].data.user.id;
 const bike=await call('POST','/api/bikes',{model:'Suzuki Raider',year:2024},rider);
 const otherBike=await call('POST','/api/bikes',{model:'Honda Wave',year:2025},otherRider);
 assert.equal(bike.status,201);assert.equal(otherBike.status,201);
 const bikeId=bike.data.id;
 const defaultComponent=(await call('GET','/api/components',undefined,rider)).data.components.find(c=>c.name==='Engine Oil');
 assert.ok(defaultComponent);
 const link=await call('POST','/api/connections',{shopId},rider);
 assert.equal(link.status,201);
 assert.equal((await call('PATCH','/api/connections/'+link.data.id,{status:'accepted'},shop)).status,200);
 const bookingDay=shift(2);
 const booking=await call('POST','/api/rider-appointments',{shopId,bikeId,service:'Engine Oil',date:bookingDay,time:'11:00'},rider);
 assert.equal(booking.status,201);
 assert.equal((await call('POST','/api/service-reports',{appointmentId:booking.data.id,service:'Engine Oil',serviceDate:shift(-1),cost:500},shop)).status,409,'Cannot report a pending booking');
 assert.equal((await call('PATCH','/api/rider-appointments/'+booking.data.id,{status:'Confirmed'},shop)).status,200);
 assert.equal((await call('POST','/api/service-reports',{appointmentId:booking.data.id,service:'Engine Oil',serviceDate:shift(-1),cost:500},shop)).status,409,'Cannot report an uncompleted booking');
 await pool.query('UPDATE rider_appointment_requests SET date=$1 WHERE id=$2',[shift(-2),booking.data.id]);
 assert.equal((await call('PATCH','/api/rider-appointments/'+booking.data.id,{status:'Completed'},shop)).status,200);
 const reportPayload={appointmentId:booking.data.id,service:'Engine Oil',serviceDate:shift(-1),cost:785.25,notes:'Changed synthetic oil and checked filter'};
 assert.equal((await call('POST','/api/service-reports',reportPayload,rider)).status,403);
 assert.equal((await call('POST','/api/service-reports',reportPayload,otherShop)).status,404);
 assert.equal((await call('POST','/api/service-reports',{...reportPayload,serviceDate:shift(1)},shop)).status,400);
 assert.equal((await call('POST','/api/service-reports',{...reportPayload,serviceDate:shift(-3)},shop)).status,400);
 assert.equal((await call('POST','/api/service-reports',{...reportPayload,cost:-1},shop)).status,400);
 assert.equal((await call('POST','/api/service-reports',{...reportPayload,notes:'x'.repeat(501)},shop)).status,400);
 assert.equal((await call('GET','/api/service-reports')).status,401);
 const submit=await call('POST','/api/service-reports',reportPayload,shop);
 assert.equal(submit.status,201,JSON.stringify(submit.data));
 const reportId=submit.data.id;
 assert.equal(submit.data.status,'Pending');
 assert.equal((await call('POST','/api/service-reports',reportPayload,shop)).status,409);
 assert.equal((await call('GET','/api/services',undefined,rider)).data.services.length,0,'Submission alone cannot import service history');
 const pendingReport=(await call('GET','/api/service-reports',undefined,rider)).data.reports[0];
 assert.equal(pendingReport.status,'Pending');
 assert.equal(pendingReport.service,'Engine Oil');
 assert.equal(pendingReport.cost,785.25);
 assert.equal(pendingReport.bikeModel,'Suzuki Raider');
 assert.equal((await call('GET','/api/service-reports',undefined,shop)).data.reports.length,1);
 assert.equal((await call('GET','/api/service-reports',undefined,otherRider)).data.reports.length,0);
 assert.equal((await call('GET','/api/service-reports',undefined,otherShop)).data.reports.length,0);
 assert.ok(!(JSON.stringify(pendingReport)).includes('share-rider1@demo.test'));
 assert.ok((await call('GET','/api/notifications',undefined,rider)).data.notifications.some(n=>n.id===reportId&&n.type==='service-report'));
 const reportURL='/api/service-reports/'+reportId;
 assert.equal((await call('PATCH',reportURL,{decision:'Accepted'},shop)).status,403);
 assert.equal((await call('PATCH',reportURL,{decision:'Accepted'},otherRider)).status,404);
 assert.equal((await call('PATCH',reportURL,{decision:'Import'},rider)).status,400);
 assert.equal((await call('PATCH',reportURL,{decision:'Accepted',componentId:'not-a-real-component'},rider)).status,404);
 const approve=await call('PATCH',reportURL,{decision:'Accepted',componentId:defaultComponent.id},rider);
 assert.equal(approve.status,200,JSON.stringify(approve.data));
 assert.equal(approve.data.status,'Accepted');assert.ok(approve.data.importedServiceId);
 assert.equal((await call('PATCH',reportURL,{decision:'Accepted'},rider)).status,409,'No duplicate import');
 assert.equal((await call('PATCH',reportURL,{decision:'Declined'},rider)).status,409);
 const own=(await call('GET','/api/services',undefined,rider)).data.services;
 assert.equal(own.length,1);assert.equal(own[0].id,approve.data.importedServiceId);
 assert.equal(own[0].type,'Engine Oil');assert.equal(own[0].componentId,defaultComponent.id);
 assert.equal(own[0].shop,'Shared Service Garage');assert.equal(own[0].cost,785.25);
 assert.equal(own[0].notes,reportPayload.notes);
 const updatedComponent=(await call('GET','/api/components',undefined,rider)).data.components.find(x=>x.id===defaultComponent.id);
 assert.equal(updatedComponent.lastServiceDate,shift(-1));
 assert.equal(updatedComponent.dueDate,shift(29));
 assert.equal((await call('GET','/api/notifications',undefined,rider)).data.notifications.some(n=>n.id===reportId),false);
 assert.equal((await call('GET','/api/service-shares',undefined,shop)).data.shares.length,0,'Import never shares entire rider history');
 // Rider explicitly chooses one service record and one connected shop, including notes and cost.
 const otherService=await call('POST','/api/services',{bikeId,type:'Other Service',date:shift(-3),cost:50,shop:'Rider personal garage',notes:'Personal diagnosis'},rider);
 assert.equal(otherService.status,201,JSON.stringify(otherService.data));
 assert.equal((await call('GET','/api/service-shares')).status,401);
 const sharePayload={serviceId:otherService.data.id,shopId};
 assert.equal((await call('POST','/api/service-shares',sharePayload,shop)).status,403);
 assert.equal((await call('POST','/api/service-shares',{...sharePayload,serviceId:'not-a-valid-service'},rider)).status,404);
 assert.equal((await call('POST','/api/service-shares',{...sharePayload,serviceId:(await call('POST','/api/services',{bikeId:otherBike.data.id,type:'Other Service',date:shift(-1),cost:0,shop:'X'},otherRider)).data.id},rider)).status,404);
 assert.equal((await call('POST','/api/service-shares',{...sharePayload,shopId:shops[1].data.user.id},rider)).status,403);
 const share=await call('POST','/api/service-shares',sharePayload,rider);
 assert.equal(share.status,201,JSON.stringify(share.data));
 assert.equal((await call('POST','/api/service-shares',sharePayload,rider)).status,409);
 const shared=(await call('GET','/api/service-shares',undefined,shop)).data.shares;
 assert.equal(shared.length,1);assert.equal(shared[0].serviceId,otherService.data.id);
 assert.equal(shared[0].notes,'Personal diagnosis');assert.equal(shared[0].cost,50);
 assert.equal(shared[0].bikeModel,'Suzuki Raider');
 assert.equal((await call('GET','/api/service-shares',undefined,otherShop)).data.shares.length,0);
 assert.equal((await call('GET','/api/service-shares',undefined,otherRider)).data.shares.length,0);
 assert.ok(!JSON.stringify(shared).includes('share-rider1@demo.test'));
 assert.equal((await call('DELETE','/api/service-shares/'+share.data.id,undefined,shop)).status,403);
 assert.equal((await call('DELETE','/api/service-shares/'+share.data.id,undefined,otherRider)).status,404);
 assert.equal((await call('DELETE','/api/service-shares/'+share.data.id,undefined,rider)).status,200);
 assert.equal((await call('GET','/api/service-shares',undefined,shop)).data.shares.length,0,'Revocation is immediate');
 const reshare=await call('POST','/api/service-shares',sharePayload,rider);
 assert.equal(reshare.status,201);
 // A second completed booking can be declined without creating another service.
 const secondBooking=await call('POST','/api/rider-appointments',{shopId,bikeId,service:'Tire Inspection',date:shift(4),time:'12:30'},rider);
 assert.equal(secondBooking.status,201);
 assert.equal((await call('PATCH','/api/rider-appointments/'+secondBooking.data.id,{status:'Confirmed'},shop)).status,200);
 await pool.query('UPDATE rider_appointment_requests SET date=$1 WHERE id=$2',[shift(-2),secondBooking.data.id]);
 assert.equal((await call('PATCH','/api/rider-appointments/'+secondBooking.data.id,{status:'Completed'},shop)).status,200);
 const secondReport=await call('POST','/api/service-reports',{appointmentId:secondBooking.data.id,service:'Tire Inspection',serviceDate:shift(-1),cost:10,notes:''},shop);
 assert.equal(secondReport.status,201,JSON.stringify(secondReport.data));
 assert.equal((await call('PATCH','/api/service-reports/'+secondReport.data.id,{decision:'Declined',componentId:defaultComponent.id},rider)).status,400);
 assert.equal((await call('PATCH','/api/service-reports/'+secondReport.data.id,{decision:'Declined'},rider)).status,200);
 assert.equal((await call('GET','/api/services',undefined,rider)).data.services.length,2,'Decline does not import a record');
 assert.equal((await call('PATCH','/api/service-reports/'+secondReport.data.id,{decision:'Accepted'},rider)).status,409);
 // Disconnect destroys selected history-sharing permissions. Old reports remain as read-only records.
 assert.equal((await call('DELETE','/api/connections/'+link.data.id,undefined,rider)).status,200);
 assert.equal((await call('GET','/api/service-shares',undefined,shop)).data.shares.length,0);
 assert.equal((await call('GET','/api/service-shares',undefined,rider)).data.shares.length,0);
 assert.equal((await call('GET','/api/service-reports',undefined,rider)).data.reports.length,2);
 assert.equal((await call('POST','/api/service-shares',sharePayload,rider)).status,403);
 const reconnect=await call('POST','/api/connections',{shopId},rider);
 assert.equal(reconnect.status,201);
 assert.equal((await call('PATCH','/api/connections/'+reconnect.data.id,{status:'accepted'},shop)).status,200);
 assert.equal((await call('GET','/api/service-shares',undefined,shop)).data.shares.length,0,'Reconnection cannot re-enable previously shared records');
 assert.equal((await call('GET','/api/reports',undefined,rider)).data.totalServiceCost,835.25);
});
