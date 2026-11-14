import {generateRequestDetails} from 'web-push';
import {createECDH,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {newsId,digestSlot,pickDigest,topics} from '../lib/news.mjs';
export const subscriptionSchema=z.object({endpoint:z.string().url().max(4096),expirationTime:z.number().nullable().optional(),keys:z.object({p256dh:z.string().max(100),auth:z.string().max(50)})}).superRefine((s,ctx)=>{
 const u=new URL(s.endpoint),host=u.hostname;
 if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||!(host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com')))ctx.addIssue({code:'custom',message:'不是受支持浏览器的推送服务地址'});
 if(!/^[\w-]+=*$/.test(s.keys.p256dh)||Buffer.from(s.keys.p256dh,'base64url').length!==65||Buffer.from(s.keys.p256dh,'base64url')[0]!==4)ctx.addIssue({code:'custom',message:'推送公钥格式无效'});
 if(!/^[\w-]+=*$/.test(s.keys.auth)||Buffer.from(s.keys.auth,'base64url').length!==16)ctx.addIssue({code:'custom',message:'推送认证信息无效'});
});
export const preferencesSchema=z.object({topics:z.array(z.enum(['ai','audit','fintech'])).min(1).max(3),frequency:z.enum(['twice','daily','hourly'])});
export function pushRequest(subscription,payload,env){
 const parsed=subscriptionSchema.parse(subscription);
 if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.NEWS_SITE_ORIGIN)throw Error('推送服务未配置');
 return generateRequestDetails(parsed,JSON.stringify(payload),{TTL:21600,urgency:'normal',contentEncoding:'aes128gcm',topic:'hkd-news',vapidDetails:{subject:env.NEWS_SITE_ORIGIN,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY}});
}
export async function sendPush(subscription,payload,env,fetcher=fetch){
 const request=pushRequest(subscription,payload,env),headers={...request.headers};delete headers['Content-Length'];delete headers['content-length'];
 const r=await fetcher(request.endpoint,{method:request.method,headers,body:request.body,signal:AbortSignal.timeout(12000),redirect:'manual'});
 await r.body?.cancel();return {accepted:r.status>=200&&r.status<300,expired:r.status===404||r.status===410,status:r.status};
}
export function pushSelfTest(env){
 const signer=createECDH('prime256v1');signer.setPrivateKey(Buffer.from(env.VAPID_PRIVATE_KEY||'','base64url'));
 if(signer.getPublicKey().toString('base64url')!==env.VAPID_PUBLIC_KEY)throw Error('推送公私钥不匹配');
 const receiver=createECDH('prime256v1');receiver.generateKeys();
 const request=pushRequest({endpoint:'https://fcm.googleapis.com/fcm/send/self-test-not-a-device',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}},{title:'local-crypto-self-test'},env);
 return {cryptoReady:request.body.length>0&&request.headers['Content-Encoding']==='aes128gcm'};
}
export function digestPayload(articles,slot){
 const label=slot.endsWith('morning')?'早间':slot.endsWith('evening')?'晚间':'最新';
 return {title:`金融实验室 · ${label}事件推荐`,body:articles.slice(0,3).map(a=>`${a.topics.map(t=>topics[t]).join('/')}：${a.title.slice(0,44)}${a.title.length>44?'…':''}`).join('\n'),url:'./#/lab',tag:'news-'+slot};
}
export async function pushDigests(env,articles,{now=new Date(),fetcher=fetch}={}){
 if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return {accepted:0,failed:0,reason:'not-configured'};
 const rows=(await env.DB.prepare('SELECT * FROM news_subscriptions LIMIT 50').all()).results||[];let accepted=0,failed=0;
 for(const row of rows){
  const slot=digestSlot(row.frequency,now);if(!slot)continue;
  const prefs=JSON.parse(row.topics),sent=JSON.parse(row.sent_ids),items=pickDigest(articles,prefs,sent,now);if(!items.length)continue;
  const claim=await env.DB.prepare("INSERT INTO news_deliveries(subscription_id,slot,status,created_at) VALUES(?,?,'sending',?) ON CONFLICT(subscription_id,slot) DO UPDATE SET status='sending',created_at=excluded.created_at WHERE news_deliveries.status='failed' OR (news_deliveries.status='sending' AND news_deliveries.created_at<?) RETURNING slot").bind(row.id,slot,now.toISOString(),new Date(+now-5*60000).toISOString()).first();
  if(!claim)continue;
  try{
   const result=await sendPush(JSON.parse(row.subscription),digestPayload(items,slot),env,fetcher);
   if(result.expired)await env.DB.prepare('DELETE FROM news_subscriptions WHERE id=?').bind(row.id).run();
   if(!result.accepted)throw Error('provider-'+result.status);
   await env.DB.prepare('UPDATE news_subscriptions SET last_sent_at=?,sent_ids=? WHERE id=?').bind(now.toISOString(),JSON.stringify([...new Set([...sent,...items.map(a=>a.id)])].slice(-1000)),row.id).run();accepted++;
   await env.DB.prepare("UPDATE news_deliveries SET status='sent' WHERE subscription_id=? AND slot=?").bind(row.id,slot).run();
  }catch{failed++;await env.DB.prepare("UPDATE news_deliveries SET status='failed' WHERE subscription_id=? AND slot=?").bind(row.id,slot).run();}
 }
 await env.DB.prepare('DELETE FROM news_deliveries WHERE created_at<?').bind(new Date(+now-30*86400000).toISOString()).run();
 return {accepted,failed};
}
