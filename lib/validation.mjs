import { z } from 'zod';
const id=z.string().uuid(), money=z.number().int().min(0).max(1e12), positive=money.refine(x=>x>0), text=z.string().trim().min(1).max(120);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===v;});
const currency=z.enum(['HKD','CNY']);
const source=z.object({provider:z.enum(['wechat','hsbc']),key:z.string().regex(/^[a-f0-9]{64}$/),fileId:z.string().regex(/^[a-f0-9]{64}$/),batchId:id,fileName:z.string().max(300),location:z.string().max(200),timestamp:z.string().max(80),status:z.string().max(120),raw:z.record(z.string().max(4000))});
const importBatch=z.object({id,provider:z.enum(['wechat','hsbc']),fileName:z.string().max(300),fileId:z.string().regex(/^[a-f0-9]{64}$/),importedAt:z.string().max(40),detected:z.number().int().min(0),added:z.number().int().min(0),duplicates:z.number().int().min(0),keys:z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(20000),newAccounts:z.array(id).max(100),checks:z.array(z.object({label:z.string().max(300),ok:z.boolean(),expected:z.number().nullable(),actual:z.number().nullable()})).max(10000)});
const observation=z.object({id,date,value:z.number().positive().max(1e15),source:z.string().trim().min(1).max(1000),note:z.string().max(2000),benchmark:z.number().positive().max(1e15).nullable()});
const event=z.object({id,title:text,url:z.string().url().max(2000).refine(v=>/^https?:\/\//.test(v)),source:text,eventDate:date,recordedAt:z.string().max(40),target:text,hypothesis:z.string().trim().min(1).max(4000),direction:z.enum(['up','down','flat']),baseline:z.number().positive().max(1e15),benchmarkBaseline:z.number().positive().max(1e15).nullable(),horizon:date,invalidates:z.string().trim().min(1).max(2000),confidence:z.number().int().min(0).max(100),archived:z.boolean(),observations:z.array(observation).max(5000),reviews:z.array(z.object({id,at:z.string().max(40),text:z.string().trim().min(1).max(4000),outcome:z.enum(['supported','mixed','rejected','unclear'])})).max(1000)}).refine(e=>e.horizon>=e.eventDate,{message:'观察截止日不能早于事件日期'});
export const stateSchema=z.object({
 accounts:z.array(z.object({id,name:text,currency,opening:z.number().int().min(-1e12).max(1e12),importRef:z.string().max(100).optional(),openingDate:date.optional()})).max(100),
 transactions:z.array(z.object({id,type:z.enum(['income','expense','transfer','movement']),direction:z.enum(['in','out','none']).optional(),account:id,to:z.string().max(36).default(''),amount:money,received:money.default(0),fee:money.default(0),category:text,note:z.string().max(500),date,planId:z.string().max(36).default(''),source:source.optional()})).max(20000),
 plans:z.array(z.object({id,name:text,amount:positive,currency,due:date,paid:z.boolean()})).max(1000),
 settings:z.object({rate:z.number().positive().max(100),daily:z.number().positive().max(1e6),nextIncome:z.union([date,z.literal('')]),rateDate:date}),
 events:z.array(event).max(2000),
 imports:z.array(importBatch).max(2000).default([]),
}).superRefine((s,ctx)=>{
 const ids=[...s.accounts,...s.transactions,...s.plans,...s.events,...s.imports].map(x=>x.id);
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'存在重复记录 ID'});
 const keys=s.transactions.map(t=>t.source?.key).filter(Boolean);if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'存在重复的账单来源记录'});
 for(const t of s.transactions){
  if(t.type!=='movement'&&t.amount<=0)ctx.addIssue({code:'custom',message:'收入、支出和转账金额必须大于零'});
  if(t.type==='movement'&&!t.direction)ctx.addIssue({code:'custom',message:'资金往来必须注明现金方向'});
  if(!s.accounts.some(a=>a.id===t.account))ctx.addIssue({code:'custom',message:'交易账户不存在'});
  if(t.type==='transfer'&&(!s.accounts.some(a=>a.id===t.to)||t.to===t.account||t.received<=0))ctx.addIssue({code:'custom',message:'转入账户或到账金额无效'});
  if(t.planId&&(t.type!=='expense'||!s.plans.some(p=>p.id===t.planId&&p.paid)))ctx.addIssue({code:'custom',message:'关联预留必须存在且标记为已支付'});
 }
 for(const p of s.plans)if(p.paid&&s.transactions.filter(t=>t.planId===p.id).length!==1)ctx.addIssue({code:'custom',message:'已支付预留必须有且只有一笔关联支出'});
});
