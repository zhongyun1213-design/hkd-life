import {authorized} from './auth.mjs';
import {readNews,refreshNews} from './news-refresh.mjs';
import {subscriptionSchema,preferencesSchema,sendPush,pushDigests,pushSelfTest} from './news-push.mjs';
import {newsId} from '../lib/news.mjs';
export async function runNewsJob(env,options={}){const news=await refreshNews(env,options);const delivery=await pushDigests(env,news.articles,options);return {sourceCount:news.sources.filter(s=>s.ok).length,articleCount:news.articles.length,delivery};}
export async function handleNews(request,env){
 const origin=request.headers.get('Origin'),self=new URL(request.url).origin,allowed=[self,...String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)],path=new URL(request.url).pathname;
 const cors=origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
 const reply=(d,status=200)=>Response.json(d,{status,headers:{...cors,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(origin&&!allowed.includes(origin))return reply({error:'此来源不能连接推荐服务'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
 try{
  if(path==='/api/news'&&request.method==='GET')return reply(await readNews(env));
  if(path==='/api/news/config'&&request.method==='GET')return reply({publicKey:env.VAPID_PUBLIC_KEY||null,pushEnabled:!!(env.VAPID_PRIVATE_KEY&&env.VAPID_PUBLIC_KEY),defaultFrequency:'twice',timeZone:'Asia/Hong_Kong'});
  if(!await authorized(request,env))return reply({error:'请先在“同步与安装”配置正确的同步密钥'},401);
  if(path==='/api/news/diagnostics'&&request.method==='GET')return reply(pushSelfTest(env));
  if(path==='/api/news/refresh'&&request.method==='POST'){const data=await refreshNews(env,{force:true});return reply({updatedAt:data.lastSuccessAt,articleCount:data.articles.length,sources:data.sources,skipped:!!data.skipped});}
  if(path==='/api/news/subscription'&&request.method==='GET'){
   const id=new URL(request.url).searchParams.get('id');if(!/^[a-f0-9]{64}$/.test(id||''))return reply({error:'设备标识无效'},400);
   const row=await env.DB.prepare('SELECT topics,frequency,last_sent_at FROM news_subscriptions WHERE id=?').bind(id).first();
   return reply(row?{subscribed:true,topics:JSON.parse(row.topics),frequency:row.frequency,lastSentAt:row.last_sent_at}:{subscribed:false});
  }
  const text=await request.text();if(text.length>16000)return reply({error:'请求过大'},413);let body;try{body=JSON.parse(text);}catch{return reply({error:'请求格式错误'},400);}
  if(path==='/api/news/subscriptions'&&request.method==='POST'){
   const subscription=subscriptionSchema.safeParse(body?.subscription),prefs=preferencesSchema.safeParse(body);
   if(!subscription.success||!prefs.success)return reply({error:'订阅或主题设置无效'},400);
   if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return reply({error:'服务端尚未配置推送密钥'},503);
   const id=await newsId(subscription.data.endpoint),existing=await env.DB.prepare('SELECT id FROM news_subscriptions WHERE id=?').bind(id).first();
   if(!existing&&(await env.DB.prepare('SELECT COUNT(*) AS count FROM news_subscriptions').first()).count>=50)return reply({error:'已达到设备数量限制，请先移除旧设备'},400);
   await env.DB.prepare('INSERT INTO news_subscriptions(id,subscription,topics,frequency,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription,topics=excluded.topics,frequency=excluded.frequency').bind(id,JSON.stringify(subscription.data),JSON.stringify([...new Set(prefs.data.topics)]),prefs.data.frequency,new Date().toISOString()).run();return reply({subscribed:true,id});
  }
  if(!/^[a-f0-9]{64}$/.test(body?.id||''))return reply({error:'设备标识无效'},400);
  if(path==='/api/news/subscriptions'&&request.method==='DELETE'){await env.DB.prepare('DELETE FROM news_subscriptions WHERE id=?').bind(body.id).run();return reply({subscribed:false});}
  if(path==='/api/news/test'&&request.method==='POST'){
   const row=await env.DB.prepare('SELECT subscription FROM news_subscriptions WHERE id=?').bind(body.id).first();if(!row)return reply({error:'当前设备尚未开启推送'},404);
   const claimed=await env.DB.prepare('UPDATE news_subscriptions SET last_test_at=? WHERE id=? AND (last_test_at IS NULL OR last_test_at<?) RETURNING id').bind(new Date().toISOString(),body.id,new Date(Date.now()-60000).toISOString()).first();if(!claimed)return reply({error:'请等待一分钟再测试'},429);
   const result=await sendPush(JSON.parse(row.subscription),{title:'金融实验室 · 测试通知',body:'通知连接已建立。新闻摘要默认香港时间每天 09:00、19:00 发送。',url:'./#/lab',tag:'news-test'},env);
   if(result.expired)await env.DB.prepare('DELETE FROM news_subscriptions WHERE id=?').bind(body.id).run();
   return reply(result.accepted?{accepted:true,message:'推送服务已接收请求，请检查这台设备的系统通知'}:{error:'推送服务未接收，请重新开启通知',providerStatus:result.status},result.accepted?200:502);
  }
  return reply({error:'接口不存在'},404);
 }catch(e){console.error('news-request-failed',e.name,String(e.message).replace(/https?:\/\/\S+/g,'[url]'));return reply({error:'推荐服务暂时不可用，请稍后重试；账本数据不受影响'},503);}
}
