import {sourceFeeds,parseFeed,normalizeNews,combineNews} from '../lib/news.mjs';
export async function readNews(env){const row=await env.DB.prepare('SELECT payload FROM news_cache WHERE id=1').first();return row?JSON.parse(row.payload):{articles:[],sources:[],attemptedAt:null,lastSuccessAt:null};}
async function responseText(response){const reader=response.body.getReader(),parts=[];let size=0;for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>2e6){await reader.cancel();throw Error('新闻源超过大小限制');}parts.push(value);}const all=new Uint8Array(size);let n=0;for(const p of parts){all.set(p,n);n+=p.length;}return new TextDecoder().decode(all);}
export async function refreshNews(env,{force=false,now=new Date(),fetcher=fetch}={}){
 const old=await readNews(env);
 if(!force&&old.attemptedAt&&+now-Date.parse(old.attemptedAt)<45*60000)return {...old,skipped:true};
 if(force&&old.attemptedAt&&+now-Date.parse(old.attemptedAt)<120000)return {...old,skipped:true};
 const lease=+now+90000,claim=await env.DB.prepare("INSERT INTO news_locks(name,expires_at) VALUES('refresh',?) ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at WHERE news_locks.expires_at<? RETURNING name").bind(lease,+now).first();
 if(!claim)return {...old,skipped:true};
 try{
  const results=await Promise.allSettled(sourceFeeds.map(async feed=>{
   const options=()=>({headers:{'Accept':'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml','User-Agent':'HKD-Life-News/1.3 (+open-source personal reader)'},signal:AbortSignal.timeout(12000)});
   let response,fallback=false;
   try{response=await fetcher(feed.url,options());}catch(e){if(!feed.fallbackURL)throw e;}
   if((!response||!response.ok)&&feed.fallbackURL){await response?.body?.cancel();response=await fetcher(feed.fallbackURL,options());fallback=true;}
   if(!response.ok)throw Error('HTTP '+response.status);
   const raw=parseFeed(await responseText(response),feed),items=(await Promise.all(raw.map(r=>normalizeNews(r,feed,now)))).filter(Boolean);
   return {items,status:{id:feed.id,name:feed.name,ok:true,count:items.length,checkedAt:now.toISOString(),...(fallback?{fallback:true}: {})}};
  }));
  const statuses=results.map((r,i)=>r.status==='fulfilled'?r.value.status:{id:sourceFeeds[i].id,name:sourceFeeds[i].name,ok:false,count:0,checkedAt:now.toISOString(),error:String(r.reason?.message||'源暂时不可用').slice(0,150)});
  const incoming=results.flatMap(r=>r.status==='fulfilled'?r.value.items:[]);
  const data={articles:combineNews(old.articles,incoming,now),sources:statuses,attemptedAt:now.toISOString(),lastSuccessAt:statuses.some(s=>s.ok)?now.toISOString():old.lastSuccessAt};
  await env.DB.prepare('INSERT INTO news_cache(id,payload,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(JSON.stringify(data),now.toISOString()).run();return data;
 }finally{await env.DB.prepare("DELETE FROM news_locks WHERE name='refresh' AND expires_at=?").bind(lease).run();}
}
