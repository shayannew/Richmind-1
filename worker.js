// RichMind store Worker: static site + Google sign-in + email checkout + Gmail delivery.
import PRODUCTS from './products.js';

/* ------------------------------ helpers ------------------------------ */
const enc = new TextEncoder();
const nowIso = () => new Date().toISOString();
const DAY = 86400000;
const SESSION_DAYS = 365;
const LINK_DAYS = 30;

function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function b64url(bytes){ let s=''; const a=new Uint8Array(bytes); for(let i=0;i<a.length;i+=0x8000) s+=String.fromCharCode(...a.subarray(i,i+0x8000)); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64(bytes){ let s=''; const a=new Uint8Array(bytes); for(let i=0;i<a.length;i+=0x8000) s+=String.fromCharCode(...a.subarray(i,i+0x8000)); return btoa(s); }
function unb64url(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; const b=atob(s); const a=new Uint8Array(b.length); for(let i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a; }
function randomToken(n=32){ return b64url(crypto.getRandomValues(new Uint8Array(n))); }
async function sha256(s){ return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function safeEqual(a,b){ const [x,y]=await Promise.all([sha256(String(a||'')),sha256(String(b||''))]); let r=x.length^y.length; for(let i=0;i<x.length&&i<y.length;i++) r|=x.charCodeAt(i)^y.charCodeAt(i); return r===0 && !!a; }
function uid(p){ return `${p}_${randomToken(12)}`; }
function cookie(req,name){ const raw=req.headers.get('cookie')||''; for(const part of raw.split(';')){ const i=part.indexOf('='); if(i>0 && part.slice(0,i).trim()===name) return decodeURIComponent(part.slice(i+1).trim()); } return ''; }
function setCookie(name,value,maxAgeSec){ return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=Lax`; }
function normEmail(e){ return String(e||'').trim().toLowerCase(); }
function validEmail(e){ return e.length<=254 && /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i.test(e); }
function safeNext(n){ n=String(n||''); return (n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\')) ? n : '/account'; }
function baseUrl(env,req){ return String(env.PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/$/,''); }
function ip(req){ return req.headers.get('CF-Connecting-IP') || 'unknown'; }
function money(p){ const v=Number(p.price||0); return v===0 ? 'Free' : `${v.toLocaleString('en-US',{minimumFractionDigits: v%1?2:0, maximumFractionDigits:2})} ${esc(p.currency||'USD')}`; }
function findProduct(slug){ return (PRODUCTS||[]).find(p => p && p.slug === slug) || null; }
function deliveryLinks(p){
  const d=p.delivery||{}; const out=[];
  for(const l of (d.links||[])) if(l&&l.url) out.push({label:l.label||l.title||'Open', url:l.url});
  for(const l of [...(d.videos||[]),...(d.files||[])]) if(l&&(l.url||l.src)) out.push({label:l.title||l.name||'Open', url:l.url||l.src});
  return out.filter(l => /^https:\/\//i.test(l.url));
}

/* ------------------------------ responses ---------------------------- */
const SEC = {
  'Strict-Transport-Security':'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Frame-Options':'SAMEORIGIN',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()'
};
function withSecurity(res){ const r=new Response(res.body,res); for(const [k,v] of Object.entries(SEC)) if(!r.headers.has(k)) r.headers.set(k,v); return r; }
function redirect(to, cookies=[]){ const h=new Headers({Location:to,'Cache-Control':'no-store'}); for(const c of cookies) h.append('Set-Cookie',c); return new Response(null,{status:303,headers:h}); }
function json(data,status=200){ return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}); }
function page(env, title, body, {status=200, cookies=[]}={}){
  const site=esc(env.SITE_NAME||'RichMind');
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · ${site}</title><style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0f1115;color:#e9e6df;line-height:1.6}
a{color:#d4a53f}.wrap{max-width:480px;margin:0 auto;padding:40px 18px}.brand{display:block;text-align:center;font-weight:800;font-size:22px;color:#d4a53f;text-decoration:none;margin-bottom:22px}
.card{background:#171a21;border:1px solid #2a2e38;border-radius:18px;padding:26px}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 14px;color:#b9b5ac}
.price{font-size:26px;font-weight:800;color:#fff;margin:4px 0 18px}label{display:block;font-size:14px;margin:0 0 6px;color:#cfcac0}
input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #3a3f4b;background:#0f1115;color:#fff;font-size:16px}
.btn{display:flex;width:100%;align-items:center;justify-content:center;gap:10px;padding:14px;border-radius:12px;border:0;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;margin-top:14px}
.gold{background:#d4a53f;color:#141414}.light{background:#fff;color:#1f1f1f}.ghost{background:transparent;color:#cfcac0;border:1px solid #3a3f4b}
.or{text-align:center;color:#7d7a73;font-size:13px;margin:18px 0 4px}.muted{font-size:13px;color:#8a867e}.ok{color:#7bd88f}.err{background:#3a1d1d;border:1px solid #6b2a2a;color:#ffb4b4;padding:10px 12px;border-radius:10px;margin-bottom:14px;font-size:14px}
ul.items{list-style:none;padding:0;margin:0}ul.items li{border:1px solid #2a2e38;border-radius:12px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:10px}
.foot{text-align:center;margin-top:18px;font-size:13px;color:#7d7a73}
</style></head><body><div class="wrap"><a class="brand" href="/">${site}</a><div class="card">${body}</div>
<div class="foot">${env.SUPPORT_EMAIL?`Need help? <a href="mailto:${esc(env.SUPPORT_EMAIL)}">${esc(env.SUPPORT_EMAIL)}</a>`:''}</div></div></body></html>`;
  const h=new Headers({'content-type':'text/html; charset=utf-8','cache-control':'no-store',
    'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; script-src 'none'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'"});
  for(const c of cookies) h.append('Set-Cookie',c);
  return new Response(html,{status,headers:h});
}
const GOOGLE_ICON='<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

/* ------------------------------ database ----------------------------- */
let schemaReady=false;
async function ensureSchema(env){
  if(schemaReady) return; if(!env.DB) throw new Error('Database is not connected');
  const s=[
   `CREATE TABLE IF NOT EXISTS rm_customers (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT, google_sub TEXT UNIQUE, created_at TEXT NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS rm_sessions (id_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS rm_orders (id TEXT PRIMARY KEY, order_no TEXT NOT NULL UNIQUE, customer_id TEXT NOT NULL, email TEXT NOT NULL, product_slug TEXT NOT NULL, product_title TEXT, amount REAL NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL, provider TEXT, provider_ref TEXT, new_customer INTEGER NOT NULL DEFAULT 0, browser_hash TEXT, affiliate_code TEXT, created_at TEXT NOT NULL, paid_at TEXT)`,
   `CREATE TABLE IF NOT EXISTS rm_access (customer_id TEXT NOT NULL, product_slug TEXT NOT NULL, order_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY (customer_id, product_slug))`,
   `CREATE TABLE IF NOT EXISTS rm_login_links (token_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL, next TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS rm_oauth_states (state_hash TEXT PRIMARY KEY, purpose TEXT NOT NULL, verifier TEXT NOT NULL, next TEXT, expires_at TEXT NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS rm_email_log (id TEXT PRIMARY KEY, order_id TEXT, kind TEXT, to_email TEXT, status TEXT, error TEXT, created_at TEXT NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS rm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
   `CREATE TABLE IF NOT EXISTS rm_rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
   `CREATE INDEX IF NOT EXISTS idx_rm_orders_customer ON rm_orders(customer_id, created_at)`,
   `CREATE INDEX IF NOT EXISTS idx_rm_sessions_customer ON rm_sessions(customer_id)`
  ];
  await env.DB.batch(s.map(q=>env.DB.prepare(q)));
  schemaReady=true;
}
const q1=(env,sql,...b)=>env.DB.prepare(sql).bind(...b).first();
const qa=async(env,sql,...b)=>((await env.DB.prepare(sql).bind(...b).all()).results||[]);
const run=(env,sql,...b)=>env.DB.prepare(sql).bind(...b).run();

async function rateLimit(env,key,limit,windowSec){
  const t=Date.now(); const row=await q1(env,'SELECT count,reset_at FROM rm_rate WHERE key=?',key);
  if(!row || row.reset_at<t){ await run(env,'INSERT OR REPLACE INTO rm_rate (key,count,reset_at) VALUES (?,?,?)',key,1,t+windowSec*1000); return true; }
  if(row.count>=limit) return false;
  await run(env,'UPDATE rm_rate SET count=count+1 WHERE key=?',key); return true;
}
async function getSetting(env,k){ const r=await q1(env,'SELECT value FROM rm_settings WHERE key=?',k); return r?r.value:null; }
async function putSetting(env,k,v){ await run(env,'INSERT OR REPLACE INTO rm_settings (key,value,updated_at) VALUES (?,?,?)',k,v,nowIso()); }

/* secret encryption for the stored Gmail refresh token */
async function aesKey(env){ if(!env.SESSION_SECRET || env.SESSION_SECRET.length<16) throw new Error('SESSION_SECRET missing'); const raw=await crypto.subtle.digest('SHA-256',enc.encode('rm-aes|'+env.SESSION_SECRET)); return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']); }
async function encrypt(env,text){ const iv=crypto.getRandomValues(new Uint8Array(12)); const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await aesKey(env),enc.encode(text)); return b64url(iv)+'.'+b64url(ct); }
async function decrypt(env,val){ const [iv,ct]=String(val).split('.'); const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64url(iv)},await aesKey(env),unb64url(ct)); return new TextDecoder().decode(pt); }

/* ------------------------------ customers & sessions ----------------- */
async function customerByEmail(env,email){ return q1(env,'SELECT * FROM rm_customers WHERE email=?',email); }
async function createCustomer(env,email,name,googleSub){ const id=uid('cus'); await run(env,'INSERT INTO rm_customers (id,email,name,google_sub,created_at) VALUES (?,?,?,?,?)',id,email,name||null,googleSub||null,nowIso()); return {id,email,name}; }
async function newSessionCookie(env,customerId){
  const tok=randomToken(32); await run(env,'INSERT INTO rm_sessions (id_hash,customer_id,created_at,expires_at) VALUES (?,?,?,?)',await sha256(tok),customerId,nowIso(),new Date(Date.now()+SESSION_DAYS*DAY).toISOString());
  return setCookie('rm_sid',tok,SESSION_DAYS*86400);
}
async function currentCustomer(req,env){
  const tok=cookie(req,'rm_sid'); if(!tok) return null;
  return q1(env,`SELECT c.* FROM rm_sessions s JOIN rm_customers c ON c.id=s.customer_id WHERE s.id_hash=? AND s.expires_at>?`,await sha256(tok),nowIso());
}
async function createLoginLink(env,customerId,next){
  const tok=randomToken(32); await run(env,'INSERT INTO rm_login_links (token_hash,customer_id,next,expires_at,created_at) VALUES (?,?,?,?,?)',await sha256(tok),customerId,safeNext(next),new Date(Date.now()+LINK_DAYS*DAY).toISOString(),nowIso());
  return tok;
}

/* ------------------------------ Google OAuth ------------------------- */
async function startOAuth(req,env,purpose,next){
  if(!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return page(env,'Setup needed','<h1>Google sign-in is not set up yet</h1><p>GOOGLE_CLIENT_SECRET is missing in Cloudflare.</p>',{status:503});
  const state=randomToken(24), verifier=randomToken(48);
  await run(env,'INSERT INTO rm_oauth_states (state_hash,purpose,verifier,next,expires_at) VALUES (?,?,?,?,?)',await sha256(state),purpose,verifier,safeNext(next),new Date(Date.now()+15*60000).toISOString());
  const challenge=b64url(await crypto.subtle.digest('SHA-256',enc.encode(verifier)));
  const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id',env.GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri',`${baseUrl(env,req)}/auth/${purpose==='gmail'?'gmail':'google'}/callback`);
  u.searchParams.set('response_type','code');
  u.searchParams.set('state',state);
  u.searchParams.set('code_challenge',challenge); u.searchParams.set('code_challenge_method','S256');
  if(purpose==='gmail'){ u.searchParams.set('scope','openid email https://www.googleapis.com/auth/gmail.send'); u.searchParams.set('access_type','offline'); u.searchParams.set('prompt','consent'); }
  else { u.searchParams.set('scope','openid email profile'); u.searchParams.set('prompt','select_account'); }
  return redirect(u.toString(),[setCookie('rm_state',state,900)]);
}
async function finishOAuth(req,env,purpose){
  const url=new URL(req.url); const state=url.searchParams.get('state')||''; const code=url.searchParams.get('code')||'';
  if(url.searchParams.get('error')) return redirect(purpose==='gmail'?'/admin/setup':'/account?e=cancelled');
  if(!state || !code || state!==cookie(req,'rm_state')) return page(env,'Sign-in failed','<div class="err">This sign-in link expired. Please try again.</div><a class="btn gold" href="/account">Back</a>',{status:400});
  const sh=await sha256(state);
  const st=await q1(env,'SELECT * FROM rm_oauth_states WHERE state_hash=? AND purpose=? AND expires_at>?',sh,purpose,nowIso());
  await run(env,'DELETE FROM rm_oauth_states WHERE state_hash=? OR expires_at<?',sh,nowIso());
  if(!st) return page(env,'Sign-in failed','<div class="err">This sign-in link expired. Please try again.</div><a class="btn gold" href="/account">Back</a>',{status:400});
  const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:`${baseUrl(env,req)}/auth/${purpose==='gmail'?'gmail':'google'}/callback`,grant_type:'authorization_code',code_verifier:st.verifier})});
  const tok=await tr.json().catch(()=>({}));
  if(!tr.ok || !tok.access_token) return page(env,'Sign-in failed','<div class="err">Google did not accept the sign-in. Please try again.</div><a class="btn gold" href="/account">Back</a>',{status:400});
  const ur=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:`Bearer ${tok.access_token}`}});
  const info=await ur.json().catch(()=>({}));
  const email=normEmail(info.email);
  if(!ur.ok || !email || info.email_verified!==true) return page(env,'Sign-in failed','<div class="err">Your Google email is not verified.</div>',{status:400});
  const clear=setCookie('rm_state','',0);
  if(purpose==='gmail'){
    if(!tok.refresh_token) return page(env,'Gmail','<div class="err">Google did not return a permanent key. Remove the app from your Google account permissions and connect again.</div><a class="btn gold" href="/admin/setup">Back</a>');
    await putSetting(env,'gmail_refresh',await encrypt(env,tok.refresh_token)); await putSetting(env,'gmail_sender',email); await putSetting(env,'gmail_status','connected');
    gmailCache=null;
    return page(env,'Gmail connected',`<h1 class="ok">Gmail connected ✓</h1><p>Emails will be sent from <b>${esc(email)}</b>.</p><a class="btn gold" href="/admin/setup">Back to setup</a>`,{cookies:[clear]});
  }
  let c=await q1(env,'SELECT * FROM rm_customers WHERE google_sub=?',String(info.sub));
  if(!c){ c=await customerByEmail(env,email); if(c) await run(env,'UPDATE rm_customers SET google_sub=?, name=COALESCE(name,?) WHERE id=?',String(info.sub),info.name||null,c.id); }
  if(!c) c=await createCustomer(env,email,info.name,String(info.sub));
  return redirect(safeNext(st.next),[clear,await newSessionCookie(env,c.id)]);
}

