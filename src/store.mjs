import { emptyState,today } from '../lib/finance.mjs';
import { stateSchema } from '../lib/validation.mjs';
import { protectHistory } from '../lib/history.mjs';
import { mergeStates,same } from '../lib/merge.mjs';
import { protectImportHistory } from '../lib/import-history.mjs';
let db,row,working=false,conflictRemote=null;
const listeners=new Set();
let snapshot={state:emptyState(),revision:0,loaded:false,busy:false,status:'正在读取本机数据',error:'',conflicts:[],config:{endpoint:'',token:''},lastSync:null,pending:false};
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('hkd-life-v1'):null;
export const subscribe=fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export const getSnapshot=()=>snapshot;
function emit(patch={}){snapshot={...snapshot,...(row?{state:row.state,revision:row.version,config:row.config,lastSync:row.lastSync,pending:row.pending}:{}),...patch};for(const fn of listeners)fn();}
const blank=()=>({state:emptyState(),base:emptyState(),cloudRevision:0,version:0,config:{endpoint:'',token:''},lastSync:null,pending:false});
export async function initialize(){
 db=await new Promise((resolve,reject)=>{const req=indexedDB.open('hkd-life',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 row=await read()||blank();emit({loaded:true,status:row.pending?(row.config.endpoint?'本机已保存 · 等待同步':'本机已保存 · 未配置同步'):'本机已就绪'});
 channel&&(channel.onmessage=async()=>{if(!working){row=await read()||row;emit({status:row.pending?(row.config.endpoint?'本机已保存 · 等待同步':'本机已保存 · 未配置同步'):'本机已更新'});}});
 window.addEventListener('online',()=>sync());window.addEventListener('focus',()=>sync());
 setInterval(()=>{if(document.visibilityState==='visible')sync();},15000);
 sync();
}
function read(){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readonly'),q=tx.objectStore('data').get('main');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
function persist(next,expected){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite'),store=tx.objectStore('data'),q=store.get('main');let failed;
 q.onsuccess=()=>{if((q.result?.version||0)!==expected){failed=Error('本机另一个窗口已更新，请重新提交。表单内容仍保留。');tx.abort();return;}store.put(next,'main');};
 tx.oncomplete=()=>{row=next;channel?.postMessage('changed');resolve();};tx.onabort=()=>reject(failed||tx.error||Error('本机保存失败'));tx.onerror=()=>{};
});}
function validate(state){const result=stateSchema.safeParse(state);if(!result.success)throw Error(result.error.issues[0]?.message||'数据格式无效');if(result.data.transactions.some(t=>t.date>today()))throw Error('未来支出请记为预留');if(result.data.events.some(e=>e.observations.some(o=>o.date>today())))throw Error('未来日期不能作为观察数据');return result.data;}
export function setError(error){emit({error});}
export async function saveState(state,expected){
 if(working){setError('正在同步，请稍后再保存；表单内容仍保留。');return false;}
 working=true;emit({busy:true,error:''});
 try{const nextState=validate(state);protectHistory(row.state.events,nextState.events);protectImportHistory(row.state,nextState);const next={...row,state:nextState,version:row.version+1,pending:true};await persist(next,expected);emit({status:row.config.endpoint?'本机已保存 · 等待同步':'本机已保存 · 未配置同步'});return true;}
 catch(e){row=await read()||row;emit({error:e.message,status:'本机保存未完成'});return false;}
 finally{working=false;emit({busy:false});setTimeout(()=>sync(),100);}
}
export async function configure(config){
 if(working)return false;
 try{
  if(config.endpoint){const u=new URL(config.endpoint);if(u.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw Error('同步地址必须使用 HTTPS');if(u.username||u.password||u.search||u.hash)throw Error('同步地址不能含凭据、查询参数或片段');if(!config.token.trim())throw Error('请填写同步密钥');}
  const changed=row.config.endpoint!==config.endpoint;
  await persist({...row,config,version:row.version+1,...(changed?{base:emptyState(),cloudRevision:0,lastSync:null,pending:true}:{})},row.version);
  conflictRemote=null;emit({conflicts:[],error:'',status:config.endpoint?'同步已配置':'仅保存在本机'});sync();return true;
 }catch(e){setError(e.message);return false;}
}
async function request(method,body){
 const response=await fetch(row.config.endpoint,{method,cache:'no-store',headers:{Authorization:'Bearer '+row.config.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 let d;try{d=await response.json();}catch{throw Error('同步服务未返回 JSON，请核对 API 地址');}
 if(!response.ok)throw Object.assign(Error(d.error||(response.status===401?'同步密钥不正确':'同步服务不可用')),{status:response.status});
 return d;
}
export async function sync(choices){
 if(!db||working||!row.config.endpoint)return false;
 if(!navigator.onLine){emit({status:'离线 · 本机数据已保留'});return false;}
 if(snapshot.conflicts.length&&!choices)return false;
 working=true;emit({busy:true,error:'',status:'正在同步…'});
 try{
  row=await read()||row;
  const remote=await request('GET');validate(remote.state);
  if(choices&&conflictRemote&&remote.revision!==conflictRemote.revision){choices=undefined;emit({error:'云端又有更新，请按最新内容重新确认。'});}
  const merged=mergeStates(row.base,row.state,remote.state,choices||{});
  if(merged.conflicts.length){conflictRemote=remote;emit({conflicts:merged.conflicts,status:'需要处理同步冲突'});return false;}
  let nextState;
  try{nextState=validate(choices?.['/__wholeState']==='remote'?remote.state:choices?.['/__wholeState']==='local'?row.state:merged.state);}
  catch(e){conflictRemote=remote;emit({conflicts:[{path:'/__wholeState',local:row.state,remote:remote.state}],status:'需要处理关联数据冲突',error:'两端的关联记录不能同时成立：'+e.message+'。请先下载本机备份，再选择整份数据。'});return false;}
  const version=row.version;
  let saved=remote;
  if(!same(nextState,remote.state))saved=await request('PUT',{revision:remote.revision,state:nextState});
  validate(saved.state);
  await persist({...row,state:saved.state,base:saved.state,cloudRevision:saved.revision,version:version+1,lastSync:new Date().toISOString(),pending:false},version);
  conflictRemote=null;emit({conflicts:[],status:'已同步 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});return true;
 }catch(e){row=await read()||row;emit({status:'本机数据保留 · 同步未完成',error:e.status===409?'另一台设备刚刚更新，下次同步会重新合并。':e.message});return false;}
 finally{working=false;emit({busy:false});}
}
