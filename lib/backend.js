const now = () => new Date().toISOString();
const id = (prefix='id') => `${prefix}_${crypto.randomUUID().replaceAll('-','').slice(0,16)}`;

export function hasDb(env){ return !!env?.DB; }

export async function d1First(env, sql, ...binds){
  if(!env?.DB) return null;
  try { return await env.DB.prepare(sql).bind(...binds).first(); } catch { return null; }
}

export async function d1All(env, sql, ...binds){
  if(!env?.DB) return [];
  try { const r = await env.DB.prepare(sql).bind(...binds).all(); return r?.results || []; } catch { return []; }
}

export async function d1Run(env, sql, ...binds){
  if(!env?.DB) return {success:false,meta:{rows_written:0}};
  try { return await env.DB.prepare(sql).bind(...binds).run(); } catch { return {success:false,meta:{rows_written:0}}; }
}

export async function touchAnalytics(env, event){
  if(!env?.DB) return false;
  const r = await d1Run(env,
    `INSERT INTO analytics_events (id,event_name,path,visitor_id,session_id,referrer,device,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    id('evt'), event.name || 'pageview', event.path || '', event.visitorId || '', event.sessionId || '', event.referrer || '', event.device || '', JSON.stringify(event.meta || {}), now()
  );
  return !!r?.success;
}

export function parseCookie(request, name){
  const raw = request.headers.get('cookie') || '';
  const pair = raw.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='));
  return pair ? decodeURIComponent(pair.slice(name.length+1)) : '';
}

export function json(data, init={}){
  const headers = new Headers(init.headers || {});
  headers.set('content-type','application/json; charset=utf-8');
  headers.set('cache-control','no-store');
  return new Response(JSON.stringify(data), {...init, headers});
}

export function bad(message, status=400){ return json({ok:false,error:message},{status}); }
