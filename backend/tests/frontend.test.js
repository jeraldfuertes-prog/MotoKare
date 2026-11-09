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
 riderPage.location.hash='#/shop/dashboard';riderPage.listeners.hashchange();
 assert.equal(riderPage.location.hash,'#/rider/dashboard');
 const shop=await send(base,'/api/auth/register','POST',{role:'shop',fullName:'Repair Owner',shopName:'MotoKare Partner Garage',email:'s@ui.test',password:'testPassword1234!'});assert.equal(shop.status,201);
 const c=await send(base,'/api/customers','POST',{name:'Real Customer',contact:'0912',motorcycle:'Yamaha',odometer:3000},shop.cookie);assert.equal(c.status,201);
 riderPage.location.hash='#/rider/connections';riderPage.listeners.hashchange();
 assert.match(riderPage.elements['#app'].innerHTML,/Repair Shops/);
 // Refresh as a second rider session to load the newly registered workshop directory.
 const riderDirectory=appSession(base,rider.cookie,'#/rider/connections');
 await wait(()=>riderDirectory.elements['#app'].innerHTML.includes('MotoKare Partner Garage'));
 assert.match(riderDirectory.elements['#app'].innerHTML,/REQUEST CONNECTION/);
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
 const pending=(await send(base,'/api/connections','GET',undefined,shop.cookie)).data.connections;
 assert.equal(pending.length,1);
 shopPage.listeners.click({target:{closest:()=>({dataset:{action:'approve-connection',id:pending[0].id}})}});
 await wait(()=>shopPage.elements['#app'].innerHTML.includes('REMOVE')&&!shopPage.elements['#app'].innerHTML.includes('data-action="approve-connection"'));
 const linked=appSession(base,rider.cookie,'#/rider/connections');
 await wait(()=>linked.elements['#app'].innerHTML.includes('DISCONNECT'));
 assert.doesNotMatch(linked.elements['#app'].innerHTML,/r@ui.test/);
 const anonymous=appSession(base,'','#/rider/dashboard');
 await wait(()=>anonymous.location.hash==='#/login');
 assert.match(anonymous.elements['#app'].innerHTML,/System Login/);
});