/* ------------------------------ Gmail sending ------------------------ */
let gmailCache=null;
async function gmailToken(env){
  if(gmailCache && gmailCache.exp>Date.now()+60000) return gmailCache;
  const encRt=await getSetting(env,'gmail_refresh'); if(!encRt) throw new Error('gmail_not_connected');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:await decrypt(env,encRt),grant_type:'refresh_token'})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok || !j.access_token){ if(j.error==='invalid_grant') await putSetting(env,'gmail_status','disconnected'); throw new Error('gmail_token_'+(j.error||r.status)); }
  gmailCache={token:j.access_token,exp:Date.now()+(Number(j.expires_in||3600)*1000),sender:await getSetting(env,'gmail_sender')};
  return gmailCache;
}
function mimeWord(s){ return `=?UTF-8?B?${b64(enc.encode(s))}?=`; }
function wrap76(s){ return s.replace(/.{1,76}/g,'$&\r\n'); }
async function sendMail(env,{to,subject,html,text}){
  const g=await gmailToken(env); const bnd='rm_'+randomToken(12);
  const head=[`From: ${mimeWord(env.SITE_NAME||'RichMind')} <${g.sender}>`,`To: <${to}>`,`Subject: ${mimeWord(subject)}`,'MIME-Version: 1.0',`Date: ${new Date().toUTCString()}`];
  if(env.SUPPORT_EMAIL) head.push(`Reply-To: <${env.SUPPORT_EMAIL}>`);
  head.push(`Content-Type: multipart/alternative; boundary="${bnd}"`);
  const body=[`--${bnd}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap76(b64(enc.encode(text))),`--${bnd}`,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap76(b64(enc.encode(html))),`--${bnd}--`,''];
  const raw=b64url(enc.encode(head.join('\r\n')+'\r\n\r\n'+body.join('\r\n')));
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{authorization:`Bearer ${g.token}`,'content-type':'application/json'},body:JSON.stringify({raw})});
  if(!r.ok){ const t=await r.text().catch(()=>''); if(r.status===401) gmailCache=null; throw new Error(`gmail_send_${r.status} ${t.slice(0,200)}`); }
  return true;
}
function emailShell(env,title,inner){
  return `<!doctype html><html><body style="margin:0;background:#f4f2ee;font-family:Arial,Helvetica,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e1d6">
<tr><td style="background:#141414;color:#d4a53f;padding:20px 26px;font-size:20px;font-weight:bold">${esc(env.SITE_NAME||'RichMind')}</td></tr>
<tr><td style="padding:26px;color:#222;font-size:15px;line-height:1.7"><h2 style="margin:0 0 10px;font-size:20px">${esc(title)}</h2>${inner}</td></tr></table>
<p style="color:#9a958b;font-size:12px;margin:14px">If you did not request this, you can ignore this email.</p></td></tr></table></body></html>`;
}
function emailButton(url,label){ return `<p style="margin:20px 0"><a href="${esc(url)}" style="background:#d4a53f;color:#141414;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:bold;display:inline-block">${esc(label)}</a></p><p style="font-size:12px;color:#888;word-break:break-all">${esc(url)}</p>`; }
async function logEmail(env,orderId,kind,to,status,error){ await run(env,'INSERT INTO rm_email_log (id,order_id,kind,to_email,status,error,created_at) VALUES (?,?,?,?,?,?,?)',uid('em'),orderId||null,kind,to,status,error?String(error).slice(0,500):null,nowIso()); }

/* ------------------------------ orders ------------------------------- */
async function fulfillOrder(req,env,orderId,provider,ref){
  const r=await run(env,`UPDATE rm_orders SET status='paid', paid_at=?, provider=COALESCE(?,provider), provider_ref=COALESCE(?,provider_ref) WHERE id=? AND status='pending'`,nowIso(),provider||null,ref||null,orderId);
  if(!r.meta || !r.meta.changes) return false; // already paid: never deliver twice
  const o=await q1(env,'SELECT * FROM rm_orders WHERE id=?',orderId);
  await run(env,'INSERT OR IGNORE INTO rm_access (customer_id,product_slug,order_id,created_at) VALUES (?,?,?,?)',o.customer_id,o.product_slug,o.id,nowIso());
  await sendDeliveryEmail(req,env,o);
  return true;
}
async function sendDeliveryEmail(req,env,o){
  const tok=await createLoginLink(env,o.customer_id,`/access/${encodeURIComponent(o.product_slug)}`);
  const link=`${baseUrl(env,req)}/auth/link?t=${tok}`;
  const title='Your purchase is ready 🎉';
  const inner=`<p>Thank you for your order! You now have lifetime access to <b>${esc(o.product_title)}</b>.</p>
<p style="background:#f7f5f0;border-radius:10px;padding:12px 14px;font-size:14px">Order: <b>${esc(o.order_no)}</b><br>Amount: <b>${esc(o.amount)} ${esc(o.currency)}</b></p>
${emailButton(link,'Open my product')}<p style="font-size:13px;color:#666">This button also signs you in to your account. You can always get back in with Google or by requesting a new sign-in link at ${esc(baseUrl(env,req))}/account</p>`;
  try{ await sendMail(env,{to:o.email,subject:`Your access: ${o.product_title}`,html:emailShell(env,title,inner),text:`Thank you for your order ${o.order_no}.\nOpen your product: ${link}\n`}); await logEmail(env,o.id,'delivery',o.email,'sent'); return true; }
  catch(e){ await logEmail(env,o.id,'delivery',o.email,'failed',e.message); return false; }
}

/* ------------------------------ pages -------------------------------- */
function googleButton(next,label='Continue with Google'){ return `<a class="btn light" href="/auth/google/start?next=${encodeURIComponent(next)}">${GOOGLE_ICON}<span>${esc(label)}</span></a>`; }

async function checkoutPage(req,env,url){
  const p=findProduct(url.searchParams.get('product')||'');
  if(!p || !p.active) return page(env,'Not found','<h1>Product not found</h1><p>This product is not available right now.</p><a class="btn gold" href="/">Back to the store</a>',{status:404});
  const c=await currentCustomer(req,env);
  const next=`/checkout?product=${encodeURIComponent(p.slug)}`;
  if(c){ const has=await q1(env,'SELECT 1 AS x FROM rm_access WHERE customer_id=? AND product_slug=?',c.id,p.slug); if(has) return redirect(`/access/${encodeURIComponent(p.slug)}`); }
  const err={email:'Please enter a valid email address.',rate:'Too many attempts. Please wait a little and try again.',closed:'Payments are not open yet. Please check back soon.',db:'Something went wrong. Please try again.'}[url.searchParams.get('e')]||'';
  const body=`<p class="muted">Checkout</p><h1>${esc(p.title)}</h1><div class="price">${money(p)}</div>${err?`<div class="err">${esc(err)}</div>`:''}
<form method="post" action="/checkout"><input type="hidden" name="product" value="${esc(p.slug)}">
${c?`<p>Buying as <b>${esc(c.email)}</b></p>`:`<label for="email">Your email (your product will be sent here)</label><input id="email" name="email" type="email" required autocomplete="email" inputmode="email" placeholder="you@example.com">`}
<button class="btn gold" type="submit">${Number(p.price)>0?'Continue to payment':'Get it free'}</button></form>
${c?'':`<div class="or">or</div>${googleButton(next)}`}
<p class="muted" style="margin-top:16px">No password needed. After payment, your access link is emailed to you and the product is saved in your account.</p>`;
  return page(env,`Checkout: ${p.title}`,body);
}

async function checkoutSubmit(req,env){
  const f=await req.formData(); const p=findProduct(String(f.get('product')||''));
  if(!p || !p.active) return redirect('/');
  const back=`/checkout?product=${encodeURIComponent(p.slug)}`;
  if(String(env.PAYMENT_MODE||'off')==='off' && Number(p.price)>0) return redirect(back+'&e=closed');
  if(!(await rateLimit(env,'co:'+ip(req),15,3600))) return redirect(back+'&e=rate');
  let c=await currentCustomer(req,env); let isNew=0;
  if(!c){
    const email=normEmail(f.get('email')); if(!validEmail(email)) return redirect(back+'&e=email');
    c=await customerByEmail(env,email); if(!c){ c=await createCustomer(env,email); isNew=1; }
  }
  const btok=randomToken(24); const id=uid('ord'); const no='RM-'+Date.now().toString(36).toUpperCase()+'-'+randomToken(3).toUpperCase().replace(/[-_]/g,'X');
  await run(env,`INSERT INTO rm_orders (id,order_no,customer_id,email,product_slug,product_title,amount,currency,status,new_customer,browser_hash,affiliate_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,no,c.id,c.email,p.slug,p.title,Number(p.price||0),p.currency||'USD','pending',isNew,await sha256(btok),cookie(req,'rm_aff')||null,nowIso());
  const oc=setCookie('rm_ot',`${no}.${btok}`,86400);
  if(Number(p.price)===0){ await fulfillOrder(req,env,id,'free',null); return redirect(`/order/done?o=${no}`,[oc]); }
  if(env.PAYMENT_MODE==='test') return redirect(`/pay/test?o=${no}`,[oc]);
  // Real payment gateway will be plugged in here.
  return redirect(back+'&e=closed');
}

async function testPayPage(req,env,url){
  if(env.PAYMENT_MODE!=='test') return page(env,'Not available','<h1>Not available</h1>',{status:404});
  const o=await q1(env,'SELECT * FROM rm_orders WHERE order_no=?',url.searchParams.get('o')||'');
  if(!o) return page(env,'Not found','<h1>Order not found</h1>',{status:404});
  if(req.method==='POST'){
    const f=await req.formData();
    if(!(await rateLimit(env,'adm:'+ip(req),10,900)) || !(await safeEqual(f.get('key'),env.ADMIN_KEY))) return page(env,'Test payment','<div class="err">Wrong admin key.</div><a class="btn ghost" href="/pay/test?o='+esc(o.order_no)+'">Try again</a>',{status:403});
    await fulfillOrder(req,env,o.id,'test','test');
    return redirect(`/order/done?o=${o.order_no}`);
  }
  return page(env,'Test payment',`<p class="muted">TEST MODE (no real money)</p><h1>${esc(o.product_title)}</h1><div class="price">${esc(o.amount)} ${esc(o.currency)}</div>
<p>This page stands in for the real payment gateway. Only the site owner can confirm it.</p>
<form method="post"><label>Admin key</label><input type="password" name="key" required autocomplete="off"><button class="btn gold">Simulate successful payment</button></form>`);
}

async function orderDone(req,env,url){
  const o=await q1(env,'SELECT * FROM rm_orders WHERE order_no=?',url.searchParams.get('o')||'');
  if(!o) return redirect('/account');
  const oc=cookie(req,'rm_ot'); const [cno,ctok]=oc.split('.');
  const sameBrowser= cno===o.order_no && ctok && (await sha256(ctok))===o.browser_hash;
  if(!sameBrowser) return redirect('/account');
  if(o.status!=='paid') return page(env,'Waiting for payment',`<h1>Waiting for payment…</h1><p>Order <b>${esc(o.order_no)}</b> is not paid yet. If you already paid, refresh this page in a minute.</p><a class="btn gold" href="/order/done?o=${esc(o.order_no)}">Refresh</a>`);
  const cur=await currentCustomer(req,env);
  const cookies=[setCookie('rm_ot','',0)];
  let loggedIn = cur && cur.id===o.customer_id;
  // Auto sign-in only for brand-new customers (safe: nobody else owns that account yet).
  if(!loggedIn && o.new_customer===1){ cookies.push(await newSessionCookie(env,o.customer_id)); loggedIn=true; }
  const body= loggedIn
   ? `<h1 class="ok">Payment successful ✓</h1><p>Your product is now in your account, and we also emailed the access link to <b>${esc(o.email)}</b>.</p><a class="btn gold" href="/access/${encodeURIComponent(o.product_slug)}">Open my product</a><a class="btn ghost" href="/account">My account</a>`
   : `<h1 class="ok">Payment successful ✓</h1><p>We sent your access link to <b>${esc(o.email)}</b>. Open that email and tap the button to get into your product (check Spam too).</p><div class="or">or</div>${googleButton(`/access/${encodeURIComponent(o.product_slug)}`,'Sign in with Google')}`;
  return page(env,'Thank you',body,{cookies});
}

async function accountPage(req,env,url){
  const c=await currentCustomer(req,env);
  if(!c){
    const e=url.searchParams.get('e'); const sent=url.searchParams.get('sent');
    const msg= sent?'<p class="ok">If this email has an account, a sign-in link is on its way. Check your inbox (and Spam).</p>'
      : e==='rate'?'<div class="err">Too many requests. Please wait a little and try again.</div>'
      : e==='link'?'<div class="err">That sign-in link is invalid or expired. Get a new one below.</div>':'';
    return page(env,'Sign in',`<h1>Your account</h1><p>Sign in to see your products.</p>${msg}${googleButton('/account')}
<div class="or">or get a sign-in link by email</div><form method="post" action="/account/link"><label for="em">Email</label><input id="em" name="email" type="email" required autocomplete="email" placeholder="you@example.com"><button class="btn ghost" type="submit">Email me a sign-in link</button></form>`);
  }
  const rows=await qa(env,'SELECT product_slug FROM rm_access WHERE customer_id=? ORDER BY created_at DESC',c.id);
  const items=rows.map(r=>{ const p=findProduct(r.product_slug); return `<li><span>${esc(p?p.title:r.product_slug)}</span><a class="btn gold" style="width:auto;margin:0;padding:9px 16px" href="/access/${encodeURIComponent(r.product_slug)}">Open</a></li>`; }).join('');
  return page(env,'My account',`<p class="muted">Signed in as ${esc(c.email)}</p><h1>My products</h1>${items?`<ul class="items">${items}</ul>`:'<p>You have no products yet.</p><a class="btn gold" href="/">Browse products</a>'}
<form method="post" action="/auth/logout"><button class="btn ghost" type="submit">Sign out</button></form>`);
}

async function accountLinkSubmit(req,env){
  const f=await req.formData(); const email=normEmail(f.get('email'));
  if(!validEmail(email)) return redirect('/account?sent=1');
  if(!(await rateLimit(env,'ll:'+ip(req),6,3600)) || !(await rateLimit(env,'lle:'+email,3,3600))) return redirect('/account?e=rate');
  const c=await customerByEmail(env,email);
  if(c){ // same answer either way, so nobody can test which emails have accounts
    const tok=await createLoginLink(env,c.id,'/account'); const link=`${baseUrl(env,req)}/auth/link?t=${tok}`;
    try{ await sendMail(env,{to:email,subject:`Sign in to ${env.SITE_NAME||'RichMind'}`,html:emailShell(env,'Your sign-in link',`<p>Tap the button to sign in to your account and open your products.</p>${emailButton(link,'Sign in')}`),text:`Sign in: ${link}\n`}); await logEmail(env,null,'login',email,'sent'); }
    catch(e){ await logEmail(env,null,'login',email,'failed',e.message); }
  }
  return redirect('/account?sent=1');
}

async function loginLink(req,env,url){
  const t=url.searchParams.get('t')||'';
  const row=t && await q1(env,'SELECT * FROM rm_login_links WHERE token_hash=? AND expires_at>?',await sha256(t),nowIso());
  if(!row) return redirect('/account?e=link');
  return redirect(safeNext(row.next),[await newSessionCookie(env,row.customer_id)]);
}

async function accessPage(req,env,slug){
  const c=await currentCustomer(req,env); const next=`/access/${encodeURIComponent(slug)}`;
  if(!c) return redirect(`/account`);
  const p=findProduct(slug); const has=await q1(env,'SELECT 1 AS x FROM rm_access WHERE customer_id=? AND product_slug=?',c.id,slug);
  if(!p || !has) return page(env,'No access',`<h1>No access</h1><p>This account (${esc(c.email)}) has not bought this product.</p><a class="btn gold" href="/checkout?product=${encodeURIComponent(slug)}">Buy it</a><a class="btn ghost" href="/account">My account</a>`,{status:403});
  const d=p.delivery||{}; const links=deliveryLinks(p);
  return page(env,p.title,`<p class="muted">${esc(p.title)}</p><h1>${esc(d.title||d.welcomeTitle||'Your product')}</h1><p>${esc(d.text||d.welcomeText||'')}</p>
${links.length?`<ul class="items">${links.map(l=>`<li><span>${esc(l.label)}</span><a class="btn gold" style="width:auto;margin:0;padding:9px 16px" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Open</a></li>`).join('')}</ul>`:'<p class="muted">Content is being prepared. Please check back soon.</p>'}
<a class="btn ghost" href="/account">My account</a>`);
}

/* ------------------------------ owner setup -------------------------- */
async function adminSetup(req,env){
  const checks=[['SESSION_SECRET',env.SESSION_SECRET&&env.SESSION_SECRET.length>=16],['ADMIN_KEY',env.ADMIN_KEY&&env.ADMIN_KEY.length>=12],['GOOGLE_CLIENT_SECRET',!!env.GOOGLE_CLIENT_SECRET],['Database',!!env.DB]];
  let msg='';
  if(req.method==='POST'){
    const f=await req.formData();
    if(!(await rateLimit(env,'adm:'+ip(req),10,900)) || !(await safeEqual(f.get('key'),env.ADMIN_KEY))) msg='<div class="err">Wrong admin key.</div>';
    else if(f.get('action')==='connect') return startOAuth(req,env,'gmail','/admin/setup');
    else if(f.get('action')==='test'){
      const to=normEmail(f.get('to'));
      try{ await sendMail(env,{to,subject:'Test email ✓',html:emailShell(env,'It works!','<p>Your store can send emails now.</p>'),text:'It works!'}); msg=`<p class="ok">Test email sent to ${esc(to)} ✓</p>`; }
      catch(e){ msg=`<div class="err">Sending failed: ${esc(e.message)}</div>`; }
    }
  }
  const sender=env.DB?await getSetting(env,'gmail_sender'):null; const gst=env.DB?await getSetting(env,'gmail_status'):null;
  const list=checks.map(([n,ok])=>`<li><span>${n}</span><b class="${ok?'ok':''}">${ok?'✓ ready':'✗ missing'}</b></li>`).join('')+`<li><span>Gmail</span><b class="${gst==='connected'?'ok':''}">${gst==='connected'?'✓ '+esc(sender):'✗ not connected'}</b></li><li><span>Payment mode</span><b>${esc(env.PAYMENT_MODE||'off')}</b></li>`;
  return page(env,'Store setup',`<h1>Store setup</h1>${msg}<ul class="items">${list}</ul>
<form method="post"><input type="hidden" name="action" value="connect"><label>Admin key</label><input type="password" name="key" required autocomplete="off"><button class="btn light">${GOOGLE_ICON}<span>Connect Gmail for sending</span></button></form>
<form method="post" style="margin-top:22px"><input type="hidden" name="action" value="test"><label>Admin key</label><input type="password" name="key" required autocomplete="off"><label style="margin-top:10px">Send a test email to</label><input type="email" name="to" required><button class="btn gold">Send test email</button></form>`);
}

/* ------------------------------ router ------------------------------- */
async function route(req,env,ctx){
  const url=new URL(req.url); const path=url.pathname; const m=req.method;
  if(path==='/healthz') return json({ok:true});
  if(path==='/terms' || path==='/terms/') return env.ASSETS.fetch(new Request(new URL('/terms/',url),req));
  // Old paths from the previous build that must never be public.
  if(/^\/(admin(?!\/setup$)|api\/)/.test(path)) return new Response('Not found',{status:404});

  const dyn=/^\/(checkout|pay\/test|order\/done|account|auth\/|access\/|admin\/setup)/.test(path);
  if(dyn){
    if(m==='POST'){ const o=req.headers.get('Origin'); if(o && o!==url.origin) return new Response('Forbidden',{status:403}); }
    try{ await ensureSchema(env); }catch(e){ return page(env,'Setup needed','<h1>Database not connected</h1><p>Check the D1 binding named DB.</p>',{status:503}); }
    if(path==='/checkout') return m==='POST'?checkoutSubmit(req,env):checkoutPage(req,env,url);
    if(path==='/pay/test') return testPayPage(req,env,url);
    if(path==='/order/done') return orderDone(req,env,url);
    if(path==='/account') return accountPage(req,env,url);
    if(path==='/account/link' && m==='POST') return accountLinkSubmit(req,env);
    if(path==='/auth/google/start') return startOAuth(req,env,'login',url.searchParams.get('next'));
    if(path==='/auth/google/callback') return finishOAuth(req,env,'login');
    if(path==='/auth/gmail/callback') return finishOAuth(req,env,'gmail');
    if(path==='/auth/link') return loginLink(req,env,url);
    if(path==='/auth/logout' && m==='POST'){ const t=cookie(req,'rm_sid'); if(t) await run(env,'DELETE FROM rm_sessions WHERE id_hash=?',await sha256(t)); return redirect('/',[setCookie('rm_sid','',0)]); }
    const am=path.match(/^\/access\/([^/]+)\/?$/); if(am) return accessPage(req,env,decodeURIComponent(am[1]));
    if(path==='/admin/setup') return adminSetup(req,env);
    return page(env,'Not found','<h1>Page not found</h1><a class="btn gold" href="/">Home</a>',{status:404});
  }

  // Affiliate link: /r/<product-slug>/<code>  -> remember the code for 30 days
  const aff=path.match(/^\/r\/([^/]+)\/([A-Za-z0-9_-]{1,40})\/?$/);
  if(aff){ const r=redirect(`/product/${encodeURIComponent(aff[1])}/`); r.headers.append('Set-Cookie',setCookie('rm_aff',aff[2],30*86400)); return r; }
  const alias=path.match(/^\/products\/([^/]+)\/?$/);
  if(alias) return env.ASSETS.fetch(new Request(new URL(`/product/${alias[1]}/`,url),req));
  return env.ASSETS.fetch(req);
}

export default {
  async fetch(req,env,ctx){
    try{ return withSecurity(await route(req,env,ctx)); }
    catch(e){ console.error('fatal',e && e.stack || e); return withSecurity(page(env,'Error','<h1>Something went wrong</h1><p>Please try again in a moment.</p><a class="btn gold" href="/">Home</a>',{status:500})); }
  }
};
