'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {mkdtempSync,rmSync}=fs;
process.env.PG_SCHEMA='mk_test_'+require('node:crypto').randomBytes(6).toString('hex');
const {server,ready,pool}=require('../server');
const js=fs.readFileSync(path.join(__dirname,'../../frontend/app.js'),'utf8');
function appSession(base,cookie,hash){
 const elements={ '#app':{innerHTML:''},'#modal-root':{innerHTML:''},'#toast-root':{innerHTML:''} };
 const classList={remove(){},toggle(){},add(){}};
 const listeners={};
 const location={hash};
 const document={querySelector:(sel)=>elements[sel]||null,addEventListener:(name,fn)=>{listeners[name]=fn},body:{classList,style:{}},title:'',activeElement:null};
 const win={addEventListener:(name,fn)=>{listeners[name]=fn},scrollTo(){},matchMedia:()=>({matches:true})};
 const store=new Map();
 const context={document,window:win,location,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
    fetch:(input,options={})=>fetch(base+input,{...options,headers:{...options.headers,cookie}}),
    setTimeout,clearTimeout,Date,Intl,Math,Number,String,Promise,crypto:globalThis.crypto,console,confirm:()=>false,
    FormData:globalThis.FormData,URL,Blob};
 vm.createContext(context);
 vm.runInContext(js,context,{filename:'app.js',timeout:1000});
 return {location,document,window:win,elements,listeners,context};
}
async function send(base,url,method='GET',payload,cookie){const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(payload?{'content-type':'application/json'}:{}),'x-motokare-client':'web'},...(payload?{body:JSON.stringify(payload)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const wait=async pred=>{for(let i=0;i<40;i++){if(pred())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out waiting for frontend render');};
test('frontend HTML rendering uses server sessions, role-specific pages and real records',async t=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await pool.query(`DROP SCHEMA IF EXISTS "${process.env.PG_SCHEMA}" CASCADE`);await pool.end();});
 const rider=await send(base,'/api/auth/register','POST',{role:'rider',fullName:'Rider Test',email:'r@ui.test',password:'testPassword1234!'});assert.equal(rider.status,201);
 const bike=await send(base,'/api/bikes','POST',{model:'Kawasaki Model XYZ',year:2025,plate:'',odometer:1000},rider.cookie);assert.equal(bike.status,201);
 const riderPage=appSession(base,rider.cookie,'#/rider/dashboard');
 await wait(()=>riderPage.elements['#app'].innerHTML.includes('Kawasaki Model XYZ'));
 assert.match(riderPage.elements['#app'].innerHTML,/SECURE SESSION ACTIVE/);
 assert.match(riderPage.elements['#app'].innerHTML,/Rider Test/);
 // Regression: Add Motorcycle must work even though the date-based form has no odometer field.
 riderPage.context.FormData=class{
   constructor(form){this.values=Object.entries(form.values);}
   entries(){return this.values[Symbol.iterator]();}
 };
 riderPage.listeners.submit({preventDefault(){},target:{closest:()=>({dataset:{form:'add-bike'},values:{model:'Wave 100',year:'2024',plate:''}})}});
 await wait(()=>riderPage.elements['#app'].innerHTML.includes('Wave 100'));
 const dateBikeState=await send(base,'/api/bootstrap','GET',undefined,rider.cookie);
 assert.equal(dateBikeState.status,200);
 assert.equal(dateBikeState.data.bikes.find(b=>b.model==='Wave 100')?.odometer,0);

 assert.match(riderPage.elements['#app'].innerHTML,/NEXT SERVICE DATE/);
 assert.match(riderPage.elements['#app'].innerHTML,/DAYS TO SERVICE/);
 assert.doesNotMatch(riderPage.elements['#app'].innerHTML,/CURRENT ODOMETER/);
 riderPage.location.hash='#/rider/components';riderPage.listeners.hashchange();
 assert.match(riderPage.elements['#app'].innerHTML,/Service Interval Monitor/);
 assert.match(riderPage.elements['#app'].innerHTML,/day(s)? left|Due today|overdue/i);
 riderPage.location.hash='#/rider/maintenance';riderPage.listeners.hashchange();
 assert.match(riderPage.elements['#app'].innerHTML,/Days Remaining/);
 assert.doesNotMatch(riderPage.elements['#app'].innerHTML,/Next Mileage/);

 // Components upgrade: catalog/custom dialog HTML and real rider CRUD from UI.
 riderPage.location.hash='#/rider/components';riderPage.listeners.hashchange();
 assert.match(riderPage.elements['#app'].innerHTML,/ADD COMPONENT/);
 assert.match(riderPage.elements['#app'].innerHTML,/Archived Components/);
 riderPage.listeners.click({target:{closest:()=>({dataset:{action:'add-component'}})}});
 assert.match(riderPage.elements['#modal-root'].innerHTML,/FROM CATALOG/);
 assert.match(riderPage.elements['#modal-root'].innerHTML,/CUSTOM COMPONENT/);
 assert.match(riderPage.elements['#modal-root'].innerHTML,/Next planned service date/);
 const dueDate=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 riderPage.listeners.submit({preventDefault(){},target:{closest:()=>({dataset:{form:'add-component'},values:{
  source:'custom',name:'UI Custom Component',intervalDays:'30',dateMode:'next',dueDate,notes:'Check rider gear'
 }})}});
 await wait(()=>riderPage.elements['#app'].innerHTML.includes('UI Custom Component'));
 assert.match(riderPage.elements['#app'].innerHTML,/ARCHIVE/);
 assert.match(riderPage.elements['#app'].innerHTML,/DELETE/);
 let componentState=(await send(base,'/api/bootstrap','GET',undefined,rider.cookie)).data;
 const custom=componentState.components.find(c=>c.name==='UI Custom Component');
 assert.ok(custom);assert.equal(custom.source,'custom');assert.equal(custom.lastServiceDate,null);
 assert.equal(custom.dueDate,dueDate);
 const serviceDate=new Date(Date.now()-5*86400000).toISOString().slice(0,10);
 riderPage.listeners.submit({preventDefault(){},target:{closest:()=>({dataset:{form:'log-service'},values:{
  componentId:custom.id,date:serviceDate,cost:'35',shop:'Garage UI Test',notes:'Inspected'
 }})}});
 await wait(()=>riderPage.elements['#toast-root'].innerHTML.includes('Service recorded and interval updated.'));
 componentState=(await send(base,'/api/bootstrap','GET',undefined,rider.cookie)).data;
 assert.ok(componentState.services.some(x=>x.componentId===custom.id&&x.type==='UI Custom Component'));
 assert.equal(componentState.components.find(c=>c.id===custom.id).lastServiceDate,serviceDate);
 // Rider may archive and restore with explicit confirmation.
 riderPage.context.confirm=()=>true;
 riderPage.listeners.click({target:{closest:()=>({dataset:{action:'archive-component',id:custom.id}})}});
 await wait(()=>riderPage.elements['#app'].innerHTML.includes('Archived Components (1)'));
 assert.equal((await send(base,'/api/bootstrap','GET',undefined,rider.cookie)).data.components.find(c=>c.id===custom.id).archived,true);
 riderPage.listeners.click({target:{closest:()=>({dataset:{action:'restore-component',id:custom.id}})}});
 await wait(()=>riderPage.elements['#app'].innerHTML.includes('Archived Components (0)'));
 assert.equal((await send(base,'/api/bootstrap','GET',undefined,rider.cookie)).data.components.find(c=>c.id===custom.id).archived,false);
 riderPage.listeners.click({target:{closest:()=>({dataset:{action:'delete-component',id:custom.id}})}});
 await wait(()=>!riderPage.elements['#app'].innerHTML.includes('UI Custom Component'));
 componentState=(await send(base,'/api/bootstrap','GET',undefined,rider.cookie)).data;
 assert.ok(!componentState.components.some(c=>c.id===custom.id));
 assert.ok(componentState.services.some(x=>x.type==='UI Custom Component'&&x.componentId===null));
 riderPage.location.hash='#/shop/dashboard';riderPage.listeners.hashchange();
 assert.equal(riderPage.location.hash,'#/rider/dashboard');
 const shop=await send(base,'/api/auth/register','POST',{role:'shop',fullName:'Repair Owner',shopName:'MotoKare Partner Garage',email:'s@ui.test',password:'testPassword1234!'});assert.equal(shop.status,201);
 const c=await send(base,'/api/customers','POST',{name:'Real Customer',contact:'0912',motorcycle:'Yamaha',odometer:3000},shop.cookie);assert.equal(c.status,201);
 riderPage.location.hash='#/rider/connections';riderPage.listeners.hashchange();
 assert.match(riderPage.elements['#app'].innerHTML,/Repair Shops/);
 // Refresh as a second rider session to load the newly registered workshop directory.
 const publish=await send(base,'/api/shops/profile','PATCH',{city:'Davao City',address:'Matina',description:'Oil changes and maintenance',services:['Oil Change','General Inspection']},shop.cookie);
 assert.equal(publish.status,200);
 const riderDirectory=appSession(base,rider.cookie,'#/rider/connections');
 await wait(()=>riderDirectory.elements['#app'].innerHTML.includes('MotoKare Partner Garage'));
 assert.match(riderDirectory.elements['#app'].innerHTML,/REQUEST CONNECTION/);
 assert.match(riderDirectory.elements['#app'].innerHTML,/Davao City/);
 assert.match(riderDirectory.elements['#app'].innerHTML,/Oil Change/);
 assert.match(riderDirectory.elements['#app'].innerHTML,/Search Workshops/);
 riderDirectory.context.FormData=class{
   constructor(form){this.values=Object.entries(form.values);}
   entries(){return this.values[Symbol.iterator]();}
 };
 riderDirectory.listeners.submit({preventDefault(){},target:{closest:()=>({dataset:{form:'search-shops'},values:{query:'no-match-workshop',city:'',service:''}})}});
 await wait(()=>riderDirectory.elements['#app'].innerHTML.includes('No workshops found'));
 riderDirectory.listeners.click({target:{closest:()=>({dataset:{action:'reset-shop-search'}})}});
 assert.match(riderDirectory.elements['#app'].innerHTML,/MotoKare Partner Garage/);
 riderDirectory.listeners.submit({preventDefault(){},target:{closest:()=>({dataset:{form:'search-shops'},values:{query:'',city:'davao',service:'Oil Change'}})}});
 await wait(()=>riderDirectory.elements['#app'].innerHTML.includes('1 RESULT'));
 assert.match(riderDirectory.elements['#app'].innerHTML,/MotoKare Partner Garage/);
 riderDirectory.listeners.click({target:{closest:()=>({dataset:{action:'reset-shop-search'}})}});

 const shopId=shop.data.user.id;
 riderDirectory.listeners.click({target:{closest:()=>({dataset:{action:'connect-shop',id:shopId}})}});
 await wait(()=>riderDirectory.elements['#app'].innerHTML.includes('CANCEL REQUEST'));
 const shopPage=appSession(base,shop.cookie,'#/shop/customers');
 await wait(()=>shopPage.elements['#app'].innerHTML.includes('Real Customer'));
 assert.match(shopPage.elements['#app'].innerHTML,/SECURE SESSION ACTIVE/);
 assert.match(shopPage.elements['#app'].innerHTML,/DELETE/);
 shopPage.location.hash='#/shop/connections';shopPage.listeners.hashchange();
 assert.match(shopPage.elements['#app'].innerHTML,/Incoming Requests/);
 assert.match(shopPage.elements['#app'].innerHTML,/Rider Test/);
 assert.match(shopPage.elements['#app'].innerHTML,/APPROVE/);
 shopPage.location.hash='#/shop/settings';shopPage.listeners.hashchange();
 assert.match(shopPage.elements['#app'].innerHTML,/Workshop Listing/);
 assert.match(shopPage.elements['#app'].innerHTML,/Davao City/);
 shopPage.context.FormData=class{
   constructor(form){this.values=Object.entries(form.values);}
   entries(){return this.values[Symbol.iterator]();}
 };
 shopPage.listeners.submit({preventDefault(){},target:{closest:()=>({dataset:{form:'shop-profile'},values:{city:'Davao City',address:'Bajada',description:'Motorcycle servicing',service_0:'1'}})}});
 await wait(()=>shopPage.elements['#app'].innerHTML.includes('Bajada'));
 assert.equal((await send(base,'/api/shops?city=davao&service=Oil%20Change','GET',undefined,rider.cookie)).data.shops.length,1);
 shopPage.location.hash='#/shop/connections';shopPage.listeners.hashchange();
 assert.match(shopPage.elements['#app'].innerHTML,/APPROVE/);
 const pending=(await send(base,'/api/connections','GET',undefined,shop.cookie)).data.connections;
 assert.equal(pending.length,1);
 shopPage.listeners.click({target:{closest:()=>({dataset:{action:'approve-connection',id:pending[0].id}})}});
 await wait(()=>shopPage.elements['#app'].innerHTML.includes('REMOVE')&&!shopPage.elements['#app'].innerHTML.includes('data-action="approve-connection"'));
 const linked=appSession(base,rider.cookie,'#/rider/connections');
 await wait(()=>linked.elements['#app'].innerHTML.includes('DISCONNECT'));
 assert.doesNotMatch(linked.elements['#app'].innerHTML,/r@ui.test/);
 // Phase 4.3: booking request UI, workshop inbox and rider cancellation.
 linked.location.hash='#/rider/bookings';linked.listeners.hashchange();
 assert.match(linked.elements['#app'].innerHTML,/My Bookings/);
 assert.match(linked.elements['#app'].innerHTML,/REQUEST APPOINTMENT/);
 linked.listeners.click({target:{closest:()=>({dataset:{action:'request-appointment'}})}});
 assert.match(linked.elements['#modal-root'].innerHTML,/Connected workshop/);
 assert.match(linked.elements['#modal-root'].innerHTML,/Motorcycle/);
 assert.match(linked.elements['#modal-root'].innerHTML,/Preferred visit date/);
 linked.context.FormData=class{
   constructor(form){this.values=Object.entries(form.values);}
   entries(){return this.values[Symbol.iterator]();}
 };
 const visitDate=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 linked.listeners.submit({preventDefault(){},target:{closest:()=>({dataset:{form:'request-appointment'},values:{
   shopId,bikeId:bike.data.id,service:'Oil Change from UI',date:visitDate,time:'10:30',notes:'Please inspect my bike'
 }})}});
 await wait(()=>linked.elements['#app'].innerHTML.includes('Oil Change from UI'));
 assert.match(linked.elements['#app'].innerHTML,/Pending/);
 assert.match(linked.elements['#app'].innerHTML,/CANCEL REQUEST/);
 const created=(await send(base,'/api/rider-appointments','GET',undefined,rider.cookie)).data.appointments;
 assert.equal(created.length,1);assert.equal(created[0].service,'Oil Change from UI');
 assert.equal(created[0].status,'Pending');
 const shopInbox=appSession(base,shop.cookie,'#/shop/appointments');
 await wait(()=>shopInbox.elements['#app'].innerHTML.includes('Oil Change from UI'));
 assert.match(shopInbox.elements['#app'].innerHTML,/Rider Appointment Management/);
 assert.match(shopInbox.elements['#app'].innerHTML,/Rider Test/);
 assert.match(shopInbox.elements['#app'].innerHTML,/BOOK APPOINTMENT/);
 assert.match(shopInbox.elements['#app'].innerHTML,/REVIEW REQUEST/);
 shopInbox.listeners.click({target:{closest:()=>({dataset:{action:'review-rider-booking',id:created[0].id}})}});
 assert.match(shopInbox.elements['#modal-root'].innerHTML,/Review Rider Request/);
 assert.match(shopInbox.elements['#modal-root'].innerHTML,/Confirm Appointment/);
 assert.match(shopInbox.elements['#modal-root'].innerHTML,/Decline Request/);
 shopInbox.context.FormData=class{
   constructor(form){this.values=Object.entries(form.values);}
   entries(){return this.values[Symbol.iterator]();}
 };
 shopInbox.listeners.submit({preventDefault(){},target:{closest:()=>({dataset:{form:'review-rider-booking',id:created[0].id},values:{
   status:'Confirmed',reviewNote:'Please arrive ten minutes early'
 }})}});
 await wait(()=>shopInbox.elements['#app'].innerHTML.includes('Please arrive ten minutes early'));
 assert.match(shopInbox.elements['#app'].innerHTML,/UPDATE STATUS/);
 const confirmedRider=appSession(base,rider.cookie,'#/rider/bookings');
 await wait(()=>confirmedRider.elements['#app'].innerHTML.includes('Please arrive ten minutes early'));
 assert.match(confirmedRider.elements['#app'].innerHTML,/Confirmed/);
 assert.match(confirmedRider.elements['#app'].innerHTML,/CANCEL BOOKING/);
 confirmedRider.context.confirm=()=>true;
 confirmedRider.listeners.click({target:{closest:()=>({dataset:{action:'cancel-rider-appointment',id:created[0].id}})}});
 await wait(()=>confirmedRider.elements['#app'].innerHTML.includes('Cancelled'));
 const cancelled=(await send(base,'/api/rider-appointments','GET',undefined,rider.cookie)).data.appointments;
 assert.equal(cancelled[0].status,'Cancelled');
 assert.equal(cancelled[0].reviewNote,'Please arrive ten minutes early');
 const anonymous=appSession(base,'','#/rider/dashboard');
 await wait(()=>anonymous.location.hash==='#/login');
 assert.match(anonymous.elements['#app'].innerHTML,/System Login/);
});