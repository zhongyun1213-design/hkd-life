import {test} from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {handleAPI,tokenHash} from '../sync-worker/index.mjs';
import {emptyState} from '../lib/finance.mjs';
import {prepareImport,applyImport} from '../lib/import-apply.mjs';
import {parseWeChat,digest} from '../lib/statement-import.mjs';
function fixture(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../sync-worker/migrations/0001_snapshots.sql',import.meta.url),'utf8'));return {prepare(sql){return {bind(...args){return {async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:result.changes}};}};},async first(){return sqlite.prepare(sql).get();}};}};}
const token='a'.repeat(43),origin='https://app.test';
const req=(method='GET',body,extra={})=>new Request(origin+'/api/state',{method,headers:{Authorization:'Bearer '+token,...extra},...(body?{body:JSON.stringify(body)}:{})});
test('同步 API 验证密钥，不依赖 GPT 账号',async()=>{const env={DB:fixture(),SYNC_TOKEN_HASH:await tokenHash(token)};assert.equal((await handleAPI(new Request(origin+'/api/state'),env)).status,401);assert.equal((await handleAPI(req(),env)).status,200);});
test('数据库真实原子条件写入拒绝旧版本，读回持久数据',async()=>{const env={DB:fixture(),SYNC_TOKEN_HASH:await tokenHash(token)},s=emptyState();s.accounts.push({id:crypto.randomUUID(),name:'现金',currency:'HKD',opening:10000});const results=await Promise.all([handleAPI(req('PUT',{state:s,revision:0}),env),handleAPI(req('PUT',{state:s,revision:0}),env)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const d=await (await handleAPI(req(),env)).json();assert.equal(d.state.accounts[0].opening,10000);assert.equal(d.revision,1);});
test('不允许的跨站来源拒绝，允许列表提供 CORS',async()=>{const env={DB:fixture(),SYNC_TOKEN_HASH:await tokenHash(token),ALLOWED_ORIGINS:'https://owner.github.io'};assert.equal((await handleAPI(req('GET',null,{Origin:'https://other.test'}),env)).status,403);const good=await handleAPI(req('GET',null,{Origin:'https://owner.github.io'}),env);assert.equal(good.headers.get('Access-Control-Allow-Origin'),'https://owner.github.io');});
test('无密钥配置关闭 API；坏账本拒绝保存',async()=>{assert.equal((await handleAPI(req(),{DB:fixture()})).status,503);const env={DB:fixture(),SYNC_TOKEN_HASH:await tokenHash(token)},s=emptyState();s.transactions.push({id:crypto.randomUUID(),account:crypto.randomUUID(),amount:123,type:'expense',category:'餐饮',note:'',date:'2026-01-01'});assert.equal((await handleAPI(req('PUT',{state:s,revision:0}),env)).status,400);});
test('导入流水及批次可同步，旧客户端不能擦除原文',async()=>{const p=parseWeChat([{name:'Sheet1',rows:[['交易时间','交易类型','交易对方','商品','收/支','金额(元)','支付方式','当前状态','交易单号'],['2026-01-01 12:00:00','商户消费','示例商户','示例','支出',1,'零钱','支付成功','example']]}]);const prepared=await prepareImport(p,'example.xlsx',await digest('test')),mapped=Object.fromEntries(prepared.groups.map(g=>[g.id,{account:'new',opening:1000,name:g.name}])),result=await applyImport(emptyState(),prepared,mapped),env={DB:fixture(),SYNC_TOKEN_HASH:await tokenHash(token)};assert.equal((await handleAPI(req('PUT',{state:result.state,revision:0}),env)).status,200);const saved=await(await handleAPI(req(),env)).json();assert.equal(saved.state.imports.length,1);assert.equal(saved.state.transactions[0].source.raw['交易对方'],'示例商户');const broken=structuredClone(saved.state);delete broken.transactions[0].source;assert.equal((await handleAPI(req('PUT',{state:broken,revision:saved.revision}),env)).status,400);});

import {handleCapture} from '../sync-worker/capture.mjs';
test('Apple Pay 接口验证权限、金额、币种、dryRun和幂等，保留已有账本',async()=>{
 const env={DB:fixture(),SYNC_TOKEN_HASH:await tokenHash(token)},s=emptyState();s.accounts.push({id:crypto.randomUUID(),name:'测试卡',currency:'HKD',opening:10000});await handleAPI(req('PUT',{revision:0,state:s}),env);
 const body={eventId:crypto.randomUUID(),accountName:'测试卡',currency:'HKD',amount:'12.34',merchant:'NETHAO LIMITED',dryRun:false};
 const send=(b,auth=true)=>handleCapture(new Request(origin+'/api/capture/apple-pay',{method:'POST',headers:auth?{Authorization:'Bearer '+token}:{},body:JSON.stringify(b)}),env,handleAPI);
 assert.equal((await send(body,false)).status,401);assert.equal((await send({...body,amount:'0'})).status,400);assert.equal((await send({...body,currency:'CNY'})).status,400);
 assert.equal((await(await send({...body,dryRun:true})).json()).dryRun,true);assert.equal((await(await handleAPI(req(),env)).json()).state.transactions.length,0);
 assert.equal((await send(body)).status,200);assert.equal((await(await send(body)).json()).duplicate,true);assert.equal((await send({...body,amount:'20'})).status,409);
 const saved=await(await handleAPI(req(),env)).json();assert.equal(saved.state.transactions.length,1);assert.equal(saved.state.transactions[0].amount,1234);assert.equal(saved.state.transactions[0].category,'娱乐');assert.equal(saved.state.accounts[0].opening,10000);
});

test('快捷指令字段错误准确指出字段，时间格式编号可通过UUID校验',async()=>{
 const env={DB:fixture(),SYNC_TOKEN_HASH:await tokenHash(token)},s=emptyState();s.accounts.push({id:crypto.randomUUID(),name:'测试卡',currency:'HKD',opening:0});await handleAPI(req('PUT',{revision:0,state:s}),env);
 const body={eventId:'20261114-0128-4000-8000-471360000000',accountName:'测试卡',currency:'HKD',amount:'0.01',merchant:'连接测试',dryRun:true};
 const send=b=>handleCapture(new Request(origin+'/api/capture/apple-pay',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(b)}),env,handleAPI);
 assert.equal((await send(body)).status,200);
 const spaced={...body,'currency ':' hkd ','amount ':'0.01','merchant ':'连接测试'};delete spaced.currency;delete spaced.amount;delete spaced.merchant;assert.equal((await send(spaced)).status,200);
 const nested=await(await send({...body,amount:{value:'0.01'}})).json();assert.equal(nested.details[0].receivedType,'object');assert.equal(Object.hasOwn(nested.details[0],'value'),false);
 const missing={...body};delete missing.dryRun;assert.equal((await send(missing)).status,400);
 for(const [field,value] of [['eventId','2026-11-14'],['dryRun','True'],['accountName',null],['amount','not money']]){const r=await send({...body,[field]:value});assert.equal(r.status,400);assert.deepEqual((await r.json()).fields,[field]);}
});
