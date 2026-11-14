import { stateSchema } from '../lib/validation.mjs';
import { emptyState,today } from '../lib/finance.mjs';
import { protectHistory } from '../lib/history.mjs';
import { protectImportHistory } from '../lib/import-history.mjs';
import {authorized} from './auth.mjs';
import {handleNews,runNewsJob} from './news-routes.mjs';
import {handleCapture} from './capture.mjs';
export {tokenHash} from './auth.mjs';
async function limitedText(request){const reader=request.body?.getReader();if(!reader)return '';const chunks=[];let size=0;for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>6e6){await reader.cancel();throw Error('BODY_TOO_LARGE');}chunks.push(value);}const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}return new TextDecoder().decode(all);}
export async function handleAPI(request,env){
 const origin=request.headers.get('Origin'),selfOrigin=new URL(request.url).origin;
 const allowed=[selfOrigin,...String(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)];
 const cors=origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{};
 const reply=(data,status=200)=>Response.json(data,{status,headers:{...cors,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(origin&&!allowed.includes(origin))return reply({error:'此网站未获准连接同步服务'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
 if(!/^[a-f0-9]{64}$/.test(env.SYNC_TOKEN_HASH||''))return reply({error:'同步服务尚未配置密钥哈希'},503);
 if(!await authorized(request,env))return reply({error:'同步密钥不正确'},401);
 if(!env.DB)return reply({error:'同步数据库未配置'},503);
 try{
 const old=await env.DB.prepare('SELECT revision,payload,updated_at FROM snapshots WHERE id = 1').first();
 if(request.method==='GET')return reply(old?{revision:old.revision,state:JSON.parse(old.payload),updatedAt:old.updated_at}:{revision:0,state:emptyState(),updatedAt:null});
 if(request.method!=='PUT')return reply({error:'不支持的请求方法'},405);
 let body;try{body=JSON.parse(await limitedText(request));}catch(e){return reply({error:e.message==='BODY_TOO_LARGE'?'数据超过 6MB':'JSON 格式无效'},e.message==='BODY_TOO_LARGE'?413:400);}
 const parsed=stateSchema.safeParse(body.state);
 if(!Number.isSafeInteger(body.revision)||body.revision<0||!parsed.success)return reply({error:parsed.success?'版本无效':parsed.error.issues[0].message},400);
 if((old?.revision||0)!==body.revision)return reply({error:'云端已更新，请重新合并后同步'},409);
 const state=parsed.data,updatedAt=new Date().toISOString(),revision=body.revision+1;
 if(state.transactions.some(t=>t.date>today())||state.events.some(e=>e.observations.some(o=>o.date>today())))return reply({error:'不能保存未来发生的交易或观察数据'},400);
 try{const previous=old?JSON.parse(old.payload):emptyState();protectHistory(previous.events,state.events,updatedAt);protectImportHistory(previous,state);}catch(e){return reply({error:e.message},400);}
 const result=old?await env.DB.prepare('UPDATE snapshots SET revision=?,payload=?,updated_at=? WHERE id=1 AND revision=?').bind(revision,JSON.stringify(state),updatedAt,body.revision).run():await env.DB.prepare('INSERT INTO snapshots(id,revision,payload,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO NOTHING').bind(revision,JSON.stringify(state),updatedAt).run();
 if(!result.meta.changes)return reply({error:'云端已更新，请重新合并后同步'},409);
 return reply({state,revision,updatedAt});
 }catch{return reply({error:'同步存储暂时不可用，请检查数据库迁移'},503);}
}
export default {async fetch(request,env){const path=new URL(request.url).pathname;if(path==='/api/news'||path.startsWith('/api/news/'))return handleNews(request,env);if(path==='/api/capture/apple-pay')return handleCapture(request,env,handleAPI);if(path==='/api/state')return handleAPI(request,env);return env.ASSETS?env.ASSETS.fetch(request):new Response('Not found',{status:404});},async scheduled(controller,env,ctx){ctx.waitUntil(runNewsJob(env,{now:new Date(controller.scheduledTime)}));}};
