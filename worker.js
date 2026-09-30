import { d1All, d1First, d1Run, hasDb, touchAnalytics, parseCookie, json, bad } from './lib/backend.js';

async function count(env, table){
  const row = await d1First(env, `SELECT COUNT(*) AS n FROM ${table}`);
  return Number(row?.n || 0);
}

function cors(request, response){
  const origin = request.headers.get('Origin');
  if(!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary','Origin');
  headers.set('Access-Control-Allow-Credentials','true');
  headers.set('Access-Control-Allow-Headers','content-type,x-rava-admin-token');
  headers.set('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
  return new Response(response.body,{status:response.status,headers});
}

async function handleApi(request, env){
  const url = new URL(request.url);
  const path = url.pathname;
  if(request.method === 'OPTIONS') return cors(request, new Response(null,{status:204}));

  if(path === '/api/runtime-status'){
    return cors(request, json({
      ok:true,
      runtime:'cloudflare-workers',
      phase:'C — production backend',
      databaseConfigured:!!env.DB,
      databaseConnected:!!(env.DB && await d1First(env,'SELECT 1')),
      imagekitConfigured:!!env.IMAGEKIT_URL_ENDPOINT,
      tributeConfigured:!!env.TRIBUTE_API_KEY,
      timestamp:new Date().toISOString()
    }));
  }

  if(path === '/api/production/check'){
    const connected = !!(env.DB && await d1First(env,'SELECT 1'));
    const names=['users','products','posts','orders','affiliates','affiliate_clicks','commissions','withdrawals','analytics_events','site_settings','page_versions','audit_logs','affiliate_campaigns','affiliate_links','affiliate_payouts'];
    const counts={};
    for(const n of names) counts[n]=connected?await count(env,n):null;
    return cors(request,json({ok:true,databaseConnected:connected,counts}));
  }

  if(path === '/api/products' && request.method==='GET'){
    if(!env.DB) return cors(request,json({ok:true,source:'static',products:[]}));
    const results = await d1All(env, `SELECT id,slug,title,category,price,currency,excerpt,hero,cta,landing_json,blocks_json,status,seo_json FROM products WHERE status IN ('published','active') ORDER BY sort_order ASC, updated_at DESC`);
    return cors(request,json({ok:true,source:'d1',products:results}));
  }

  if(path === '/api/blog' && request.method==='GET'){
    if(!env.DB) return cors(request,json({ok:true,source:'static',posts:[]}));
    const results = await d1All(env, `SELECT id,slug,title,category,post_date,excerpt,blocks_json,status,seo_json,published_at FROM posts WHERE status='published' ORDER BY COALESCE(published_at,updated_at) DESC`);
    return cors(request,json({ok:true,source:'d1',posts:results}));
  }

  if(path === '/api/site-settings' && request.method==='GET'){
    if(!env.DB) return cors(request,json({ok:false,error:'database_not_configured'},{status:503}));
    const rows = await d1All(env,'SELECT key,value_json,updated_at FROM site_settings ORDER BY key');
    const settings={};
    for(const r of rows){ try{settings[r.key]=JSON.parse(r.value_json)}catch{settings[r.key]=r.value_json;} }
    return cors(request,json({ok:true,settings}));
  }

  if(path === '/api/affiliate/tracking/report' && request.method==='GET'){
    const token=String(env.AFFILIATE_TRACKING_TOKEN||'');
    if(!token || request.headers.get('x-rava-affiliate-tracking-token')!==token) return cors(request,bad('affiliate tracking authentication required',401));
    if(!env.DB) return cors(request,json({ok:true,report:null,source:'static'}));
    const affiliateId=String(url.searchParams.get('affiliateId')||'').trim();
    if(!affiliateId) return cors(request,bad('affiliateId required'));
    const days=Math.max(1,Math.min(90,Number(url.searchParams.get('days')||30)));
    const campaign=String(url.searchParams.get('campaign')||''); const subId=String(url.searchParams.get('subId')||''); const productSlug=String(url.searchParams.get('productSlug')||'');
    const end=new Date(); const start=new Date(end.getTime()-days*864e5);
    const whereClick=['affiliate_id=?','created_at>=?','created_at<?']; const clickBinds=[affiliateId,start.toISOString(),end.toISOString()];
    if(campaign){whereClick.push('campaign=?');clickBinds.push(campaign);} if(subId){whereClick.push('sub_id=?');clickBinds.push(subId);}
    if(productSlug){whereClick.push('product_id=(SELECT id FROM products WHERE slug=?)');clickBinds.push(productSlug);}
    const whereOrder=['affiliate_id=?','created_at>=?','created_at<?','status<>?']; const orderBinds=[affiliateId,start.toISOString(),end.toISOString(),'cancelled'];
    if(campaign){whereOrder.push('affiliate_campaign=?');orderBinds.push(campaign);} if(subId){whereOrder.push('affiliate_sub_id=?');orderBinds.push(subId);} if(productSlug){whereOrder.push('product_slug=?');orderBinds.push(productSlug);}
    const [clicks,visitors,sales,revenue,commission,byCampaign,byProduct,bySub]=await Promise.all([
      d1First(env,`SELECT COUNT(*) AS n FROM affiliate_clicks WHERE ${whereClick.join(' AND ')}`,...clickBinds),
      d1First(env,`SELECT COUNT(DISTINCT visitor_id) AS n FROM affiliate_clicks WHERE ${whereClick.join(' AND ')}`,...clickBinds),
      d1First(env,`SELECT COUNT(*) AS n FROM orders WHERE ${whereOrder.join(' AND ')}`,...orderBinds),
      d1First(env,`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE ${whereOrder.join(' AND ')}`,...orderBinds),
      d1First(env,`SELECT COALESCE(SUM(commission_amount),0) AS n FROM orders WHERE ${whereOrder.join(' AND ')}`,...orderBinds),
      d1All(env,`SELECT COALESCE(campaign,'') AS key,COUNT(*) AS clicks,(SELECT COUNT(*) FROM orders o WHERE o.affiliate_id=? AND o.affiliate_campaign=affiliate_clicks.campaign AND o.created_at>=? AND o.created_at<? AND o.status<>?) AS sales FROM affiliate_clicks WHERE ${whereClick.join(' AND ')} GROUP BY campaign ORDER BY clicks DESC LIMIT 50`,affiliateId,start.toISOString(),end.toISOString(),'cancelled',...clickBinds),
      d1All(env,`SELECT product_slug AS key,COUNT(*) AS sales,COALESCE(SUM(total),0) AS revenue,COALESCE(SUM(commission_amount),0) AS commission FROM orders WHERE ${whereOrder.join(' AND ')} GROUP BY product_slug ORDER BY sales DESC LIMIT 50`,...orderBinds),
      d1All(env,`SELECT COALESCE(affiliate_sub_id,'') AS key,COUNT(*) AS sales,COALESCE(SUM(total),0) AS revenue,COALESCE(SUM(commission_amount),0) AS commission FROM orders WHERE ${whereOrder.join(' AND ')} GROUP BY affiliate_sub_id ORDER BY sales DESC LIMIT 50`,...orderBinds)
    ]);
    const clickN=Number(clicks?.n||0), saleN=Number(sales?.n||0);
    return cors(request,json({ok:true,report:{days,range:{start:start.toISOString(),end:end.toISOString()},metrics:{clicks:clickN,uniqueVisitors:Number(visitors?.n||0),sales:saleN,revenue:Number(revenue?.n||0),commission:Number(commission?.n||0),conversion:clickN?Number((saleN/clickN*100).toFixed(2)):0},byCampaign,byProduct,bySub}}));
  }
  if(path === '/api/affiliate/conversions/report' && request.method==='GET'){
    const token=String(env.AFFILIATE_TRACKING_TOKEN||'');
    if(!token || request.headers.get('x-rava-affiliate-tracking-token')!==token) return cors(request,bad('affiliate tracking authentication required',401));
    if(!env.DB) return cors(request,json({ok:true,source:'static',report:null}));
    const affiliateId=String(url.searchParams.get('affiliateId')||'').trim(); if(!affiliateId) return cors(request,bad('affiliateId required'));
    const days=Math.max(1,Math.min(90,Number(url.searchParams.get('days')||30))); const status=String(url.searchParams.get('status')||''); const campaign=String(url.searchParams.get('campaign')||''); const subId=String(url.searchParams.get('subId')||''); const productSlug=String(url.searchParams.get('productSlug')||'');
    const end=new Date(); const start=new Date(end.getTime()-days*864e5); const where=['affiliate_id=?','created_at>=?','created_at<?']; const binds=[affiliateId,start.toISOString(),end.toISOString()];
    if(status){where.push('status=?');binds.push(status);} if(campaign){where.push('affiliate_campaign=?');binds.push(campaign);} if(subId){where.push('affiliate_sub_id=?');binds.push(subId);} if(productSlug){where.push('product_slug=?');binds.push(productSlug);}
    const orders=await d1All(env,`SELECT order_no,created_at,status,product_title,product_slug,total,currency,commission_amount,affiliate_campaign,affiliate_sub_id,affiliate_click_id,affiliate_first_click_at,affiliate_attribution_model,affiliate_attribution_expires_at,affiliate_landing_path,payment_method FROM orders WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`,...binds);
    const [clicks,pending,paid,failed,cancelled,refunded,revenue,commission,refundedRevenue]=await Promise.all([
      d1First(env,`SELECT COUNT(*) AS n FROM affiliate_clicks WHERE affiliate_id=? AND created_at>=? AND created_at<?`,affiliateId,start.toISOString(),end.toISOString()),
      d1First(env,`SELECT COUNT(*) AS n FROM orders WHERE ${['affiliate_id=?','created_at>=?','created_at<?','status=?',campaign?'affiliate_campaign=?':'1=1',subId?'affiliate_sub_id=?':'1=1',productSlug?'product_slug=?':'1=1'].join(' AND ')}`,affiliateId,start.toISOString(),end.toISOString(),'pending_payment',...(campaign?[campaign]:[]),...(subId?[subId]:[]),...(productSlug?[productSlug]:[])),
      d1First(env,`SELECT COUNT(*) AS n FROM orders WHERE ${where.filter(x=>x!=='status=?').join(' AND ')} AND status='paid'`,...binds.filter((_,i)=>i!==where.findIndex(x=>x==='status=?'))),
      d1First(env,`SELECT COUNT(*) AS n FROM orders WHERE affiliate_id=? AND created_at>=? AND created_at<? AND status='failed'`,affiliateId,start.toISOString(),end.toISOString()),
      d1First(env,`SELECT COUNT(*) AS n FROM orders WHERE affiliate_id=? AND created_at>=? AND created_at<? AND status='cancelled'`,affiliateId,start.toISOString(),end.toISOString()),
      d1First(env,`SELECT COUNT(*) AS n FROM orders WHERE affiliate_id=? AND created_at>=? AND created_at<? AND status='refunded'`,affiliateId,start.toISOString(),end.toISOString()),
      d1First(env,`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE ${where.filter(x=>x!=='status=?').join(' AND ')} AND status='paid'`,...binds.filter((_,i)=>i!==where.findIndex(x=>x==='status=?'))),
      d1First(env,`SELECT COALESCE(SUM(commission_amount),0) AS n FROM orders WHERE ${where.filter(x=>x!=='status=?').join(' AND ')} AND status='paid'`,...binds.filter((_,i)=>i!==where.findIndex(x=>x==='status=?'))),
      d1First(env,`SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE ${where.filter(x=>x!=='status=?').join(' AND ')} AND status='refunded'`,...binds.filter((_,i)=>i!==where.findIndex(x=>x==='status=?')))
    ]);
    const clickN=Number(clicks?.n||0), orderN=orders.length, paidN=Number(paid?.n||0); return cors(request,json({ok:true,report:{days,metrics:{clicks:clickN,orders:orderN,pending:Number(pending?.n||0),paid:paidN,failed:Number(failed?.n||0),cancelled:Number(cancelled?.n||0),refunded:Number(refunded?.n||0),revenue:Number(revenue?.n||0),commission:Number(commission?.n||0),refundedRevenue:Number(refundedRevenue?.n||0),conversion:clickN?Number((paidN/clickN*100).toFixed(2)):0,clickToOrder:clickN?Number((orderN/clickN*100).toFixed(2)):0,paidRate:orderN?Number((paidN/orderN*100).toFixed(2)):0},orders}}));
  }
  if(path === '/api/affiliate/payouts/report' && request.method==='GET'){
    const token=String(env.AFFILIATE_TRACKING_TOKEN||'');
    if(!token || request.headers.get('x-rava-affiliate-tracking-token')!==token) return cors(request,bad('affiliate payout authentication required',401));
    if(!env.DB) return cors(request,json({ok:true,source:'static',report:null}));
    const affiliateId=String(url.searchParams.get('affiliateId')||'').trim(); if(!affiliateId) return cors(request,bad('affiliateId required'));
    const rows=await d1All(env,`SELECT id,affiliate_id,amount,currency,method,fee,net_amount,status,requested_at,approved_at,paid_at,rejected_at,cancelled_at,processor_reference,rejection_reason,allocations_json FROM affiliate_payouts WHERE affiliate_id=? ORDER BY requested_at DESC LIMIT 100`,affiliateId);
    const [requested,approved,paid,rejected,cancelled,total,fees]=await Promise.all([
      d1First(env,`SELECT COALESCE(SUM(amount),0) AS n FROM affiliate_payouts WHERE affiliate_id=? AND status='requested'`,affiliateId),
      d1First(env,`SELECT COALESCE(SUM(amount),0) AS n FROM affiliate_payouts WHERE affiliate_id=? AND status='approved'`,affiliateId),
      d1First(env,`SELECT COALESCE(SUM(amount),0) AS n FROM affiliate_payouts WHERE affiliate_id=? AND status='paid'`,affiliateId),
      d1First(env,`SELECT COUNT(*) AS n FROM affiliate_payouts WHERE affiliate_id=? AND status='rejected'`,affiliateId),
      d1First(env,`SELECT COUNT(*) AS n FROM affiliate_payouts WHERE affiliate_id=? AND status='cancelled'`,affiliateId),
      d1First(env,`SELECT COALESCE(SUM(amount),0) AS n FROM affiliate_payouts WHERE affiliate_id=?`,affiliateId),
      d1First(env,`SELECT COALESCE(SUM(fee),0) AS n FROM affiliate_payouts WHERE affiliate_id=? AND status='paid'`,affiliateId)
    ]);
    return cors(request,json({ok:true,report:{rows,summary:{requested:Number(requested?.n||0),approved:Number(approved?.n||0),paid:Number(paid?.n||0),rejected:Number(rejected?.n||0),cancelled:Number(cancelled?.n||0),total:Number(total?.n||0),fees:Number(fees?.n||0)}}}));
  }

  if(path === '/api/analytics/summary' && request.method==='GET'){
    if(!env.DB) return cors(request,json({ok:true,source:'static',summary:null}));
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')||30)));
    const from = new Date(Date.now()-days*864e5).toISOString();
    const [pageviews, uniqueVisitors, topPages, devices] = await Promise.all([
      d1First(env, `SELECT COUNT(*) AS n FROM analytics_events WHERE event_name='pageview' AND created_at >= ?`, from),
      d1First(env, `SELECT COUNT(DISTINCT visitor_id) AS n FROM analytics_events WHERE event_name='pageview' AND created_at >= ?`, from),
      d1All(env, `SELECT path,COUNT(*) AS n FROM analytics_events WHERE event_name='pageview' AND created_at >= ? GROUP BY path ORDER BY n DESC LIMIT 10`, from),
      d1All(env, `SELECT COALESCE(device,'unknown') AS device,COUNT(*) AS n FROM analytics_events WHERE created_at >= ? GROUP BY device ORDER BY n DESC`, from)
    ]);
    return cors(request,json({ok:true,days,pageviews:Number(pageviews?.n||0),uniqueVisitors:Number(uniqueVisitors?.n||0),topPages,devices}));
  }

  if(path === '/api/analytics/report' && request.method==='GET'){
    const analyticsToken = String(env.ADMIN_ANALYTICS_TOKEN || '');
    if(!analyticsToken || request.headers.get('x-rava-admin-token') !== analyticsToken) return cors(request,bad('admin authentication required',401));
    if(!env.DB) return cors(request,json({ok:true,report:null,source:'static'}));
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')||30)));
    const end = new Date(); const start = new Date(end.getTime()-days*864e5); const prev = new Date(start.getTime()-days*864e5);
    const [cur,old,trend,paths,refs,devices,events] = await Promise.all([
      d1First(env,`SELECT COUNT(*) AS pageviews,COUNT(DISTINCT visitor_id) AS visitors,COUNT(DISTINCT session_id) AS sessions,COUNT(*) AS events FROM analytics_events WHERE created_at >= ? AND created_at < ? AND event_name='pageview'`,start.toISOString(),end.toISOString()),
      d1First(env,`SELECT COUNT(*) AS pageviews,COUNT(DISTINCT visitor_id) AS visitors,COUNT(DISTINCT session_id) AS sessions,COUNT(*) AS events FROM analytics_events WHERE created_at >= ? AND created_at < ? AND event_name='pageview'`,prev.toISOString(),start.toISOString()),
      d1All(env,`SELECT substr(created_at,1,10) AS date,COUNT(*) AS pageviews,COUNT(DISTINCT visitor_id) AS visitors FROM analytics_events WHERE created_at >= ? AND created_at < ? AND event_name='pageview' GROUP BY substr(created_at,1,10) ORDER BY date`,start.toISOString(),end.toISOString()),
      d1All(env,`SELECT COALESCE(path,'/') AS key,COUNT(*) AS n FROM analytics_events WHERE created_at >= ? AND created_at < ? AND event_name='pageview' GROUP BY path ORDER BY n DESC LIMIT 10`,start.toISOString(),end.toISOString()),
      d1All(env,`SELECT COALESCE(referrer,'direct') AS key,COUNT(*) AS n FROM analytics_events WHERE created_at >= ? AND created_at < ? GROUP BY referrer ORDER BY n DESC LIMIT 10`,start.toISOString(),end.toISOString()),
      d1All(env,`SELECT COALESCE(device,'unknown') AS key,COUNT(*) AS n FROM analytics_events WHERE created_at >= ? AND created_at < ? GROUP BY device ORDER BY n DESC`,start.toISOString(),end.toISOString()),
      d1All(env,`SELECT COALESCE(event_name,'unknown') AS key,COUNT(*) AS n FROM analytics_events WHERE created_at >= ? AND created_at < ? GROUP BY event_name ORDER BY n DESC LIMIT 12`,start.toISOString(),end.toISOString())
    ]);
    const pct=(a,b)=>b?Math.round(((Number(a||0)-Number(b||0))/Number(b))*100):null;
    const metric=(k)=>({value:Number(cur?.[k]||0),previous:Number(old?.[k]||0),percent:pct(cur?.[k],old?.[k])});
    return cors(request,json({ok:true,report:{days,range:{start:start.toISOString(),end:end.toISOString()},metrics:{pageviews:metric('pageviews'),visitors:metric('visitors'),sessions:metric('sessions'),events:metric('events')},trend,topPaths:paths.map(x=>[x.key,Number(x.n||0)]),topReferrers:refs.map(x=>[x.key,Number(x.n||0)]),devices:devices.map(x=>[x.key,Number(x.n||0)]),eventCounts:events.map(x=>[x.key,Number(x.n||0)])}}));
  }
  if(path === '/api/analytics/event' && request.method==='POST'){
    let body={}; try{ body=await request.json(); }catch{ return cors(request,bad('invalid_json')); }
    const visitor = parseCookie(request,'rava_visitor') || crypto.randomUUID();
    const session = parseCookie(request,'rava_session') || crypto.randomUUID();
    await touchAnalytics(env,{...body,visitorId:visitor,sessionId:session,referrer:request.headers.get('referer')||''});
    const headers = new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    headers.append('Set-Cookie',`rava_visitor=${encodeURIComponent(visitor)}; Max-Age=31536000; Path=/; SameSite=Lax`);
    headers.append('Set-Cookie',`rava_session=${encodeURIComponent(session)}; Max-Age=1800; Path=/; SameSite=Lax`);
    return cors(request,new Response(JSON.stringify({ok:true}),{status:200,headers}));
  }

  if(path === '/api/form-submit' && request.method==='POST'){
    const form = await request.formData();
    const formId = String(form.get('__formId') || '');
    const successUrl = String(form.get('__successUrl') || '');
    const payload={}; for(const [k,v] of form.entries()){ if(k==='__formId'||k==='__successUrl') continue; payload[k]=String(v); }
    if(env.DB){ await d1Run(env,`INSERT INTO form_submissions (id,form_id,path,data_json,created_at) VALUES (?,?,?,?,?)`,crypto.randomUUID(),formId,new URL(request.url).pathname,JSON.stringify(payload),new Date().toISOString()); }
    const target = successUrl && (successUrl.startsWith('/') || /^https?:\/\//i.test(successUrl)) ? successUrl : '/form/success';
    return Response.redirect(new URL(target, request.url),303);
  }

  if(path === '/api/media/url' && request.method==='POST'){
    let body={}; try{body=await request.json();}catch{return cors(request,bad('invalid_json'));}
    if(!body.url) return cors(request,bad('url_required'));
    if(env.DB){
      await d1Run(env,`INSERT INTO media (id,name,object_key,url,mime_type,size_bytes,alt,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,crypto.randomUUID(),body.name||'Media',body.key||body.url,body.url,body.mimeType||'',Number(body.size||0),body.alt||'',JSON.stringify(body.meta||{}),new Date().toISOString());
    }
    return cors(request,json({ok:true,url:body.url,source:'imagekit'}));
  }

  return cors(request,bad('not_found',404));
}

export default {
  async fetch(request,env){
    const url = new URL(request.url);
    const path=url.pathname;
    if(path==='/healthz') return json({ok:true,runtime:'cloudflare-workers',version:'v78-wallet-payouts',phase:'C'});
    if(path.startsWith('/api/')) return handleApi(request,env);

    const affiliateMatch = path.match(/^\/r\/([^/]+)\/([^/]+)\/?$/) || path.match(/^\/products\/([^/]+)\/([^/]+)\/?$/);
    if(affiliateMatch){
      const [,slug,code]=affiliateMatch;
      if(env.DB){
        const aff=await d1First(env,`SELECT id FROM affiliates WHERE code=? AND status='active'`,code);
        const product=await d1First(env,`SELECT id FROM products WHERE slug=?`,slug);
        if(aff){
          const clickId=crypto.randomUUID();
          await d1Run(env,`INSERT INTO affiliate_clicks (id,affiliate_id,product_id,visitor_id,session_id,source,campaign,sub_id,landing_path,referrer,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,clickId,aff.id,product?.id||null,parseCookie(request,'rava_aff_visitor')||crypto.randomUUID(),parseCookie(request,'rava_aff_session')||crypto.randomUUID(),url.searchParams.get('utm_source')||'affiliate',url.searchParams.get('campaign')||url.searchParams.get('utm_campaign')||'',url.searchParams.get('sub_id')||url.searchParams.get('utm_content')||'',url.pathname,request.headers.get('Referer')||'',new Date().toISOString());
        }
      }
      const target = new URL(`/product/${encodeURIComponent(slug)}/`,url);
      const response=await env.ASSETS.fetch(new Request(target.toString(),request));
      const headers=new Headers(response.headers);
      const maxAge=2592000; headers.append('Set-Cookie',`rava_affiliate=${encodeURIComponent(code)}; Max-Age=${maxAge}; Path=/; SameSite=Lax; HttpOnly${url.protocol==='https:'?'; Secure':''}`); headers.append('Set-Cookie',`rava_affiliate_at=${encodeURIComponent(new Date().toISOString())}; Max-Age=${maxAge}; Path=/; SameSite=Lax; HttpOnly${url.protocol==='https:'?'; Secure':''}`); headers.append('Set-Cookie',`rava_affiliate_campaign=${encodeURIComponent(url.searchParams.get('campaign')||url.searchParams.get('utm_campaign')||'')}; Max-Age=${maxAge}; Path=/; SameSite=Lax; HttpOnly${url.protocol==='https:'?'; Secure':''}`); headers.append('Set-Cookie',`rava_affiliate_sub=${encodeURIComponent(url.searchParams.get('sub_id')||url.searchParams.get('utm_content')||'')}; Max-Age=${maxAge}; Path=/; SameSite=Lax; HttpOnly${url.protocol==='https:'?'; Secure':''}`); headers.append('Set-Cookie',`rava_affiliate_path=${encodeURIComponent(url.pathname)}; Max-Age=${maxAge}; Path=/; SameSite=Lax; HttpOnly${url.protocol==='https:'?'; Secure':''}`); headers.append('Set-Cookie',`rava_affiliate_click_id=${encodeURIComponent(clickId||'')}; Max-Age=${maxAge}; Path=/; SameSite=Lax; HttpOnly${url.protocol==='https:'?'; Secure':''}`);
      return new Response(response.body,{status:response.status,headers});
    }

    const productAlias=path.match(/^\/products\/([^/]+)\/?$/);
    if(productAlias){
      const target=new URL(`/product/${encodeURIComponent(productAlias[1])}/`,url);
      return env.ASSETS.fetch(new Request(target.toString(),request));
    }
    return env.ASSETS.fetch(request);
  }
};
