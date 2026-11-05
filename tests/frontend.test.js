'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {mkdtempSync,rmSync}=fs;
const tmp=mkdtempSync(path.join(os.tmpdir(),'motokare-ui-test-'));
process.env.DB_PATH=path.join(tmp,'test.sqlite');
const {server}=require('../server/index');
const js=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
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
 return {location,document,window:win,elements,listeners};
}
async function send(base,url,method='GET',payload,cookie){const r=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(payload?{'content-type':'application/json'}:{}),'x-motokare-client':'web'},...(payload?{body:JSON.stringify(payload)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const wait=async pred=>{for(let i=0;i<40;i++){if(pred())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out waiting for frontend render');};
test('frontend HTML rendering uses server sessions, role-specific pages and real records',async t=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));rmSync(tmp,{recursive:true,force:true});});
 const rider=await send(base,'/api/auth/register','POST',{role:'rider',fullName:'Rider Test',email:'r@ui.test',password:'testPassword1234!'});assert.equal(rider.status,201);
 const bike=await send(base,'/api/bikes','POST',{model:'Kawasaki Model XYZ',year:2025,plate:'',odometer:1000},rider.cookie);assert.equal(bike.status,201);
 const riderPage=appSession(base,rider.cookie,'#/rider/dashboard');
 await wait(()=>riderPage.elements['#app'].innerHTML.includes('Kawasaki Model XYZ'));
 assert.match(riderPage.elements['#app'].innerHTML,/SECURE SESSION ACTIVE/);
 assert.match(riderPage.elements['#app'].innerHTML,/Rider Test/);
 riderPage.location.hash='#/shop/dashboard';riderPage.listeners.hashchange();
 assert.equal(riderPage.location.hash,'#/rider/dashboard');
 const shop=await send(base,'/api/auth/register','POST',{role:'shop',fullName:'Repair Owner',shopName:'MotoKare Partner Garage',email:'s@ui.test',password:'testPassword1234!'});assert.equal(shop.status,201);
 const c=await send(base,'/api/customers','POST',{name:'Real Customer',contact:'0912',motorcycle:'Yamaha',odometer:3000},shop.cookie);assert.equal(c.status,201);
 const shopPage=appSession(base,shop.cookie,'#/shop/customers');
 await wait(()=>shopPage.elements['#app'].innerHTML.includes('Real Customer'));
 assert.match(shopPage.elements['#app'].innerHTML,/SECURE SESSION ACTIVE/);
 assert.match(shopPage.elements['#app'].innerHTML,/DELETE/);
 const anonymous=appSession(base,'','#/rider/dashboard');
 await wait(()=>anonymous.location.hash==='#/login');
 assert.match(anonymous.elements['#app'].innerHTML,/System Login/);
});