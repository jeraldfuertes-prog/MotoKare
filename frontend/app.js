/* MotoKare Phase 4.2: date-based motorcycle maintenance and searchable workshop discovery. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const app = $('#app');
  const modalRoot = $('#modal-root');
  const toastRoot = $('#toast-root');
  const SELECTION_KEY = 'motokare-selected-bike';
  const now = new Date();
  const dateShift = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const today = () => {const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const a=Object.fromEntries(p.map(x=>[x.type,x.value]));return a.year+'-'+a.month+'-'+a.day;};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cash = n => '₱' + Number(n || 0).toLocaleString('en-PH', {maximumFractionDigits: 0});
  const num = n => Number(n || 0).toLocaleString('en-PH');
  const niceDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '—';
  const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2));
  const icoPaths = {
    bike:'<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="m5.5 17.5 4-9h5l4 9M10 8.5l-2-2H5M14.5 8.5l-3 9h-6M14.5 8.5 18.5 17.5"/>',
    dashboard:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/><path d="m8 15 2 2 5-5"/>',
    wrench:'<path d="M14.5 6a5 5 0 0 0-6.4 6.4L3 17.5a2.5 2.5 0 0 0 3.5 3.5l5.1-5.1A5 5 0 0 0 18 9.5l-4 2-3-3z"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    settings:'<path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>', left:'<path d="M19 12H5m6-6-6 6 6 6"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>', x:'<path d="M5 5l14 14M19 5 5 19"/>',
    logout:'<path d="M10 17l5-5-5-5m5 5H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>', down:'<path d="m6 9 6 6 6-6"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/>',
    alert:'<path d="m12 3 10 18H2L12 3zM12 9v5M12 18h.01"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    checkCircle:'<circle cx="12" cy="12" r="10"/><path d="m7 12 3 3 7-7"/>',
    clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',
    chart:'<path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/>',
    shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    location:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
    speed:'<path d="M12 14l5-5M4 18a10 10 0 1 1 16 0H4Z"/><circle cx="12" cy="14" r="1"/>',
    bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7z"/>',
    store:'<path d="M3 10V7l2-4h14l2 4v3M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 13v8h14v-8M9 21v-6h6v6"/>',
    send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
    file:'<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7M8 14h8M8 18h8"/>',
    power:'<path d="M12 2v10M5.5 5.5a9 9 0 1 0 13 0"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    filter:'<path d="M4 5h16l-6 7v7l-4 2v-9L4 5z"/>',
    edit:'<path d="M12 20h9M16 4l4 4-11 11H5v-4L16 4z"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  };
  function icon(name, cls='') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icoPaths[name]||icoPaths.info}</svg>`; }
  function logo(){return `<a class="brand" href="#/" aria-label="MotoKare home"><span class="brand-emblem"><svg viewBox="0 0 48 48" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 3 44 14v20L24 45 4 34V14Z"/><path d="M12 30V18l12 12 12-12v12M12 18l12 12 12-12"/><path d="M24 3v6M24 39v6"/></svg></span><span>MOTO<span>KARE</span></span></a>`;}
  function blueprint(extraClass='') { return `<svg class="${extraClass}" viewBox="0 0 640 340" fill="none" role="img" aria-label="Technical line illustration of a motorcycle">
    <g stroke="#053949" opacity=".7" stroke-width="1"><path d="M0 170h640M320 0v340M0 80h640M0 260h640" stroke-dasharray="3 10"/><circle cx="322" cy="170" r="149" stroke-dasharray="3 8"/><path d="M60 30h520M60 310h520"/></g>
    <g class="line-draw" stroke="#00FFFF" fill="none" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
      <circle pathLength="1" cx="135" cy="240" r="70"/><circle pathLength="1" cx="510" cy="240" r="70"/><circle pathLength="1" cx="135" cy="240" r="52" opacity=".55"/><circle pathLength="1" cx="510" cy="240" r="52" opacity=".55"/>
      <path pathLength="1" d="M135 240 243 239 300 157 393 178 510 240M243 239l-35-88h81l25 47-71 41m71-41 79-20-36 62H243"/>
      <path pathLength="1" d="M300 157h-77l-29-29-47 1-10 20h93l18 23M218 128l27-20h82l36 26 30 44"/>
      <path pathLength="1" d="M393 178 436 116h62l19 22-27 19-34-15-63 36M447 115l-22-26 7-8h52M458 78h39M484 82l28-14M517 68h23"/>
      <path pathLength="1" d="M310 175h61l-25 65h-47l-26-32M276 206l25 17h48M254 178l-35 60m91-64 30 55"/>
      <path pathLength="1" d="M141 169 155 139l-23-21-32 2M427 117l20 49M160 179l77-35M435 154l52 20"/>
      <path pathLength="1" d="M102 239h68M135 205v69M477 240h66M510 205v70" opacity=".55"/><path pathLength="1" d="M60 247 33 256M570 246l31 12"/>
    </g><g fill="#00FFFF" opacity=".9"><circle cx="135" cy="240" r="4"/><circle cx="510" cy="240" r="4"/><circle cx="300" cy="157" r="3"/><circle cx="393" cy="178" r="3"/></g><g fill="#86BDCA" font-size="10" font-family="monospace"><text x="46" y="55">FIG 01 // CHASSIS OVERVIEW</text><text x="445" y="303">MOTORCYCLE // SYS</text><text x="302" y="52">0 1 0 1 0</text></g></svg>`; }
  const SHOP_SERVICES=['Oil Change','Brake Service','Tire Service','Chain & Sprocket','Battery Service','Air Filter','Engine Repair','General Inspection','Other'];
  let shopFilters={query:'',city:'',service:''},shopResults=null;
  const shopSearchUrl=()=>'/shops?'+Object.entries({q:shopFilters.query,city:shopFilters.city,service:shopFilters.service}).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  const componentCatalog=[
    {name:'Engine Oil',icon:'bolt',interval:2000,last:10600,days:12},
    {name:'Brake Inspection',icon:'shield',interval:4500,last:9500,days:40},
    {name:'Air Filter',icon:'filter',interval:6000,last:9200,days:95},
    {name:'Chain & Sprocket',icon:'settings',interval:2100,last:11400,days:25},
    {name:'Battery Check',icon:'bolt',interval:7000,last:11000,days:130},
    {name:'Tire Inspection',icon:'target',interval:4700,last:10000,days:65}
  ];
  let state = {version:4, session:null, role:'rider', selectedBike:null,
    bikes:[], components:[], componentCatalog:[], services:[], customers:[], jobs:[], appointments:[], riderAppointments:[], shops:[], connections:[], shopProfile:null,
    settings:{shopName:'',notifications:true,distance:'km'}};
  let loaded = false;
  async function api(endpoint, method='GET', data){
    let response;
    try{response=await fetch('/api'+endpoint, {method,credentials:'same-origin',headers:{'Accept':'application/json','Content-Type':'application/json','X-MotoKare-Client':'web'}, ...(data===undefined?{}:{body:JSON.stringify(data)})});}
    catch{throw new Error('Cannot connect to the MotoKare server. Check that it is running.');}
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(json.error||`Request failed (${response.status})`);
    return json;
  }
  async function refresh(){
    let selected=state.selectedBike;
    if(!selected){try{selected=localStorage.getItem(SELECTION_KEY);}catch{}}
    const incoming=await api('/bootstrap');
    const componentCatalog=incoming.role==='rider'?(await api('/component-catalog')).catalog:[];
    state={...incoming,componentCatalog,selectedBike:incoming.bikes.some(b=>b.id===selected)?selected:(incoming.bikes[0]?.id||null)};
    if(incoming.role==='rider'&&shopResults!==null)shopResults=(await api(shopSearchUrl())).shops;
    if(incoming.role!=='rider'){shopResults=null;shopFilters={query:'',city:'',service:''};}
    render();
  }
  async function persist(endpoint,method,payload,success,{close=true}={}){
    try{await api(endpoint,method,payload);await refresh();if(close)closeModal();if(success)toast(success);return true;}
    catch(error){toast(error.message);return false;}
  }
  async function initialize(){
    try{await refresh();}
    catch(error){if(!/sign in|continue/i.test(error.message))toast(error.message);}
    finally{loaded=true;render();}
  }
  function save(){try{if(state.selectedBike)localStorage.setItem(SELECTION_KEY,state.selectedBike);}catch{}}
  let route='', mobileOpen=false, notifyOpen=false, toastTimer;
  const routesRider=[['dashboard','Dashboard','dashboard'],['motorcycles','My Motorcycles','bike'],['components','Components','settings'],['maintenance','Maintenance','calendar'],['history','Service History','history'],['connections','Repair Shops','store'],['bookings','My Bookings','calendar'],['settings','Settings','settings']];
  const routesShop=[['dashboard','Shop Dashboard','dashboard'],['customers','Customers','users'],['jobs','Service Jobs','wrench'],['appointments','Appointments','calendar'],['reports','Reports','chart'],['connections','Rider Connections','users'],['settings','Settings','settings']];
  const routeNow=()=> (location.hash.slice(1).split('?')[0] || '/');
  const parseAppRoute = path => {const a=path.split('/').filter(Boolean);return {role:a[0]==='shop'?'shop':'rider',page:a[1]||'dashboard'};};
  function navigate(path){location.hash='#'+path; if(routeNow()===path) render();}
  function ensureBike(){let bike=state.bikes.find(x=>x.id===state.selectedBike);if(!bike){bike=state.bikes[0];state.selectedBike=bike?.id??null;}return bike;}
  const activeComps = id => state.components.filter(c=>c.bikeId===id&&!c.archived);
  const archivedComps = id => state.components.filter(c=>c.bikeId===id&&c.archived);
  function health(c){
    const days=Math.round((Date.parse(c.dueDate+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000);
    const overdue=days<0,soon=days<=14;
    const pct=Math.max(0,Math.min(100,Math.round(100*days/Math.max(1,c.intervalDays||90))));
    return {days,pct,kind:overdue?'danger':soon?'warn':'good',label:overdue?'Overdue':days===0?'Due Today':soon?'Service Soon':'On Track'};
  }
  const remainingLabel=days=>days<0?`${Math.abs(days)} day${days===-1?'':'s'} overdue`:days===0?'Due today':`${days} day${days===1?'':'s'} left`;
  const nextServiceDate=bike=>{const items=activeComps(bike.id);return items.length?items.map(c=>c.dueDate).sort()[0]:null;};
  function alertsForBike(bike){return bike?activeComps(bike.id).map(c=>({c,...health(c,bike)})).filter(a=>a.kind!=='good'):[];}
  const allAlerts=()=>state.bikes.flatMap(b=>alertsForBike(b));
  const totalCosts=bike=>state.services.filter(s=>s.bikeId===bike?.id).reduce((a,s)=>a+Number(s.cost||0),0);
  function toast(msg){clearTimeout(toastTimer);toastRoot.innerHTML=`<div class="toast">${icon('checkCircle')} ${esc(msg)}</div>`;toastTimer=setTimeout(()=>toastRoot.innerHTML='',3600);}
  function ticker(){return `<div class="ticker" aria-label="MotoKare system information"><span class="ticker-track">MOTOKARE // MAINTENANCE INTELLIGENCE <span class="sep">✦</span> RIDER AND WORKSHOP SYSTEMS <span class="sep">✦</span> SCHEDULE-BASED TRACKING <span class="sep">✦</span> SECURE ACCOUNT DATA <span class="sep">✦</span> RIDE SMART. MAINTAIN BETTER.</span></div>`;}
  function landingHeader(){return `<header class="site-header"><div class="container nav-inner">${logo()}<nav class="nav-links" id="site-nav" aria-label="Main navigation"><a href="#/" data-scroll="home">Home</a><a href="#/" data-scroll="features">Features</a><a href="#/" data-scroll="roles">Who It's For</a><a href="#/" data-scroll="how">How It Works</a><a href="#/" data-scroll="pricing">Pricing</a></nav><div class="nav-actions"><a class="button ghost small" href="#/login">Log In</a><a class="button small primary" href="#/register">Get Started ${icon('arrow')}</a><button class="nav-menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" data-action="mobile-nav">${icon('menu')}</button></div></div></header>`;}
  function landing(){
    const features=[['calendar','Maintenance Scheduling','Stay ahead of oil changes, brake checks, and service intervals with one digital schedule.'],['bell','Intelligent Reminders','Get clear service-due indicators based on recorded dates and odometer readings.'],['history','Service History','Maintain an organized timeline of past servicing, repair expenses, and workshops.'],['calendar','Date-Based Tracking','See upcoming service dates and remaining days without entering odometer readings.'],['store','Repair Shop Workspace','Keep customer records, manage service jobs, and plan upcoming appointments.'],['chart','Maintenance Reports','See historical service activity and cost summaries in a streamlined dashboard.']];
    return `${landingHeader()}<main id="main"><section class="hero" id="home"><div class="container hero-layout"><div><div class="kicker"><span class="status-dot"></span> MOTORCYCLE MAINTENANCE // REIMAGINED</div><h1 class="hero-title"><span>YOUR RIDE.</span><span class="accent">UNDER</span><span>CONTROL.</span></h1><p class="hero-desc">The next-generation maintenance command center for motorcycle riders and repair shops. Track your bike, plan every service, and keep your maintenance history on one connected platform.</p><div class="hero-actions"><a class="button primary" href="#/register">INITIALIZE YOUR ACCOUNT ${icon('arrow')}</a><a class="button" href="#/register">CREATE YOUR WORKSPACE ${icon('chevron')}</a></div><div class="hero-proof"><div class="proof-item"><strong>01</strong><span>Track your ride</span></div><div class="proof-item"><strong>02</strong><span>Never miss service</span></div><div class="proof-item"><strong>03</strong><span>Connect your shop</span></div></div></div><div class="hero-visual"><div class="radar-ring" aria-hidden="true"></div><div class="radar-sweep" aria-hidden="true"></div>${blueprint('bike-svg')}<div class="spec top"><small>VEHICLE STATUS</small><div class="val">ONLINE</div><div class="system-status"><span class="status-dot ok"></span> SYSTEM READY</div></div><div class="spec bottom"><small>ILLUSTRATIVE ODOMETER</small><div class="val">12,450 <span style="font-size:13px">KM</span></div><small>MAINTENANCE ANALYTICS</small></div><span class="frame-corner left">MK // TECH-01</span><span class="frame-corner right">[ 001 : ACTIVE ]</span></div></div></section>${ticker()}
    <section id="features" class="section"><div class="container"><div class="section-heading"><div><div class="kicker"><span class="eyeline"></span> SYSTEM CAPABILITIES</div><h2 class="section-title">ENGINEERED FOR<br><span class="text-cyan">EVERY RIDE.</span></h2></div><p class="section-lead">Everything your motorcycle needs, from its first logged kilometer to its next service appointment.</p></div><div class="feature-grid">${features.map((f,i)=>`<article class="panel feature"><div class="feature-index">MOD_0${i+1}</div><div class="feature-icon">${icon(f[0],'large')}</div><h3>${f[1]}</h3><p>${f[2]}</p></article>`).join('')}</div></div></section>
    <section id="roles" class="section darkstripe"><div class="container"><div class="section-heading"><div><div class="kicker"><span class="eyeline"></span> TWO CONNECTED EXPERIENCES</div><h2 class="section-title">ONE PLATFORM.<br><span class="text-cyan">TWO COMMAND CENTERS.</span></h2></div></div><div class="role-grid"><article class="panel role-panel"><div class="role-sigil">${icon('bike')} MODE // B2C - RIDER</div><h3>MAINTAIN<br>WITH CONFIDENCE.</h3><p>Your motorcycle's complete service schedule, automatic service-date tracking, maintenance alerts, and repair history in one organized place.</p><div class="role-cta"><a class="button primary" href="#/rider/dashboard">PREVIEW RIDER SYSTEM ${icon('arrow')}</a></div></article><article class="panel role-panel shop"><div class="role-sigil">${icon('store')} MODE // B2B - WORKSHOP</div><h3>MANAGE<br>EVERY SERVICE.</h3><p>Organize customer motorcycles, service jobs, upcoming appointments, and your shop's maintenance records.</p><div class="role-cta"><a class="button" href="#/shop/dashboard">PREVIEW SHOP SYSTEM ${icon('arrow')}</a></div></article></div></div></section>
    <section id="how" class="section"><div class="container"><div class="section-heading"><div><div class="kicker"><span class="eyeline"></span> OPERATION SEQUENCE</div><h2 class="section-title">FOUR STEPS.<br><span class="text-cyan">FULL CONTROL.</span></h2></div></div><div class="steps">${[['01','REGISTER','Create a rider or repair-shop account.'],['02','SET UP','Add motorcycle details and set your maintenance schedule.'],['03','MONITOR','Review service intervals, schedules, and alerts.'],['04','MAINTAIN','Log service work and update maintenance history.']].map(x=>`<article class="panel step"><span class="step-no">${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join('')}</div></div></section>
    <section id="pricing" class="section darkstripe"><div class="container"><div class="section-heading"><div><div class="kicker"><span class="eyeline"></span> DEPLOYMENT OPTIONS</div><h2 class="section-title">CHOOSE YOUR<br><span class="text-cyan">SERVICE TIER.</span></h2></div><p class="section-lead">Illustrative pricing based on the MotoKare business proposal; payments are not active in this prototype.</p></div><div class="pricing-grid"><article class="panel price-card"><div class="label">RIDER // FREE</div><div class="price">₱0 <small>/ START</small></div><p>Explore the core maintenance workflow and digital motorcycle tracking experience.</p><a class="button" href="#/register">CREATE ACCOUNT ${icon('arrow')}</a></article><article class="panel price-card"><div class="label">RIDER // PREMIUM</div><div class="price">₱199 <small>/ YEAR</small></div><p>Proposed paid plan for individual riders who want an extended maintenance experience.</p><a class="button primary" href="#/register">GET STARTED ${icon('arrow')}</a></article><article class="panel price-card"><div class="label">WORKSHOP // BUSINESS</div><div class="price">₱2,999 <small>/ YEAR</small></div><p>Proposed repair-shop workspace with customers, service jobs, and appointment records.</p><a class="button" href="#/register">SET UP WORKSHOP ${icon('arrow')}</a></article></div><div class="pricing-note">* These figures are planning assumptions. No subscriptions, checkout, or real payment processing are implemented.</div></div></section>
    </main><footer class="site-footer"><div class="container footer-inner">${logo()}<span>© ${now.getFullYear()} MotoKare • Ride Smart. Maintain Better.</span><span>PHASE 03 // FULL-STACK WEB APP</span></div></footer>`;
  }
  function authPage(mode){const register=mode==='register'; const role=state.role==='shop'?'shop':'rider';return `<main id="main" class="auth-shell"><section class="auth-promo">${logo()}<div><div class="kicker"><span class="status-dot"></span> SYSTEM ACCESS // SECURE ACCOUNT LOGIN</div><h1>${register?'JOIN THE<br><span>NETWORK.</span>':'WELCOME<br><span>BACK.</span>'}</h1><p>Everything you need to track motorcycle care, maintain service records, and connect riders with repair shops. Enter your MotoKare workspace.</p>${blueprint('blueprint-mini')}</div><div class="auth-foot"><span>MOTOKARE // AUTH MODULE</span><span>ENCRYPTED PASSWORD STORAGE • HTTP-ONLY SESSIONS</span></div></section><section class="auth-main"><div class="auth-card"><a class="auth-back" href="#/">${icon('left')} RETURN TO HOMEPAGE</a><div class="label" style="margin-top:39px">ACCESS TERMINAL // ${register?'REGISTER':'LOGIN'}</div><h2>${register?'Create Account':'System Login'}</h2><p class="auth-sub">${register?'Select an account type and set up your workspace.':'Select your access type to enter your dashboard.'}</p><div class="auth-notice">${icon('shield')} Account access is verified by the MotoKare server. Use a unique password of at least 10 characters.</div><form data-form="${register?'register':'login'}" id="auth-form"><div class="label" style="margin-bottom:10px">SELECT ACCESS MODE</div><div class="tabs" role="group" aria-label="Account type"><button type="button" class="tab ${role==='rider'?'active':''}" aria-pressed="${role==='rider'}" data-action="auth-role" data-role="rider">${icon('bike')} RIDER / B2C</button><button type="button" class="tab ${role==='shop'?'active':''}" aria-pressed="${role==='shop'}" data-action="auth-role" data-role="shop">${icon('store')} WORKSHOP / B2B</button></div>${register?`<div class="field"><label for="full-name">Full name</label><input id="full-name" name="fullName" autocomplete="name" placeholder="Your full name" minlength="2" required></div>`:''}<div class="field"><label for="auth-email">Email address</label><input id="auth-email" name="email" type="email" autocomplete="email" placeholder="name@example.com" required></div><div class="field"><label for="auth-password">${register?'Create password':'Password'}</label><input id="auth-password" name="password" type="password" autocomplete="${register?'new-password':'current-password'}" placeholder="At least 10 characters" minlength="10" required></div>${register&&role==='shop'?`<div class="field"><label for="shop-name">Workshop name</label><input id="shop-name" name="shopName" placeholder="e.g. MotoKare Service Hub" required></div>`:''}<button class="button primary full" type="submit">${register?'CREATE ACCOUNT':'ENTER DASHBOARD'} ${icon('arrow')}</button></form><p class="auth-helper">${register?'Already have an account?':'New to MotoKare?'} <a href="#/${register?'login':'register'}">${register?'Log in':'Create account'}</a></p><div class="auth-helper">Your account determines which workspace and data you can access.</div></div></section></main>`;}
  function sidebar(role,page){const items=role==='shop'?routesShop:routesRider;return `<aside class="sidebar ${mobileOpen?'open':''}" id="app-sidebar" aria-label="${role==='shop'?'Workshop':'Rider'} navigation">${logo()}<div><div class="side-caption">${role==='shop'?'WORKSHOP OPERATIONS':'RIDER CONTROL CENTER'}</div><nav class="side-nav" aria-label="Dashboard sections"><div class="nav-group">Main Menu // 01</div>${items.map(([id,name,ic])=>`<a href="#/${role}/${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${icon(ic)} ${name}</a>`).join('')}</nav></div><div class="sidebar-spacer"></div><button type="button" class="side-switch" data-action="switch-role" data-role="${role==='shop'?'rider':'shop'}" aria-label="Sign out and switch account type"><span><small>SWITCH ACCOUNT</small><strong>${role==='shop'?'Rider Dashboard':'Repair Shop Dashboard'}</strong></span>${icon('arrow')}</button><button class="button ghost small full" type="button" data-action="logout">${icon('logout')} EXIT TO HOME</button><div class="side-foot">PHASE 04.2 // SHOP DISCOVERY</div></aside>`;}
  function breadcrumb(page){return page.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
  function topbar(role,page){const count=role==='shop'?state.appointments.filter(x=>x.status==='Pending').length+state.connections.filter(x=>x.status==='pending').length+state.riderAppointments.filter(x=>x.status==='Pending').length:allAlerts().length;return `<header class="app-topbar"><div style="display:flex;align-items:center;gap:15px"><button class="icon-button sidebar-mobile-toggle" type="button" data-action="sidebar-toggle" aria-label="Open sidebar navigation" aria-expanded="${mobileOpen}">${icon('menu')}</button><div class="breadcrumbs">MOTOKARE / <span>${role==='shop'?'WORKSHOP':'RIDER'} / ${esc(breadcrumb(page))}</span></div></div><div class="topbar-actions"><span class="system-status"><span class="status-dot ok"></span> SECURE SESSION ACTIVE</span><button class="icon-button" type="button" data-action="notifications" aria-label="View notifications" aria-expanded="${notifyOpen}">${icon('bell')}${count?`<span class="notify-count">${count>9?'9+':count}</span>`:''}</button><div class="top-avatar" aria-hidden="true">${esc((state.session?.name||'MK').slice(0,2).toUpperCase())}</div><div class="top-user">${esc(state.session?.name||'Demo Operator')}<small>${role==='shop'?'WORKSHOP MODE':'RIDER MODE'}</small></div></div></header>`;}
  function appShell(role,page,content){document.body.classList.toggle('app-mode',true);return `<div class="app-layout">${sidebar(role,page)}<div class="mobile-shade ${mobileOpen?'show':''}" data-action="sidebar-close"></div><div class="app-body">${topbar(role,page)}${ticker()}<main id="main" class="app-content">${content}</main></div></div>`;}
  const head=(tag,title,desc,buttons='')=>`<header class="page-head"><div><div class="label">${tag}</div><h1>${title}</h1><p>${desc}</p></div>${buttons?`<div class="page-actions">${buttons}</div>`:''}</header>`;
  const button=(action,title,ic='plus',primary=true)=>`<button type="button" class="button ${primary?'primary':''} small" data-action="${action}">${icon(ic)} ${title}</button>`;
  function metric(label,value,unit,ic){return `<div class="panel metric"><div style="display:flex;align-items:center;justify-content:space-between"><div class="label">${label}</div><span class="metric-icon">${icon(ic)}</span></div><div class="readout">${value} ${unit?`<small>${unit}</small>`:''}</div></div>`;}
  function componentRows(bike,compact=true){
    const comps=[...activeComps(bike.id)].sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
    if(!comps.length)return '<div class="empty-state"><h3>No active maintenance components</h3><p>Add a catalog or custom component to start tracking this motorcycle.</p>'+button('add-component','ADD COMPONENT')+'</div>';
    return '<div class="component-list">'+comps.slice(0,compact?4:comps.length).map(c=>{
      const h=health(c);
      return '<div class="component-row"><div class="comp-icon">'+icon(c.icon)+'</div><div><div class="comp-row-title"><strong>'+esc(c.name)+'</strong><small>'+remainingLabel(h.days)+' · Due '+niceDate(c.dueDate)+'</small></div>'+
        '<div class="bar-track" role="progressbar" aria-label="'+esc(c.name)+' estimated interval remaining" aria-valuenow="'+h.pct+'" aria-valuemin="0" aria-valuemax="100"><div class="bar-fill '+h.kind+'" style="width:'+h.pct+'%"></div></div>'+
        (c.notes&&!compact?'<small class="component-note">'+esc(c.notes)+'</small>':'')+'</div><span class="comp-status '+h.kind+'">'+h.label+'</span>'+
        (!compact?'<div class="component-row-actions"><button class="button small ghost" data-action="edit-component" data-id="'+esc(c.id)+'" aria-label="Edit '+esc(c.name)+'">EDIT</button>'+
        '<button class="button small ghost" data-action="archive-component" data-id="'+esc(c.id)+'" aria-label="Archive '+esc(c.name)+'">ARCHIVE</button>'+
        '<button class="button small ghost danger-action" data-action="delete-component" data-id="'+esc(c.id)+'" aria-label="Permanently delete '+esc(c.name)+'">DELETE</button></div>':'')+'</div>';
    }).join('')+'</div>';
  }
  const noBike = () => `<div class="panel empty-state">${icon('bike','xl')}<h3>No motorcycles yet</h3><p>Add your first motorcycle to start tracking its maintenance schedule.</p>${button('add-bike','Add Motorcycle')}</div>`;
  function riderDash(){const bike=ensureBike();if(!bike)return head('RIDER // OVERVIEW','Dashboard','Your motorcycle command center.')+noBike();const comps=activeComps(bike.id),alarms=alertsForBike(bike),next=comps.map(c=>({...c,days:health(c).days})).sort((a,b)=>a.days-b.days)[0];const services=state.services.filter(s=>s.bikeId===bike.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3);
    return `${head('RIDER // SYSTEM OVERVIEW','Command Center','Your motorcycle. Your maintenance. Complete control.',`<button class="button small ghost" data-action="add-bike">${icon('plus')} ADD BIKE</button>${button('log-service','LOG SERVICE','calendar')}`)}<div class="dashboard-grid"><section class="panel moto-profile"><div><div class="label">PRIMARY VEHICLE // ACTIVE</div><h2>${esc(bike.model)}</h2><p>${esc(bike.year)} model • Plate ${esc(bike.plate||'Not entered')}</p><div class="bike-id">UNIT ID // ${esc(bike.id.slice(-7).toUpperCase())}</div><div style="margin-top:13px"><span class="pill good"><span class="status-dot ok static"></span> PROFILE ACTIVE</span></div></div>${blueprint('blueprint-small')}</section><section class="panel status-panel ${alarms.length?'warning':'success'}"><div class="maintenance-flag"><span class="label">MAINTENANCE WATCH</span>${icon('alert','large')}</div><div><div class="alert-number" style="${alarms.length?'':'color:#A2FFA6;text-shadow:none'}">${String(alarms.length).padStart(2,'0')}</div><div class="label">${alarms.length?'SERVICE ITEMS NEED ATTENTION':'ALL SERVICE ITEMS ON TRACK'}</div><div class="progress-track"><div class="progress-bar" style="width:${Math.round(100*(comps.length-alarms.length)/Math.max(1,comps.length))}%"></div></div><small>Based on service dates; reminders update automatically.</small></div><a class="linkline" href="#/rider/maintenance">VIEW MAINTENANCE ${icon('arrow')}</a></section></div><div class="metric-grid">${metric('NEXT SERVICE DATE',next?niceDate(next.dueDate):'—','','calendar')}${metric('OPEN ALERTS',String(alarms.length).padStart(2,'0'),'ITEMS','alert')}${metric('DAYS TO SERVICE',next?remainingLabel(next.days):'—','','clock')}${metric('SERVICE SPENDING',cash(totalCosts(bike)),'','chart')}</div><div class="content-grid"><section class="panel"><div class="panel-head"><div><div class="label">DATE-BASED SERVICE INTERVALS</div><h2>Component Health <span style="font-size:12px;color:var(--muted);font-family:var(--mono)">// ESTIMATED</span></h2></div><a class="linkline" href="#/rider/components">ALL ${icon('chevron')}</a></div>${componentRows(bike)}<div class="quick-actions"><button class="button small" data-action="log-service">${icon('plus')} LOG SERVICE</button></div></section><section class="panel"><div class="panel-head"><div><div class="label">EVENT LOG // RECENT</div><h2>Service History</h2></div><a class="linkline" href="#/rider/history">VIEW ALL ${icon('chevron')}</a></div>${services.length?services.map(s=>`<div class="service-mini"><span class="mini-marker">${icon('wrench')}</span><span><strong>${esc(s.type)}</strong><small>${niceDate(s.date)} • ${esc(s.shop)}</small></span><span class="cost">${cash(s.cost)}</span></div>`).join(''):'<p class="text-muted">No service records yet.</p>'}<div class="quick-actions"><button class="button small" data-action="log-service">${icon('plus')} ADD RECORD</button></div></section></div><p class="pricing-note" style="margin-top:17px">SYSTEM NOTE: Calendar reminders are not live mechanical diagnostics. Follow your manufacturer's mileage-based service requirements when they are earlier.</p>`;
  }
  function motorcyclesPage(){return `${head('RIDER // GARAGE','My Motorcycles','Manage your motorcycles without recurring odometer entry.',button('add-bike','ADD MOTORCYCLE'))}<div class="cards-grid">${state.bikes.map(b=>`<article class="panel vehicle-card"><div class="label">MOTORCYCLE PROFILE // ${b.id===state.selectedBike?'SELECTED':'STANDBY'}</div>${blueprint('blueprint-small')}<h3>${esc(b.model)}</h3><small>${esc(b.year)} • ${esc(b.plate||'No plate entered')}</small><div class="stat-mini"><span>NEXT SERVICE</span><strong>${niceDate(nextServiceDate(b))}</strong></div><div class="card-actions">${b.id===state.selectedBike?'<span class="pill good">ACTIVE</span>':`<button class="button small ghost" data-action="select-bike" data-id="${b.id}">SELECT BIKE</button>`}<button class="button small" data-action="edit-bike" data-id="${b.id}">${icon('edit')} EDIT</button><button class="button small ghost" data-action="delete-bike" data-id="${esc(b.id)}" aria-label="Delete ${esc(b.model)}">${icon('trash')} DELETE</button></div></article>`).join('')}<button type="button" data-action="add-bike" class="panel vehicle-card empty-state" style="border-style:dashed;cursor:pointer;width:100%">${icon('plus','xl')}<h3>Add Another Motorcycle</h3><p>Track each bike's individual maintenance history.</p></button></div>`;}
  function componentsPage(){
    const b=ensureBike();
    const actions=button('add-component','ADD COMPONENT','plus')+' '+button('log-service','LOG SERVICE','calendar',false);
    if(!b)return head('RIDER // TECHNICAL READOUT','Components','Manage maintenance for each motorcycle.',actions)+noBike();
    const active=activeComps(b.id),archived=archivedComps(b.id),soon=active.filter(c=>health(c).kind!=='good');
    return head('RIDER // TECHNICAL READOUT','Components','Add maintenance items from a catalog or create your own custom components.',actions)+
      '<div class="alert-strip">'+icon('info')+' All schedules are date-based estimates. Confirm service intervals against your motorcycle manual.</div>'+
      '<div class="metric-grid">'+metric('ACTIVE COMPONENTS',String(active.length),'ITEMS','settings')+
      metric('ON TRACK',String(active.length-soon.length),'ITEMS','checkCircle')+
      metric('DUE SOON / OVERDUE',String(soon.length),'ITEMS','alert')+
      metric('ARCHIVED',String(archived.length),'ITEMS','history')+'</div>'+
      '<section class="panel"><div class="panel-head"><div><div class="label">'+esc(b.model.toUpperCase())+' // DATE-BASED SERVICE</div><h2>Service Interval Monitor</h2></div><span class="system-status"><span class="status-dot"></span> TRACKING ACTIVE</span></div>'+
      componentRows(b,false)+'<div class="quick-actions">'+button('add-component','ADD COMPONENT')+' '+button('log-service','RECORD COMPLETED SERVICE','calendar',false)+'</div></section>'+
      '<section class="panel archived-components"><div class="panel-head"><div><div class="label">COMPONENT LIBRARY // INACTIVE</div><h2>Archived Components ('+archived.length+')</h2></div></div>'+
      (archived.length?archived.map(c=>'<div class="component-archive-row"><div><strong>'+esc(c.name)+'</strong><small>Archived · Reminder disabled · Last due '+niceDate(c.dueDate)+'</small></div>'+
        '<div class="component-row-actions"><button class="button small ghost" data-action="restore-component" data-id="'+esc(c.id)+'">RESTORE</button>'+
        '<button class="button small ghost danger-action" data-action="delete-component" data-id="'+esc(c.id)+'">DELETE PERMANENTLY</button></div></div>').join(''):
        '<p class="text-muted">No archived components. Archive an item to hide its reminders without losing maintenance history.</p>')+'</section>'+
      '<p class="connection-note">Deleting a component permanently removes its schedule, but existing service history and expenses are retained.</p>';
  }
  function maintenancePage(){const b=ensureBike();const arr=b?activeComps(b.id).map(c=>({...c,h:health(c)})).sort((a,b)=>a.h.days-b.h.days):[];return `${head('RIDER // SCHEDULE CONTROL','Maintenance Schedule','Review maintenance dates that update automatically.',button('log-service','RECORD SERVICE'))}${!b?noBike():`<div class="alert-strip">${icon('alert')} Reminder indicators depend on manually maintained records and generic demo intervals; always follow your motorcycle manufacturer's service manual.</div><section class="panel table-panel"><div class="panel-head"><div><div class="label">UPCOMING MAINTENANCE MATRIX</div><h2>Scheduled Services</h2></div></div><table class="data-table"><thead><tr><th>Component</th><th>Last Service</th><th>Due Date</th><th>Days Remaining</th><th>Status</th></tr></thead><tbody>${arr.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${niceDate(c.lastServiceDate)}</td><td>${niceDate(c.dueDate)}</td><td>${remainingLabel(c.h.days)}</td><td><span class="pill ${c.h.kind}">${c.h.label}</span></td></tr>`).join('')}</tbody></table></section>`}`;}
  function historyPage(){const b=ensureBike();const entries=state.services.filter(x=>x.bikeId===b?.id).sort((a,c)=>c.date.localeCompare(a.date));return `${head('RIDER // MAINTENANCE ARCHIVE','Service History','Your saved repairs and maintenance expenses.',button('log-service','ADD SERVICE RECORD'))}${!b?noBike():`<div class="metric-grid">${metric('TOTAL RECORDS',num(entries.length),'ENTRIES','history')}${metric('LIFETIME SPEND',cash(totalCosts(b)),'','chart')}${metric('NEXT SERVICE',niceDate(nextServiceDate(b)),'','calendar')}${metric('VEHICLE',esc(String(b.year)),'MODEL YEAR','bike')}</div><section class="panel table-panel"><div class="panel-head"><div><div class="label">SERVICE ACTIVITY LOG</div><h2>Maintenance Entries</h2></div><button class="button small ghost" data-action="export-services">${icon('download')} EXPORT CSV</button></div>${entries.length?`<table class="data-table"><thead><tr><th>Date</th><th>Service</th><th>Workshop</th><th>Cost</th></tr></thead><tbody>${entries.map(s=>`<tr><td>${niceDate(s.date)}</td><td><strong>${esc(s.type)}</strong>${s.notes?`<div class="text-muted" style="font-size:10px">${esc(s.notes)}</div>`:''}</td><td>${esc(s.shop)}</td><td>${cash(s.cost)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-state"><h3>No services recorded</h3><p>Start your maintenance timeline by adding a service entry.</p></div>'}</section>`}`;}
  function shopDash(){const total=state.customers.length,active=state.jobs.filter(j=>j.status!=='Completed').length,appointments=state.appointments.filter(x=>x.date>=today()).length,revenue=state.jobs.filter(j=>j.status==='Completed').reduce((a,j)=>a+j.cost,0);
    return `${head('WORKSHOP // OPERATIONS OVERVIEW','Service Command','Manage service operations and maintain customer relationships.',`${button('add-job','NEW SERVICE JOB','plus')}`)}<div class="shop-summary">${metric('REGISTERED RIDERS',num(total),'CUSTOMERS','users')}${metric('ACTIVE SERVICE JOBS',num(active),'JOBS','wrench')}${metric('UPCOMING BOOKINGS',num(appointments),'SLOTS','calendar')}${metric('COMPLETED JOB VALUE',cash(revenue),'PHP','chart')}</div><div class="shop-overview"><section class="panel"><div class="panel-head"><div><div class="label">WORKSHOP ACTIVITY // RECORDED JOBS</div><h2>Service Volume</h2></div><span class="pill good">ONLINE</span></div><p class="text-muted" style="font-size:11px">Service jobs recorded in the current and previous five months.</p><div class="shop-trend">${Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i);const key=d.toISOString().slice(0,7);const count=state.jobs.filter(j=>j.date.startsWith(key)).length;const max=Math.max(1,...Array.from({length:6},(_,k)=>{const m=new Date();m.setMonth(m.getMonth()-5+k);return state.jobs.filter(j=>j.date.startsWith(m.toISOString().slice(0,7))).length;}));return `<div class="shop-bar-wrap"><div class="shop-bar" style="height:${count?Math.max(8,100*count/max):2}%" title="${count} jobs"></div><small>${d.toLocaleDateString('en-US',{month:'short'}).toUpperCase()}</small></div>`;}).join('')}</div></section><section class="panel"><div class="panel-head"><div><div class="label">SYSTEM QUEUE</div><h2>Quick Operations</h2></div></div><div class="shop-activity"><div class="shop-activity-item">${icon('users')}<span><strong>Manage customers</strong><small>Register and update motorcycle owners.</small></span></div><div class="shop-activity-item">${icon('wrench')}<span><strong>Record service jobs</strong><small>Track repairs through completion.</small></span></div><div class="shop-activity-item">${icon('calendar')}<span><strong>Plan appointments</strong><small>Schedule customers and maintenance.</small></span></div></div><div class="quick-actions" style="margin-top:25px">${button('add-customer','ADD CUSTOMER','plus',false)}${button('add-appointment','BOOK SLOT','calendar',false)}</div></section></div><div class="content-grid"><section class="panel table-panel"><div class="panel-head"><div><div class="label">ACTIVE WORK ORDERS</div><h2>Current Jobs</h2></div><a class="linkline" href="#/shop/jobs">VIEW ALL ${icon('chevron')}</a></div>${jobsTable(state.jobs.slice(0,4),false)}</section><section class="panel"><div class="panel-head"><div><div class="label">CUSTOMER ACTIVITY</div><h2>Recent Customers</h2></div><a class="linkline" href="#/shop/customers">VIEW ALL ${icon('chevron')}</a></div>${state.customers.slice(0,4).map(c=>`<div class="service-mini"><span class="mini-marker">${icon('user')}</span><span><strong>${esc(c.name)}</strong><small>${esc(c.motorcycle)}</small></span></div>`).join('')}</section></div>`;
  }
  const customerName=id=>state.customers.find(c=>c.id===id)?.name || 'Unknown customer';
  function jobsTable(jobs,change=true){return jobs.length?`<table class="data-table"><thead><tr><th>Job ID / Rider</th><th>Service</th><th>Date</th><th>Status</th>${change?'<th>Action</th>':''}</tr></thead><tbody>${jobs.map(j=>`<tr><td><strong>#${esc(j.id.slice(0,6).toUpperCase())}</strong><div class="text-muted" style="font-size:10px">${esc(customerName(j.customerId))}</div></td><td>${esc(j.service)}</td><td>${niceDate(j.date)}</td><td><span class="pill ${j.status==='Completed'?'good':j.status==='In Progress'?'warn':'danger'}">${esc(j.status)}</span></td>${change?`<td>${j.status!=='Completed'?`<button class="button small ghost" data-action="advance-job" data-id="${esc(j.id)}">${j.status==='Pending'?'START':'COMPLETE'}</button>`:'<span class="text-muted">—</span>'}<button class="button small ghost" data-action="edit-job" data-id="${esc(j.id)}">EDIT</button><button class="button small ghost" data-action="delete-job" data-id="${esc(j.id)}">DELETE</button></td>`:''}</tr>`).join('')}</tbody></table>`:`<div class="empty-state"><h3>No jobs yet</h3><p>Add a service job to begin tracking work.</p></div>`;}
  function customersPage(){return `${head('WORKSHOP // CLIENT REGISTRY','Customers','Maintain digital customer and motorcycle profiles.',button('add-customer','ADD CUSTOMER'))}<div class="shop-summary">${metric('REGISTERED CUSTOMERS',num(state.customers.length),'RIDERS','users')}${metric('CUSTOMER MOTORCYCLES',num(state.customers.length),'BIKES','bike')}${metric('ACTIVE WORK ORDERS',num(state.jobs.filter(j=>j.status!=='Completed').length),'JOBS','wrench')}${metric('APPOINTMENT QUEUE',num(state.appointments.length),'TOTAL','calendar')}</div><section class="panel table-panel"><div class="panel-head"><div><div class="label">RIDER DIRECTORY</div><h2>Customer Records</h2></div></div>${state.customers.length?`<table class="data-table"><thead><tr><th>Customer</th><th>Motorcycle</th><th>Odometer</th><th>Last Visit</th><th>Contact</th><th>Action</th></tr></thead><tbody>${state.customers.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.motorcycle)}</td><td>${num(c.odometer)} KM</td><td>${niceDate(c.lastVisit)}</td><td>${esc(c.contact)}</td><td><button class="button small ghost" data-action="edit-customer" data-id="${esc(c.id)}">EDIT</button><button class="button small ghost" data-action="delete-customer" data-id="${esc(c.id)}">DELETE</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty-state"><h3>No customers</h3></div>'}</section>`;}
  function jobsPage(){return `${head('WORKSHOP // SERVICE PROCESSOR','Service Jobs','Track and update repair and servicing work orders.',button('add-job','NEW JOB'))}<section class="panel table-panel"><div class="panel-head"><div><div class="label">WORK ORDER CONTROL</div><h2>Active & Completed Jobs</h2></div></div>${jobsTable(state.jobs)}</section>`;}
  function bookingsPage(){
    const connected=(state.connections||[]).filter(x=>x.status==='accepted');
    const bookings=state.riderAppointments||[];
    const canBook=connected.length>0&&state.bikes.length>0;
    return head('RIDER // SERVICE REQUESTS','My Bookings','Request appointments, check workshop decisions, and manage your bookings.',
      canBook?button('request-appointment','REQUEST APPOINTMENT','calendar'):'')+
      '<div class="alert-strip">'+icon('info')+' Requests start as PENDING. A workshop may CONFIRM or DECLINE each request. Times are not reserved until confirmation.</div>'+
      (!connected.length?'<div class="panel empty-state"><h3>Connect to a workshop first</h3><p>Open Repair Shops and request a connection. The workshop must approve it before you can request an appointment.</p><a class="button primary" href="#/rider/connections">FIND REPAIR SHOPS</a></div>':'')+
      (!state.bikes.length?'<div class="panel empty-state"><h3>Add a motorcycle first</h3><p>Choose the motorcycle that will receive the requested service.</p><a class="button primary" href="#/rider/motorcycles">MY MOTORCYCLES</a></div>':'')+
      '<section class="panel appointment-requests"><div class="panel-head"><div><div class="label">RIDER APPOINTMENT REQUESTS // '+bookings.length+' TOTAL</div><h2>Request History</h2></div></div>'+
      (bookings.length?'<div class="booking-list">'+bookings.map(b=>
        '<article class="booking-item"><div class="booking-item-main"><span class="label">'+esc(b.shopName)+'</span><h3>'+esc(b.service)+'</h3><p>'+esc(b.bikeModel)+' · '+niceDate(b.date)+' · '+esc(b.time)+' (Philippine time)</p>'+
        (b.notes?'<p class="text-muted">Your note: '+esc(b.notes)+'</p>':'')+(b.reviewNote?'<p class="booking-review-note">Workshop response: '+esc(b.reviewNote)+'</p>':'')+'</div>'+
        '<div class="booking-item-actions"><span class="pill '+(b.status==='Cancelled'||b.status==='Declined'?'danger':b.status==='Confirmed'||b.status==='Completed'?'good':'warn')+'">'+esc(b.status)+'</span>'+
        (['Pending','Confirmed'].includes(b.status)?'<button type="button" class="button small ghost" data-action="cancel-rider-appointment" data-id="'+esc(b.id)+'">'+(b.status==='Confirmed'?'CANCEL BOOKING':'CANCEL REQUEST')+'</button>':'')+'</div></article>'
      ).join('')+'</div>':'<div class="empty-state"><h3>No requests yet</h3><p>Request an appointment from a workshop after your connection is approved.</p></div>')+'</section>';
  }
  function riderRequestsForShop(){
    const all=state.riderAppointments||[];
    const pending=all.filter(x=>x.status==='Pending'),confirmed=all.filter(x=>x.status==='Confirmed');
    const completed=all.filter(x=>x.status==='Completed');
    const renderBooking=b=>'<article class="booking-item"><div class="booking-item-main">'+
      '<span class="label">RIDER // '+esc(b.riderName)+'</span><h3>'+esc(b.service)+'</h3>'+
      '<p>'+esc(b.bikeModel)+' · '+niceDate(b.date)+' · '+esc(b.time)+' (Philippine time)</p>'+
      (b.notes?'<p class="text-muted">Rider note: '+esc(b.notes)+'</p>':'')+
      (b.reviewNote?'<p class="booking-review-note">Workshop response: '+esc(b.reviewNote)+'</p>':'')+
      '</div><div class="booking-item-actions"><span class="pill '+(b.status==='Cancelled'||b.status==='Declined'?'danger':b.status==='Confirmed'||b.status==='Completed'?'good':'warn')+'">'+esc(b.status)+'</span>'+
      (['Pending','Confirmed'].includes(b.status)?'<button type="button" class="button small '+(b.status==='Pending'?'primary':'ghost')+'" data-action="review-rider-booking" data-id="'+esc(b.id)+'">'+(b.status==='Pending'?'REVIEW REQUEST':'UPDATE STATUS')+'</button>':'')+
      '</div></article>';
    return '<section class="panel rider-request-panel">'+
      '<div class="panel-head"><div><div class="label">PHASE 4.4 // WORKSHOP BOOKING DECISIONS</div><h2>Rider Appointment Management</h2></div></div>'+
      '<div class="booking-kpis">'+metric('PENDING REQUESTS',String(pending.length),'TO REVIEW','calendar')+
      metric('CONFIRMED',String(confirmed.length),'BOOKINGS','checkCircle')+
      metric('COMPLETED',String(completed.length),'VISITS','wrench')+'</div>'+
      '<p class="text-muted">Review rider requests here. Confirming blocks the same exact time for other rider requests at your shop. It does not reserve a staffing capacity or guarantee service duration.</p>'+
      (all.length?'<div class="booking-list">'+[...all].sort((a,b)=>Number(a.status!=='Pending')-Number(b.status!=='Pending')||a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).map(renderBooking).join('')+'</div>':
       '<div class="empty-state"><p>No rider appointment requests yet.</p></div>')+'</section>';
  }
  function appointmentsPage(){return `${head('WORKSHOP // TIME CONTROL','Appointments','Review rider requests and manage manual customer appointments.',button('add-appointment','BOOK APPOINTMENT'))}${riderRequestsForShop()}<section class="panel table-panel"><div class="panel-head"><div><div class="label">SCHEDULED SERVICE QUEUE</div><h2>Upcoming Appointments</h2></div></div>${state.appointments.length?`<table class="data-table"><thead><tr><th>Customer</th><th>Requested Service</th><th>Date</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>${[...state.appointments].sort((a,b)=>a.date.localeCompare(b.date)).map(a=>`<tr><td><strong>${esc(customerName(a.customerId))}</strong></td><td>${esc(a.service)}</td><td>${niceDate(a.date)}</td><td>${esc(a.time)}</td><td><span class="pill ${a.status==='Confirmed'?'good':'warn'}">${esc(a.status)}</span></td><td>${a.status==='Pending'?`<button class="button small ghost" data-action="confirm-appointment" data-id="${esc(a.id)}">CONFIRM</button>`:''}${a.status==='Confirmed'?`<button class="button small ghost" data-action="complete-appointment" data-id="${esc(a.id)}">COMPLETE</button>`:''}<button class="button small ghost" data-action="edit-appointment" data-id="${esc(a.id)}">EDIT</button><button class="button small ghost" data-action="delete-appointment" data-id="${esc(a.id)}">DELETE</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty-state"><h3>No appointments</h3></div>'}</section>`;}
  function reportsPage(){const jobs=state.jobs,done=jobs.filter(x=>x.status==='Completed'),val=done.reduce((a,x)=>a+Number(x.cost),0),avg=done.length?val/done.length:0;const row=[['Completed Services',done.length],['Open Services',jobs.length-done.length],['Registered Riders',state.customers.length],['Scheduled Appointments',state.appointments.length]];return `${head('WORKSHOP // DATA INTELLIGENCE','Service Reports','A simple overview of recorded shop activity.',`<button class="button small" data-action="export-jobs">${icon('download')} EXPORT JOBS</button>`)}<div class="shop-summary">${metric('COMPLETED JOBS',num(done.length),'TOTAL','checkCircle')}${metric('RECORDED JOB VALUE',cash(val),'PHP','chart')}${metric('AVG COMPLETED JOB',cash(avg),'PHP','speed')}${metric('ACTIVE CUSTOMER COUNT',num(state.customers.length),'RIDERS','users')}</div><div class="content-grid"><section class="panel"><div class="panel-head"><div><div class="label">WORKSHOP OPERATIONS</div><h2>Activity Breakdown</h2></div></div>${row.map(([name,n])=>`<div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line-soft);padding:15px 0"><span class="text-muted">${esc(name)}</span><strong class="text-cyan">${num(n)}</strong></div>`).join('')}</section><section class="panel"><div class="panel-head"><div><div class="label">REPORT NOTICE</div><h2>Live Account Report</h2></div></div><p class="text-muted">These totals summarize service jobs and customers stored for your shop account. Job values are estimates, not verified payments or invoices.</p><div class="quick-actions"><button class="button small" data-action="export-jobs">${icon('download')} DOWNLOAD CSV</button></div></section></div>`;}
  function connectionsPage(role){
    const links=state.connections||[];
    if(role==='rider'){
      const byShop=new Map(links.map(x=>[x.shopId,x]));
      const shops=shopResults===null?(state.shops||[]):shopResults;
      const serviceOptions='<option value="">All services</option>'+SHOP_SERVICES.map(s=>'<option value="'+esc(s)+'" '+(shopFilters.service===s?'selected':'')+'>'+esc(s)+'</option>').join('');
      return head('RIDER // WORKSHOP DISCOVERY','Find Repair Shops','Search registered MotoKare workshops by name, city, or available services.')+
        '<div class="alert-strip">'+icon('shield')+' Workshop listings are owner-provided and unverified. Connecting does NOT share your motorcycle or maintenance records.</div>'+
        '<section class="panel shop-search-panel"><div class="panel-head"><div><div class="label">DISCOVERY FILTERS // 4.2</div><h2>Search Workshops</h2></div></div>'+
        '<form data-form="search-shops" class="shop-search-form"><div class="field"><label for="shop-search-term">Shop or keyword</label><input id="shop-search-term" name="query" maxlength="80" placeholder="e.g. Davao, repair" value="'+esc(shopFilters.query)+'"></div>'+
        '<div class="field"><label for="shop-search-city">City or municipality</label><input id="shop-search-city" name="city" maxlength="80" placeholder="e.g. Davao City" value="'+esc(shopFilters.city)+'"></div>'+
        '<div class="field"><label for="shop-search-service">Service offered</label><select id="shop-search-service" name="service">'+serviceOptions+'</select></div>'+
        '<div class="shop-search-actions"><button class="button primary small" type="submit">'+icon('filter')+' SEARCH</button><button class="button small ghost" data-action="reset-shop-search" type="button">CLEAR</button></div></form></section>'+
        '<div class="shop-result-label"><div class="label">WORKSHOP DIRECTORY // '+shops.length+' RESULT'+(shops.length===1?'':'S')+'</div><small>Up to 100 matches; no GPS tracking or verified business ratings.</small></div>'+
        '<div class="connection-grid shop-results">'+shops.map(shop=>{
          const link=byShop.get(shop.id),st=link?.status||'not connected';
          const act=!link?'<button class="button small primary" data-action="connect-shop" data-id="'+esc(shop.id)+'">REQUEST CONNECTION</button>':
            link.status==='pending'?'<button class="button small ghost" data-action="remove-connection" data-id="'+esc(link.id)+'">CANCEL REQUEST</button>':
            link.status==='accepted'?'<button class="button small primary" data-action="request-appointment" data-id="'+esc(shop.id)+'">REQUEST APPOINTMENT</button><button class="button small ghost" data-action="remove-connection" data-id="'+esc(link.id)+'">DISCONNECT</button>':
            '<button class="button small ghost" data-action="remove-connection" data-id="'+esc(link.id)+'">CLEAR DECLINED</button>';
          const location=[shop.city,shop.address].filter(Boolean).map(esc).join(' · ');
          const services=(shop.services||[]).map(s=>'<span class="shop-service-tag">'+esc(s)+'</span>').join('');
          return '<article class="panel connection-card shop-discovery-card"><div class="label">REGISTERED WORKSHOP // SELF-LISTED</div><h2>'+esc(shop.shopName)+'</h2>'+
            (location?'<p class="shop-location">'+icon('location')+' '+location+'</p>':'<p class="text-muted">Location not provided</p>')+
            (shop.description?'<p class="shop-description">'+esc(shop.description)+'</p>':'')+
            '<div class="shop-services">'+(services||'<span class="text-muted">Service categories not provided</span>')+'</div>'+
            '<div class="connection-meta"><span class="pill '+(st==='accepted'?'good':st==='pending'?'warn':'')+'">'+esc(st.toUpperCase())+'</span></div><div class="quick-actions">'+act+'</div></article>';
        }).join('')+'</div>'+
        (!shops.length?'<div class="panel empty-state"><h3>No workshops found</h3><p>Try removing filters, or ask a workshop to register and complete its public profile.</p></div>':'')+
        '<p class="connection-note">Riders can request appointments after the workshop accepts their connection. Live availability, GPS directions, ratings, and shared service records are not yet supported.</p>';
    }
    const pending=links.filter(x=>x.status==='pending'),accepted=links.filter(x=>x.status==='accepted'),declined=links.filter(x=>x.status==='declined');
    const list=(items,mode)=>items.length?'<div class="connection-list">'+items.map(x=>
      '<div class="panel connection-entry"><div><div class="label">RIDER ACCOUNT</div><h3>'+esc(x.riderName)+'</h3><span class="pill '+(x.status==='accepted'?'good':x.status==='pending'?'warn':'')+'">'+esc(x.status.toUpperCase())+'</span></div><div class="connection-actions">'+
      (mode==='pending'?'<button class="button small primary" data-action="approve-connection" data-id="'+esc(x.id)+'">APPROVE</button><button class="button small ghost" data-action="decline-connection" data-id="'+esc(x.id)+'">DECLINE</button>':'<button class="button small ghost" data-action="remove-connection" data-id="'+esc(x.id)+'">REMOVE</button>')+
      '</div></div>').join('')+'</div>':'<div class="panel empty-state"><p>No '+mode+' rider connections.</p></div>';
    return head('WORKSHOP // RIDER NETWORK','Rider Connections','Review connection requests from signed-in MotoKare riders.')+
      '<div class="shop-summary">'+metric('PENDING REQUESTS',num(pending.length),'REQUESTS','users')+metric('LINKED RIDERS',num(accepted.length),'RIDERS','checkCircle')+'</div>'+
      '<section class="connection-section"><div class="panel-head"><div><div class="label">ACTION REQUIRED</div><h2>Incoming Requests</h2></div></div>'+list(pending,'pending')+'</section>'+
      '<section class="connection-section"><div class="panel-head"><div><div class="label">CONNECTED</div><h2>Linked Riders</h2></div></div>'+list(accepted,'accepted')+'</section>'+
      (declined.length?'<section class="connection-section"><div class="panel-head"><div><h2>Declined Requests</h2></div></div>'+list(declined,'declined')+'</section>':'')+
      '<p class="connection-note">A connection never shares maintenance history or automatically creates shop customer records. Riders may submit separate appointment requests after approval.</p>';
  }
  function shopProfileSettings(){
    const p=state.shopProfile||{city:'',address:'',description:'',services:[]};
    const options=SHOP_SERVICES.map((s,i)=>'<label class="shop-service-option"><input type="checkbox" name="service_'+i+'" value="1" '+((p.services||[]).includes(s)?'checked':'')+'> '+esc(s)+'</label>').join('');
    return '<section class="panel shop-public-profile"><div class="panel-head"><div><div class="label">WORKSHOP // PUBLIC DISCOVERY PROFILE</div><h2>Workshop Listing</h2></div></div>'+
      '<p class="connection-note">These details will appear to signed-in MotoKare riders. Only provide a business location you want visible to them. Leave optional fields blank if preferred.</p>'+
      '<form data-form="shop-profile"><div class="form-grid">'+
      field('city','City / municipality (public, optional)','text',p.city||'','maxlength="80" placeholder="e.g. Davao City"')+
      field('address','Business address (public, optional)','text',p.address||'','maxlength="160" placeholder="e.g. Shop location, street"')+'</div>'+
      '<div class="field"><label for="shop-public-description">Description of your workshop (public, optional)</label><textarea id="shop-public-description" name="description" maxlength="500" rows="3" placeholder="Describe your services and specializations">'+esc(p.description||'')+'</textarea></div>'+
      '<fieldset class="shop-service-fieldset"><legend>Services offered (select all that apply)</legend><div class="shop-service-options">'+options+'</div></fieldset>'+
      '<button class="button primary" type="submit">'+icon('check')+' SAVE WORKSHOP LISTING</button></form></section>';
  }
  function settingsPage(role){return `${head('SYSTEM // USER PREFERENCES','Settings','Manage your secure MotoKare account.')}${role==='shop'?shopProfileSettings():''}<div class="content-grid"><section class="panel"><div class="panel-head"><div><div class="label">USER PARAMETERS</div><h2>Profile Settings</h2></div></div><form data-form="settings"><div class="field"><label for="settings-name">Display name</label><input name="name" id="settings-name" value="${esc(state.session?.name||'')}" minlength="2" required></div><div class="field"><label for="settings-email">Email address</label><input name="email" id="settings-email" value="${esc(state.session?.email||'')}" type="email" required></div>${role==='shop'?`<div class="field"><label for="settings-shop">Workshop name</label><input name="shopName" id="settings-shop" value="${esc(state.settings.shopName)}" required></div>`:''}<button class="button primary" type="submit">${icon('check')} SAVE SETTINGS</button></form></section><section class="panel"><div class="panel-head"><div><div class="label">ACCOUNT SECURITY</div><h2>Change Password</h2></div></div><form data-form="password"><div class="field"><label for="pw-current">Current password</label><input id="pw-current" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="pw-new">New password (10+ characters)</label><input id="pw-new" name="newPassword" type="password" autocomplete="new-password" minlength="10" required></div><button type="submit" class="button">${icon('shield')} CHANGE PASSWORD</button></form><div style="border-top:1px solid var(--line-soft);margin-top:25px;padding-top:20px"><span class="pill good">SERVER DATABASE CONNECTED</span><p style="color:#95BBCB;font-size:11px;margin-top:12px">Your account records are stored in PostgreSQL and protected by server-side permissions. Service reminders appear inside MotoKare; email/SMS delivery has not been configured.</p></div></section></div>`;}
  function notifications(){if(!notifyOpen)return '';const a=state.role==='shop'?[...state.appointments.filter(x=>x.status==='Pending').map(x=>`${esc(customerName(x.customerId))}: appointment awaiting confirmation.`),...state.connections.filter(x=>x.status==='pending').map(x=>`${esc(x.riderName)} requested a workshop connection.`),...state.riderAppointments.filter(x=>x.status==='Pending').map(x=>`${esc(x.riderName)} requested ${esc(x.service)} on ${esc(x.date)} at ${esc(x.time)}.`)]:allAlerts().slice(0,6).map(x=>`${esc(x.c.name)}: ${x.label.toLowerCase()} (${remainingLabel(x.days)}).`);return `<aside class="notify-panel" role="dialog" aria-label="Notifications" aria-modal="false"><div class="label">SYSTEM NOTIFICATIONS</div><h3>Attention Queue</h3>${a.length?a.map(x=>`<p>${x}</p>`).join(''):'<div class="notification-empty">No alerts. Everything looks on track.</div>'}</aside>`;}
  function render(){route=routeNow();if(!loaded){app.innerHTML='<main class="container" style="padding:8rem 1rem"><div class="label">CONNECTING TO MOTOKARE SERVER...</div></main>';return;}if(route.startsWith('/rider/')||route.startsWith('/shop/')){if(!state.session){navigate('/login');return;}const role=parseAppRoute(route).role;if(role!==state.session.mode){navigate('/'+state.session.mode+'/dashboard');return;}}document.body.classList.remove('app-mode');let content;if(route==='/'||route==='/home')content=landing();else if(route==='/login'||route==='/register')content=authPage(route.slice(1));else{const {role,page}=parseAppRoute(route),valid=(role==='rider'?routesRider:routesShop).map(x=>x[0]);if(!valid.includes(page)){navigate('/');return;}const contentMap=role==='rider'?{dashboard:riderDash,motorcycles:motorcyclesPage,components:componentsPage,maintenance:maintenancePage,history:historyPage,connections:()=>connectionsPage('rider'),bookings:bookingsPage,settings:()=>settingsPage('rider')}:{dashboard:shopDash,customers:customersPage,jobs:jobsPage,appointments:appointmentsPage,reports:reportsPage,connections:()=>connectionsPage('shop'),settings:()=>settingsPage('shop')};content=appShell(role,page,contentMap[page]());}
    app.innerHTML=content + notifications();document.title=`MotoKare | ${route==='/'?'Ride Smart. Maintain Better.':route==='/login'?'Log In':route==='/register'?'Register':breadcrumb(route.split('/').pop())}`;
    // Move keyboard focus only after route navigation initiated by user; avoid auto-scrolling on initial load.
  }
  function field(name,title,type='text',value='',extra=''){return `<div class="field"><label for="f-${name}">${title}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;}
  function selectField(name,title,options,sel,required=true){return `<div class="field"><label for="f-${name}">${title}</label><select id="f-${name}" name="${name}" ${required?'required':''}>${options.map(o=>{const [value,label]=Array.isArray(o)?o:[o,o];return `<option value="${esc(value)}" ${sel===value?'selected':''}>${esc(label)}</option>`;}).join('')}</select></div>`;}
  let lastFocus=null;
  function openModal(type,id=''){
    let title='',subtitle='',fields='',submit='SAVE RECORD',record=null;
    if(type==='add-bike'||type==='edit-bike'){record=state.bikes.find(b=>b.id===id)||null;title=record?'Edit Motorcycle':'Add Motorcycle';subtitle='Enter motorcycle details to maintain a service profile.';fields=`${field('model','Motorcycle make & model','text',record?.model||'','required maxlength="70"') }<div class="form-grid">${field('year','Model year','number',record?.year||2024,'min="1950" max="2100" required')}${field('plate','Plate number (optional)','text',record?.plate||'','maxlength="25"')}</div>`;submit=record?'SAVE CHANGES':'ADD MOTORCYCLE';}
    else if(type==='add-component'||type==='edit-component'){
      const b=ensureBike();if(!b)return toast('Add a motorcycle before adding components.');
      record=type==='edit-component'?state.components.find(c=>c.id===id):null;
      if(type==='edit-component'&&(!record||record.archived))return toast('Restore this component before editing it.');
      const isEdit=Boolean(record),mode=record?.lastServiceDate?'last':'next';
      title=isEdit?'Edit Component':'Add Component';subtitle=isEdit?'Update component settings and maintenance reminders.':'Choose a catalog item or create a custom maintenance component.';
      const taken=new Set(activeComps(b.id).map(c=>c.name.toLowerCase()));
      const available=(state.componentCatalog||[]).filter(x=>!taken.has(x.name.toLowerCase()));
      const options=available.map(x=>[x.name,x.name+' · suggested '+x.suggestedDays+' days']);
      if(!isEdit){
        fields='<div class="component-source-tabs"><label class="component-choice"><input type="radio" name="source" value="catalog" checked> FROM CATALOG</label>'+
          '<label class="component-choice"><input type="radio" name="source" value="custom"> CUSTOM COMPONENT</label></div>'+
          '<div data-component-panel="catalog">'+selectField('catalogName','Catalog item',options,options[0]?.[0])+'</div>'+
          '<div data-component-panel="custom" class="hidden">'+field('name','Custom component name','text','','maxlength="70" minlength="2" disabled')+'</div>';
      }else{
        fields=record.source==='custom'?field('name','Custom component name','text',record.name,'required maxlength="70" minlength="2"'):
          '<div class="field"><label>Component</label><strong>'+esc(record.name)+'</strong><small class="text-muted">Catalog or default component names are fixed.</small></div>';
      }
      fields+='<div class="form-grid">'+field('intervalDays','Service interval (days)','number',record?.intervalDays||available[0]?.suggestedDays||90,'min="1" max="3650" required')+
        selectField('dateMode','Schedule based on',[['next','Next due date (last service unknown)'],['last','Known last service date']],mode)+'</div>'+
        '<div data-component-date="last" class="'+(mode==='last'?'':'hidden')+'">'+field('lastServiceDate','Last service date','date',record?.lastServiceDate||today(),(mode==='last'?'required ':'disabled ')+`max="${today()}"`)+'</div>'+
        '<div data-component-date="next" class="'+(mode==='next'?'':'hidden')+'">'+field('dueDate','Next planned service date','date',record?.dueDate||dateShift(90),(mode==='next'?'required':'disabled'))+'</div>'+
        '<div class="field"><label for="f-component-notes">Notes (optional)</label><textarea id="f-component-notes" name="notes" maxlength="300" rows="3" placeholder="Parts, servicing details or reminders">'+esc(record?.notes||'')+'</textarea></div>'+
        '<p class="component-schedule-preview">Due date: <strong data-component-preview>Set schedule above</strong></p>'+
        '<p class="text-muted" style="font-size:11px">Suggested catalog intervals are examples only, not verified manufacturer specifications.</p>';
      submit=isEdit?'SAVE COMPONENT':'ADD COMPONENT';
    }

    else if(type==='log-service'){const b=ensureBike();if(!b)return toast('Please add a motorcycle first.');title='Record Maintenance';subtitle='Record completed service for an active component to update its due date.';const options=activeComps(b.id).map(c=>[c.id,c.name]).concat([['','Other Service (without scheduled component)']]);fields=`${selectField('componentId','Serviced component',options,options[0]?.[0],false)}<div class="form-grid">${field('date','Service completed on','date',today(),`max="${today()}" required`)}</div><div class="form-grid">${field('cost','Cost (PHP)','number',0,'min="0" step="0.01" required')}${field('shop','Workshop name','text','Self / Local Mechanic','required maxlength="70"')}</div><div class="field"><label for="f-notes">Notes (optional)</label><textarea id="f-notes" name="notes" maxlength="300" placeholder="Parts changed, observations, or details"></textarea></div>`;submit='SAVE SERVICE ENTRY';}
    else if(type==='add-customer'||type==='edit-customer'){record=type==='edit-customer'?state.customers.find(c=>c.id===id):null;title=record?'Edit Customer':'Register Customer';subtitle='Maintain this workshop customer record.';fields=`${field('name','Customer name','text',record?.name||'','required maxlength="80"')}${field('contact','Email or contact information','text',record?.contact||'','required maxlength="100"')}${field('motorcycle','Motorcycle model','text',record?.motorcycle||'','required maxlength="80"')}${field('odometer','Current mileage (km)','number',record?.odometer??0,'min="0" required')}`;submit=record?'SAVE CUSTOMER':'REGISTER CUSTOMER';}
    else if(type==='add-job'||type==='edit-job'){if(!state.customers.length)return toast('Add a customer before creating a job.');record=type==='edit-job'?state.jobs.find(j=>j.id===id):null;title=record?'Edit Service Job':'Create Service Job';subtitle='Manage customer work orders and estimates.';fields=`${selectField('customerId','Customer',state.customers.map(c=>[c.id,c.name+' • '+c.motorcycle]),record?.customerId)}${field('service','Service description','text',record?.service||'','required maxlength="100"')}<div class="form-grid">${field('date','Job date','date',record?.date||today(),'required')}${field('cost','Estimated cost (PHP)','number',record?.cost??0,'min="0" step="0.01" required')}</div>${selectField('status','Job status',record?.status==='Completed'?['Completed']:record?.status==='In Progress'?['In Progress','Completed']:['Pending','In Progress','Completed'],record?.status||'Pending')}`;submit=record?'SAVE JOB':'CREATE SERVICE JOB';}
    else if(type==='request-appointment'){
      const available=(state.connections||[]).filter(x=>x.status==='accepted');
      if(!available.length)return toast('Connect with a workshop and receive approval before booking.');
      if(!state.bikes.length)return toast('Add a motorcycle before requesting an appointment.');
      const preset=available.find(x=>x.shopId===id)?.shopId||available[0].shopId;
      title='Request Appointment';subtitle='Submit a proposed visit date and time to a connected workshop. The request will be pending, not confirmed.';
      fields=selectField('shopId','Connected workshop',available.map(x=>[x.shopId,x.shopName]),preset)+
        selectField('bikeId','Motorcycle',state.bikes.map(x=>[x.id,x.model+' · '+x.year]),state.selectedBike)+
        field('service','Requested service','text','','minlength="2" maxlength="100" placeholder="e.g. Oil Change" required')+
        '<div class="form-grid">'+field('date','Preferred visit date','date',dateShift(1),`min="${today()}" required`)+
        field('time','Preferred time (Philippine time)','time','09:00','required')+'</div>'+
        '<div class="field"><label for="f-booking-notes">Details for the workshop (optional)</label><textarea name="notes" id="f-booking-notes" maxlength="300" rows="3" placeholder="Describe the requested service (avoid sensitive information)"></textarea></div>'+
        '<p class="text-muted">The requested time is not guaranteed. The workshop will review pending requests in a later phase.</p>';
      submit='SEND REQUEST';
    }
    else if(type==='review-rider-booking'){
      record=state.riderAppointments.find(b=>b.id===id);
      if(!record)return toast('Appointment request not found.');
      const choices=record.status==='Pending'?[['Confirmed','Confirm Appointment'],['Declined','Decline Request']]:
        record.status==='Confirmed'?[['Completed','Mark Completed'],['Cancelled','Cancel Confirmed Booking']]:[];
      if(!choices.length)return toast('This appointment cannot be updated.');
      title=record.status==='Pending'?'Review Rider Request':'Update Rider Booking';
      subtitle=record.riderName+' · '+record.bikeModel+' · '+record.service+' · '+niceDate(record.date)+' at '+record.time+' (Philippine time)';
      fields=selectField('status','Workshop decision',choices,choices[0][0])+
        '<div class="field"><label for="f-review-note">Message to rider (optional)</label><textarea id="f-review-note" name="reviewNote" maxlength="250" rows="3" placeholder="e.g. We can service your motorcycle at this time.">'+esc(record.reviewNote||'')+'</textarea></div>'+
        '<p class="text-muted">A confirmed appointment occupies this exact workshop date and time. Other requests at this time will need different arrangements.</p>';
      submit='SAVE DECISION';
    }
    else if(type==='add-appointment'||type==='edit-appointment'){if(!state.customers.length)return toast('Add a customer before booking.');record=type==='edit-appointment'?state.appointments.find(a=>a.id===id):null;title=record?'Edit Appointment':'Book Appointment';subtitle='Schedule and update a customer visit.';fields=`${selectField('customerId','Customer',state.customers.map(c=>[c.id,c.name+' • '+c.motorcycle]),record?.customerId)}${field('service','Requested service','text',record?.service||'','required maxlength="100"')}<div class="form-grid">${field('date','Date','date',record?.date||dateShift(1),'required')}${field('time','Time','time',record?.time||'09:00','required')}</div>${record?selectField('status','Appointment status',['Pending','Confirmed','Completed','Cancelled'],record.status):''}`;submit=record?'SAVE APPOINTMENT':'BOOK APPOINTMENT';}
    else return;
    lastFocus=document.activeElement;
    modalRoot.innerHTML=`<div class="overlay" data-action="overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button type="button" class="icon-button modal-close" data-action="close-modal" aria-label="Close dialog">${icon('x')}</button><div class="label">MOTOKARE // DATA ENTRY</div><h2 id="modal-title">${title}</h2><p class="modal-sub">${subtitle}</p><form data-form="${type}" data-id="${esc(id)}">${fields}<div class="form-footer"><button type="button" class="button ghost" data-action="close-modal">CANCEL</button><button type="submit" class="button primary">${icon('check')} ${submit}</button></div></form></section></div>`;
    if(type==='add-component'||type==='edit-component')syncComponentModal();
    $('#modal-root .modal-close')?.focus();document.body.style.overflow='hidden';
  }
  function syncComponentModal(){
    const form=modalRoot.querySelector?.('form[data-form="add-component"],form[data-form="edit-component"]');
    if(!form)return;
    const selected=form.querySelector('input[name="source"]:checked')?.value||'catalog';
    for(const name of ['catalog','custom']){
      const panel=form.querySelector('[data-component-panel="'+name+'"]');
      if(!panel)continue;
      panel.classList.toggle('hidden',selected!==name);
      for(const el of panel.querySelectorAll('input,select'))el.disabled=selected!==name;
    }
    const mode=form.querySelector('[name="dateMode"]')?.value||'next';
    for(const name of ['last','next']){
      const panel=form.querySelector('[data-component-date="'+name+'"]');
      if(!panel)continue;
      panel.classList.toggle('hidden',mode!==name);
      for(const el of panel.querySelectorAll('input')){el.disabled=mode!==name;el.required=mode===name;}
    }
    const interval=Number(form.querySelector('[name="intervalDays"]')?.value||0);
    const sourceDate=mode==='last'?form.querySelector('[name="lastServiceDate"]')?.value:form.querySelector('[name="dueDate"]')?.value;
    let preview='Choose a date and service interval';
    if(/^\d{4}-\d{2}-\d{2}$/.test(sourceDate||'')&&Number.isInteger(interval)&&interval>=1&&interval<=3650){
      const d=new Date(sourceDate+'T12:00:00Z');
      if(mode==='last')d.setUTCDate(d.getUTCDate()+interval);
      preview=d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
    }
    const output=form.querySelector('[data-component-preview]');
    if(output)output.textContent=preview;
  }
  function closeModal(){modalRoot.innerHTML='';document.body.style.overflow='';lastFocus?.focus?.();}
  function formVal(form){const d=new FormData(form);return Object.fromEntries(d.entries());}
  async function handleForm(form){
    const type=form.dataset.form,v=formVal(form),id=form.dataset.id;
    if(type==='login'||type==='register'){
      const role=state.role;
      const data=type==='register'?{role,fullName:v.fullName,email:v.email,password:v.password,shopName:v.shopName}:{role,email:v.email,password:v.password};
      try{await api('/auth/'+type,'POST',data);await refresh();navigate('/'+state.role+'/dashboard');toast(type==='register'?'Account created. Welcome to MotoKare.':'Signed in successfully.');}
      catch(error){toast(error.message);}return;
    }
    if(type==='settings'){await persist('/me','PATCH',{name:v.name,email:v.email,shopName:v.shopName},'Account settings updated.',{close:false});return;}
    if(type==='shop-profile'){
      const services=SHOP_SERVICES.filter((_,i)=>v['service_'+i]==='1');
      await persist('/shops/profile','PATCH',{city:v.city||'',address:v.address||'',description:v.description||'',services},'Public workshop listing saved.',{close:false});return;
    }
    if(type==='search-shops'){
      shopFilters={query:v.query||'',city:v.city||'',service:v.service||''};
      try{shopResults=(await api(shopSearchUrl())).shops;render();}catch(error){toast(error.message);}
      return;
    }
    if(type==='password'){const ok=await persist('/me/password','PATCH',{currentPassword:v.currentPassword,newPassword:v.newPassword},'Password changed; other sessions signed out.',{close:false});if(ok)form.reset();return;}
    const bike=ensureBike();
    if(type==='add-bike'||type==='edit-bike'){
      // Keep API compatibility: the date-based form hides mileage, but the legacy bike model still stores it.
      // Preserve an existing reading on edits; use zero for newly created motorcycles.
      const storedOdometer=state.bikes.find(b=>b.id===id)?.odometer??0;
      const odometer=v.odometer===undefined||v.odometer===''?storedOdometer:Number(v.odometer);
      const payload={model:v.model,year:Number(v.year),plate:v.plate,odometer};
      const success=await persist(type==='edit-bike'?'/bikes/'+encodeURIComponent(id):'/bikes',type==='edit-bike'?'PATCH':'POST',payload,type==='edit-bike'?'Motorcycle details updated.':'Motorcycle added to your garage.');
      if(success&&type==='add-bike'){state.selectedBike=state.bikes[0]?.id;render();}return;
    }
    if(type==='add-component'||type==='edit-component'){
      if(!bike)return toast('Add a motorcycle first.');
      const payload={intervalDays:Number(v.intervalDays),notes:v.notes||'',
        lastServiceDate:v.dateMode==='last'?v.lastServiceDate:null,
        ...(v.dateMode==='next'?{dueDate:v.dueDate}:{})};
      if(type==='add-component'){
        payload.bikeId=bike.id;payload.source=v.source;
        if(v.source==='catalog')payload.catalogName=v.catalogName;else payload.name=v.name;
      }else{
        const item=state.components.find(c=>c.id===id);
        if(item?.source==='custom')payload.name=v.name;
      }
      await persist(type==='add-component'?'/components':'/components/'+encodeURIComponent(id),type==='add-component'?'POST':'PATCH',payload,
        type==='add-component'?'Maintenance component added.':'Component schedule updated.');
      return;
    }

    if(type==='log-service'){if(!bike)return toast('Add a motorcycle first.');await persist('/services','POST',{bikeId:bike.id,...(v.componentId?{componentId:v.componentId}:{type:'Other Service'}),date:v.date,cost:Number(v.cost),shop:v.shop,notes:v.notes||''},'Service recorded and interval updated.');return;}
    if(type==='add-customer'||type==='edit-customer'){await persist(type==='edit-customer'?'/customers/'+encodeURIComponent(id):'/customers',type==='edit-customer'?'PATCH':'POST',{name:v.name,contact:v.contact,motorcycle:v.motorcycle,odometer:Number(v.odometer)},type==='edit-customer'?'Customer updated.':'Customer added to your shop.');return;}
    if(type==='add-job'||type==='edit-job'){await persist(type==='edit-job'?'/jobs/'+encodeURIComponent(id):'/jobs',type==='edit-job'?'PATCH':'POST',{customerId:v.customerId,service:v.service,date:v.date,status:v.status,cost:Number(v.cost)},type==='edit-job'?'Service job updated.':'Service job created.');return;}
    if(type==='request-appointment'){
      const ok=await persist('/rider-appointments','POST',{shopId:v.shopId,bikeId:v.bikeId,service:v.service,date:v.date,time:v.time,notes:v.notes||''},
        'Appointment request submitted. Await workshop review.');
      if(ok)navigate('/rider/bookings');return;
    }
    if(type==='review-rider-booking'){
      await persist('/rider-appointments/'+encodeURIComponent(id),'PATCH',
        {status:v.status,reviewNote:v.reviewNote||''},'Rider booking updated to '+v.status+'.');return;
    }
    if(type==='add-appointment'||type==='edit-appointment'){await persist(type==='edit-appointment'?'/appointments/'+encodeURIComponent(id):'/appointments',type==='edit-appointment'?'PATCH':'POST',{customerId:v.customerId,service:v.service,date:v.date,time:v.time,status:v.status},type==='edit-appointment'?'Appointment updated.':'Appointment booked.');return;}
  }
  function downloadCsv(name,rows){if(!rows.length){toast('No records to export.');return;}const keys=Object.keys(rows[0]);const csv=[keys.join(','),...rows.map(r=>keys.map(k=>'"'+String(r[k]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('CSV export prepared.');}
  async function clickAction(el,e){const a=el.dataset.action;const id=el.dataset.id;
    if(a==='overlay'){if(e.target===el)closeModal();return;}
    if(a==='close-modal'){closeModal();return;}
    if(a==='sidebar-toggle'){mobileOpen=!mobileOpen;render();return;}
    if(a==='sidebar-close'){mobileOpen=false;render();return;}
    if(a==='mobile-nav'){const n=$('#site-nav');n?.classList.toggle('open');el.setAttribute('aria-expanded',n?.classList.contains('open')?'true':'false');return;}
    if(a==='scroll'){e.preventDefault();if(routeNow()!=='/'){navigate('/');setTimeout(()=>$('#'+el.dataset.target)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'}),20);}else{$('#site-nav')?.classList.remove('open');$('#'+el.dataset.target)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}return;}
    if(a==='auth-role'){state.role=el.dataset.role;render();return;}
    if(a==='switch-role'){try{await api('/auth/logout','POST');shopResults=null;shopFilters={query:'',city:'',service:''};state.session=null;state.role=el.dataset.role;mobileOpen=false;notifyOpen=false;navigate('/login');toast('Sign in with a '+(state.role==='shop'?'workshop':'rider')+' account to switch.');}catch(error){toast(error.message);}return;}
    if(a==='notifications'){notifyOpen=!notifyOpen;render();return;}
    if(a==='logout'){try{await api('/auth/logout','POST');shopResults=null;shopFilters={query:'',city:'',service:''};state.session=null;mobileOpen=false;notifyOpen=false;navigate('/');toast('Signed out successfully.');}catch(error){toast(error.message);}return;}
    if(['add-bike','edit-bike','add-component','edit-component','log-service','add-customer','edit-customer','add-job','edit-job','add-appointment','edit-appointment','request-appointment','review-rider-booking'].includes(a)){openModal(a,id);return;}
    if(a==='archive-component'||a==='restore-component'){
      const archived=a==='archive-component';
      if(archived&&!confirm('Archive this component? Its reminders will be paused, and you can restore it later.'))return;
      await persist('/components/'+encodeURIComponent(id)+'/archive','PATCH',{archived},archived?'Component archived.':'Component restored.',{close:false});return;
    }
    if(a==='delete-component'){
      if(!confirm('PERMANENTLY DELETE this component? Its schedule cannot be restored. All recorded service history and expenses will remain.'))return;
      await persist('/components/'+encodeURIComponent(id),'DELETE',undefined,'Component permanently deleted. Service history preserved.',{close:false});return;
    }
    if(a==='reset-shop-search'){shopFilters={query:'',city:'',service:''};shopResults=null;render();return;}
     if(a==='connect-shop'){await persist('/connections','POST',{shopId:id},'Connection request sent. Await workshop approval.',{close:false});return;}
     if(a==='approve-connection'||a==='decline-connection'){await persist('/connections/'+encodeURIComponent(id),'PATCH',{status:a==='approve-connection'?'accepted':'declined'},a==='approve-connection'?'Connection approved.':'Request declined.',{close:false});return;}
     if(a==='remove-connection'){
       if(!confirm('Remove this connection or request?'))return;
       await persist('/connections/'+encodeURIComponent(id),'DELETE',undefined,'Connection removed.',{close:false});return;
     }
     if(a==='select-bike'){state.selectedBike=id;save();render();toast('Active motorcycle changed.');return;}
    if(a==='cancel-rider-appointment'){
      if(!confirm('Cancel this appointment? The workshop will see the cancellation in its appointment queue.'))return;
      await persist('/rider-appointments/'+encodeURIComponent(id),'PATCH',{status:'Cancelled'},'Appointment request cancelled.',{close:false});return;
    }
    if(a==='advance-job'){const j=state.jobs.find(x=>x.id===id);if(j)await persist('/jobs/'+encodeURIComponent(id),'PATCH',{status:j.status==='Pending'?'In Progress':'Completed'},'Job status updated.',{close:false});return;}
    if(a==='confirm-appointment'||a==='complete-appointment'){await persist('/appointments/'+encodeURIComponent(id),'PATCH',{status:a==='complete-appointment'?'Completed':'Confirmed'},'Appointment status updated.',{close:false});return;}
    if(a==='export-services'){const bike=ensureBike();downloadCsv('motokare-service-history.csv',state.services.filter(x=>x.bikeId===bike?.id).map(s=>({date:s.date,service:s.type,workshop:s.shop,cost_php:s.cost,notes:s.notes})));return;}
    if(a==='export-jobs'){downloadCsv('motokare-shop-jobs.csv',state.jobs.map(s=>({job_id:s.id,customer:customerName(s.customerId),service:s.service,date:s.date,status:s.status,value_php:s.cost})));return;}
    if(a==='delete-bike'){if(confirm('Delete this motorcycle and ALL its service records? This cannot be undone.'))await persist('/bikes/'+encodeURIComponent(id),'DELETE',undefined,'Motorcycle deleted.',{close:false});return;}
    if(a==='delete-customer'){if(confirm('Delete this customer, their jobs and appointments? This cannot be undone.'))await persist('/customers/'+encodeURIComponent(id),'DELETE',undefined,'Customer deleted.',{close:false});return;}
    if(a==='delete-job'){if(confirm('Delete this job? This cannot be undone.'))await persist('/jobs/'+encodeURIComponent(id),'DELETE',undefined,'Job deleted.',{close:false});return;}
    if(a==='delete-appointment'){if(confirm('Delete this appointment? This cannot be undone.'))await persist('/appointments/'+encodeURIComponent(id),'DELETE',undefined,'Appointment deleted.',{close:false});return;}
  }
  document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(el)clickAction(el,e);else if(notifyOpen&&!e.target.closest('.notify-panel')){notifyOpen=false;render();}});
  document.addEventListener('change',e=>{
    const form=e.target.closest?.('form[data-form="add-component"],form[data-form="edit-component"]');
    if(!form)return;
    if(e.target.name==='catalogName'){
      const item=state.componentCatalog.find(x=>x.name===e.target.value);
      const interval=form.querySelector('[name="intervalDays"]');
      if(item&&interval)interval.value=item.suggestedDays;
    }
    syncComponentModal();
  });
  document.addEventListener('submit',e=>{const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();handleForm(form);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(modalRoot.innerHTML)closeModal();else if(notifyOpen){notifyOpen=false;render();}else if(mobileOpen){mobileOpen=false;render();}}if(e.key==='Tab'&&modalRoot.innerHTML){const links=[...modalRoot.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')];if(!links.length)return;const first=links[0],last=links[links.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
  window.addEventListener('hashchange',()=>{mobileOpen=false;notifyOpen=false;closeModal();render();window.scrollTo({top:0,behavior:'auto'});});
  let visibleDay=today();
  const checkCalendarDate=()=>{const date=today();if(date!==visibleDay){visibleDay=date;if(loaded)render();}};
  window.addEventListener('focus',checkCalendarDate);
  document.addEventListener('visibilitychange',checkCalendarDate);
  if(typeof window.setInterval==='function')window.setInterval(checkCalendarDate,60000);
  initialize();
})();