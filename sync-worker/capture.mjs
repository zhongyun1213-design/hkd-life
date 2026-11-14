import {z} from 'zod';
import {categoryFor,cents,uuidFor} from '../lib/statement-import.mjs';
import {today} from '../lib/finance.mjs';
const schema=z.object({eventId:z.string().trim().uuid(),accountName:z.string().trim().min(1).max(120),currency:z.string().trim().toUpperCase().pipe(z.enum(['HKD','CNY'])),amount:z.union([z.string(),z.number()]),merchant:z.string().trim().min(1).max(300),dryRun:z.boolean()});
// Reuse the authenticated snapshot API and its optimistic concurrency checks.
export async function handleCapture(request,env,stateAPI){
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return reply({error:'请使用 POST'},405);
 const headers=new Headers(request.headers);headers.set('Content-Type','application/json');
 const internal=(method,body)=>new Request(new URL('/api/state',request.url),{method,headers,...(body?{body:JSON.stringify(body)}:{})});
 let response=await stateAPI(internal('GET'),env);if(!response.ok)return response;
 let text='';const decoder=new TextDecoder();let size=0;const reader=request.body?.getReader();if(reader){for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply({error:'请求过大'},413);}text+=decoder.decode(value,{stream:true});}}
 text+=decoder.decode();let raw;try{raw=JSON.parse(text);}catch{return reply({error:'请求体不是有效 JSON，请将请求体类型设为 JSON'},400);}
 // Ignore whitespace accidentally pasted around field names, but never guess types.
 if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
  const normalized={};for(const [key,value] of Object.entries(raw)){const name=key.trim();if(Object.hasOwn(normalized,name))return reply({error:'存在重复字段：'+name+'，请只保留一项'},400);normalized[name]=value;}raw=normalized;
 }
 const parsed=schema.safeParse(raw);
 if(!parsed.success){
  const hints={eventId:'请选择文本类型，值须为完整的 8-4-4-4-12 位编号；日期变量若被转换，请先经过“文本”操作',accountName:'字段名必须为 accountName，值为非空文本账户名称',currency:'请填写文本 HKD 或 CNY',amount:'请填写文本或数字金额，例如 0.01',merchant:'请填写非空文本商户名称',dryRun:'请使用布尔值类型（开关），不能填写文本 True'};
  const fields=[...new Set(parsed.error.issues.map(i=>String(i.path[0]||'请求体')))];
  const details=fields.map(field=>{const value=raw?.[field];return {field,receivedType:value===undefined?'missing':value===null?'null':Array.isArray(value)?'array':typeof value};});
  return reply({error:details.map(d=>d.field+'（'+({missing:'未收到该字段',object:'收到字典对象',array:'收到列表',boolean:'收到布尔值',string:'收到文本',number:'收到数字',null:'收到空值'}[d.receivedType]||d.receivedType)+'）：'+(hints[d.field]||'字段类型错误')).join('；'),fields,details,receivedKeys:raw&&typeof raw==='object'?Object.keys(raw):[]},400);
 }
 const data=parsed.data;let amount;try{amount=cents(data.amount);if(amount<=0)throw Error();}catch{return reply({error:'amount：金额须为正数，最多两位小数，例如 0.01',fields:['amount']},400);}
 const id=await uuidFor('apple-pay|'+data.eventId);
 for(let attempt=0;attempt<4;attempt++){
  const snapshot=await response.json(),state=snapshot.state;
  const accounts=state.accounts.filter(a=>a.name===data.accountName&&a.currency===data.currency);
  if(accounts.length!==1)return reply({error:'请先同步账本，并填写唯一且币种相符的现有账户名称'},400);
  const account=accounts[0],existing=state.transactions.find(t=>t.id===id);
  const note='Apple Pay · '+data.merchant;
  if(existing){if(existing.account!==account.id||existing.amount!==amount||existing.note!==note)return reply({error:'eventId 已用于另一笔交易，不能覆盖'},409);return reply({ok:true,duplicate:true,message:'此笔已记录，未重复记账'});}
  if(data.dryRun)return reply({ok:true,dryRun:true,message:'连接和字段校验通过，未写入账本'});
  state.transactions.push({id,type:'expense',account:account.id,to:'',amount,received:0,fee:0,category:categoryFor(data.merchant),note,date:today(),planId:''});
  const saved=await stateAPI(internal('PUT',{revision:snapshot.revision,state}),env);
  if(saved.status!==409){if(!saved.ok)return saved;return reply({ok:true,duplicate:false,message:'已记录 '+data.currency+' '+(amount/100).toFixed(2)+' · '+data.merchant});}
  response=await stateAPI(internal('GET'),env);if(!response.ok)return response;
 }
 return reply({error:'账本正在被其他设备更新，请用同一个 eventId 重试'},409);
}
